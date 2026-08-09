/**
 * POST /api/admin/orders/storefront/[id]/refund
 *
 * Issues a Stripe refund for a storefront order. Supports full or partial.
 *
 * Body (all optional):
 *   amount?: number   — partial refund amount in dollars. Omit for full refund.
 *   reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent'
 *   notes?: string    — admin note, persisted on the Payment.description
 *
 * Side effects:
 *   - Stripe issues the refund
 *   - Stripe then fires `charge.refunded` webhook → that handler updates the
 *     Payment row (status: refunded/partially_refunded) and, on full refund,
 *     cancels the Order. So we DON'T duplicate that work here — we just
 *     trigger Stripe and trust the webhook.
 *
 * Returns:
 *   { ok, refundId, amount, status, paymentIntentId }
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { recordAudit } from '@/lib/audit';

const VALID_REASONS = new Set(['requested_by_customer', 'duplicate', 'fraudulent']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const rawAmount = body.amount;
  const reason: string | undefined = VALID_REASONS.has(body.reason) ? body.reason : undefined;
  const notes: string | undefined = body.notes ? String(body.notes).trim() : undefined;

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { payment: true },
    });

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const pi = order.payment?.stripePaymentIntentId;
    if (!pi) {
      return NextResponse.json(
        { error: 'No Stripe payment intent on this order — nothing to refund.' },
        { status: 400 }
      );
    }

    if (order.payment?.status !== 'succeeded' && order.payment?.status !== 'partially_refunded') {
      return NextResponse.json(
        { error: `Payment status is "${order.payment?.status}" — only succeeded payments can be refunded.` },
        { status: 400 }
      );
    }

    // Validate partial-refund amount
    let amountCents: number | undefined;
    if (rawAmount !== undefined && rawAmount !== null && rawAmount !== '') {
      const parsed = parseFloat(String(rawAmount));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json({ error: 'Refund amount must be a positive number.' }, { status: 400 });
      }
      amountCents = Math.round(parsed * 100);
      const orderAmountCents = Math.round((order.payment.amount || 0) * 100);
      if (amountCents > orderAmountCents) {
        return NextResponse.json(
          { error: `Refund amount $${parsed.toFixed(2)} exceeds the captured amount $${(orderAmountCents / 100).toFixed(2)}.` },
          { status: 400 }
        );
      }
    }

    const stripe = getStripe();
    const refund = await stripe.refunds.create({
      payment_intent: pi,
      ...(amountCents !== undefined ? { amount: amountCents } : {}),
      ...(reason ? { reason: reason as 'requested_by_customer' | 'duplicate' | 'fraudulent' } : {}),
      metadata: {
        orderId: order.id,
        adminEmail: auth.email || 'unknown',
        ...(notes ? { adminNote: notes.slice(0, 480) } : {}),
      },
    });

    // Reflect the refund in our DB immediately so the order shows as refunded on
    // the front end right away — don't depend solely on the charge.refunded
    // webhook, which can lag or be missed (as it was here). The webhook is
    // idempotent (returns early when already 'refunded'), so this won't conflict.
    if (order.payment) {
      const orderAmountCents = Math.round((order.payment.amount || 0) * 100);
      const fullyRefunded = amountCents === undefined || amountCents >= orderAmountCents;
      await prisma.payment.update({
        where: { id: order.payment.id },
        data: {
          status: fullyRefunded ? 'refunded' : 'partially_refunded',
          // Optimistic note so the admin can see WHO issued the refund.
          ...(notes
            ? {
                description: order.payment.description
                  ? `${order.payment.description} | Refund (${refund.id}): ${notes}`
                  : `Refund (${refund.id}): ${notes}`,
              }
            : {}),
        },
      }).catch((e) => console.error('[storefront refund] optimistic payment update failed:', e));
      // Full refund → cancel the order so it doesn't ship (mirrors the webhook).
      if (fullyRefunded) {
        await prisma.order.update({ where: { id }, data: { status: 'cancelled' } })
          .catch((e) => console.error('[storefront refund] optimistic order update failed:', e));
      }
    }

    await recordAudit({
      actorEmail: auth.email,
      action: 'other',
      entity: 'Refund',
      entityId: refund.id,
      summary: amountCents
        ? `Refunded $${(amountCents / 100).toFixed(2)} on order ${order.id.slice(-8).toUpperCase()}`
        : `Full refund on order ${order.id.slice(-8).toUpperCase()}`,
      diff: { orderId: order.id, paymentIntentId: pi, reason, notes },
    });

    return NextResponse.json({
      ok: true,
      refundId: refund.id,
      amount: (refund.amount || 0) / 100,
      currency: refund.currency,
      status: refund.status,
      paymentIntentId: pi,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[storefront refund]', message);

    // Stripe says the charge is already refunded but our DB still shows it as
    // refundable — the charge.refunded webhook was missed (e.g. a refund issued
    // straight from the Stripe dashboard). Self-heal: sync the payment + order
    // to refunded/cancelled and report it cleanly instead of a 500. Matches
    // Stripe's phrasing "has already been refunded" (note the "been").
    if (/already\s+(?:been\s+)?(?:fully\s+)?refunded|charge_already_refunded/i.test(message)) {
      try {
        const order = await prisma.order.findUnique({ where: { id }, include: { payment: true } });
        if (order?.payment) {
          await prisma.payment.update({ where: { id: order.payment.id }, data: { status: 'refunded' } });
          await prisma.order.update({ where: { id }, data: { status: 'cancelled' } });
        }
      } catch (syncErr) {
        console.error('[storefront refund] DB sync after already-refunded failed:', syncErr);
      }
      return NextResponse.json(
        {
          error: 'This payment was already refunded in Stripe. I synced the order to Refunded — refresh to see it.',
          alreadyRefunded: true,
        },
        { status: 409 },
      );
    }

    // Surface Stripe-specific errors directly so the admin can act
    let hint = 'Failed to issue refund.';
    if (/Invalid amount/i.test(message)) {
      hint = 'Refund amount is invalid for this payment.';
    } else if (/charge.*not.*captured/i.test(message)) {
      hint = 'Cannot refund — the charge has not been captured yet.';
    }

    return NextResponse.json({ error: hint, detail: message }, { status: 500 });
  }
}
