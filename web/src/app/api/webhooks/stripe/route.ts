/**
 * Stripe Webhook Handler
 * ─────────────────────────────────────────────────────────────────
 * Endpoint: POST /api/webhooks/stripe
 *
 * Stripe POSTs every payment event to this URL. We verify the signature
 * with STRIPE_WEBHOOK_SECRET, then sync our DB so payment + order status
 * always reflects reality — even for async methods (Bank/Klarna) that
 * settle minutes or days after the customer leaves the checkout page.
 *
 * Events handled:
 *   payment_intent.succeeded        → mark payment 'succeeded', order 'scheduled'
 *   payment_intent.processing       → mark payment 'processing' (ACH pending)
 *   payment_intent.payment_failed   → mark payment 'failed'
 *   payment_intent.canceled         → mark payment 'cancelled'
 *   charge.refunded                 → mark payment 'refunded'
 *   charge.dispute.created          → log dispute, mark payment 'disputed'
 *
 * Idempotency: Stripe retries delivery on any non-2xx response, so we
 * check current state before mutating. Re-processing a succeeded payment
 * is a no-op, not a duplicate charge.
 *
 * Setup:
 *   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
 *   2. URL: https://www.awulak.com/api/webhooks/stripe
 *   3. Select events listed above (or "Select all")
 *   4. Copy the Signing secret (whsec_...) → Railway env STRIPE_WEBHOOK_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import prisma from '@/lib/prisma';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { autoCreateShipmentForOrder } from '@/lib/auto-shipping';
import { notifyOrderPlaced } from '@/lib/order-events';
import { abandonStalePendingOrders } from '@/lib/orders';
import { deductStockForOrder } from '@/lib/stock';
import { sendConsultationConfirmationEmail } from '@/lib/email';

// Stripe requires the raw, unparsed request body to verify the signature.
// In the App Router, request.text() gives us exactly that.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Pre-flight: Stripe must be configured + webhook secret must be set
  if (!isStripeConfigured()) {
    console.error('[stripe-webhook] Stripe is not configured');
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET is not set in environment' },
      { status: 503 }
    );
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await request.text();

  // Verify the signature & parse the event
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] Signature verification failed:', message);
    return NextResponse.json({ error: `Invalid signature: ${message}` }, { status: 400 });
  }

  console.log(`[stripe-webhook] received ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.processing':
        await handlePaymentIntentProcessing(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.canceled':
        await handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      default:
        // Unhandled types are not failures — just acknowledge so Stripe stops retrying.
        console.log(`[stripe-webhook] ignored event type ${event.type}`);
    }
  } catch (err) {
    // Log + return 500 so Stripe will retry. If we returned 200 on internal error,
    // we'd silently lose the event.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe-webhook] handler failed for ${event.type} (${event.id}):`, message);
    return NextResponse.json(
      { error: `Handler failed: ${message}`, eventId: event.id, eventType: event.type },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true, eventId: event.id });
}

// ─── Event Handlers ─────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: pi.id },
  });

  if (!payment) {
    console.warn(`[stripe-webhook] payment_intent ${pi.id} succeeded but no matching Payment record`);
    return;
  }

  // Idempotency: already marked succeeded → nothing to do
  if (payment.status === 'succeeded') {
    console.log(`[stripe-webhook] payment ${payment.id} already succeeded — skipping`);
    return;
  }

  // Extract card metadata from the charge if available
  const charge = pi.latest_charge && typeof pi.latest_charge !== 'string' ? pi.latest_charge : null;
  const card = charge?.payment_method_details?.card;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'succeeded',
      paymentMethod: typeof pi.payment_method === 'string'
        ? pi.payment_method
        : pi.payment_method?.id || payment.paymentMethod || 'card',
      last4: card?.last4 || payment.last4,
      brand: card?.brand || payment.brand,
      receipt_url: charge?.receipt_url || payment.receipt_url,
    },
  });

  if (payment.orderId) {
    // Move the order to the next workflow stage — only from a pre-payment
    // state, so we don't trample manual admin status changes. `abandoned` is
    // included so an order that was cleaned up as a stale checkout attempt is
    // still recovered if its PaymentIntent later clears.
    const order = await prisma.order.findUnique({ where: { id: payment.orderId } });
    if (order && (['pending', 'abandoned'].includes(order.status) || !order.status)) {
      await prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'scheduled' },
      });
    }

    // Clear the buyer's other never-paid checkout attempts so the paid order
    // isn't shadowed by a leftover "pending payment" row.
    await abandonStalePendingOrders(payment.userId, payment.orderId);

    // Fan out everything that should happen when an order is paid:
    //   - customer confirmation email
    //   - admin in-app notifications (bell)
    //   - founder email alert
    // notifyOrderPlaced is idempotent so Stripe retries won't double-send.
    notifyOrderPlaced({ orderId: payment.orderId }).catch((err) => {
      console.error('[stripe-webhook] notifyOrderPlaced error:', err);
    });

    // Decrement colorStock / sizeStock on the linked AdminProduct.
    // deductStockForOrder is idempotent (stockDeducted flag) so retries are safe.
    deductStockForOrder(payment.orderId).catch((err) => {
      console.error('[stripe-webhook] deductStockForOrder error:', err);
    });
    // Note: shipping label is NOT auto-created here. Admin uses the
    // "Get Label" button on the Orders page to purchase postage when ready.
  }

  // Consultation payments carry the consultationId in the PaymentIntent
  // metadata (set in /api/consultations/book). On success, promote the
  // consultation out of 'pending_payment' so it shows as confirmed on the
  // customer dashboard.
  const consultationId = pi.metadata?.consultationId;
  if (consultationId) {
    try {
      const consultation = await prisma.consultation.findUnique({
        where: { id: consultationId },
        select: {
          id: true,
          status: true,
          date: true,
          meetingLink: true,
          user: { select: { email: true, name: true } },
          booking: {
            select: {
              id: true,
              customerEmail: true,
              customerName: true,
              slot: { select: { duration: true } },
            },
          },
        },
      });
      if (consultation && consultation.status === 'pending_payment') {
        await prisma.consultation.update({
          where: { id: consultationId },
          data: { status: 'scheduled' },
        });
        // Also flip the admin-visible ConsultationBooking row (created at
        // checkout) from pending_payment → confirmed so the admin sees it
        // as a confirmed appointment, not a pending charge.
        await prisma.consultationBooking.updateMany({
          where: { consultationId, status: 'pending_payment' },
          data: { status: 'confirmed' },
        }).catch((err) => console.error('[stripe-webhook] booking status update failed:', err));
        console.log(`[stripe-webhook] consultation ${consultationId} → scheduled`);

        // Now that payment cleared, send the booking confirmation email.
        // The booking flow doesn't email paid consultations up front (they're
        // still 'pending_payment'), so this is the customer's confirmation.
        // Best-effort — a mail failure must never fail the webhook (Stripe
        // would retry and we'd double-process the payment).
        const toEmail = consultation.booking?.customerEmail || consultation.user?.email;
        if (toEmail) {
          await sendConsultationConfirmationEmail({
            to: toEmail,
            name: consultation.booking?.customerName || consultation.user?.name || null,
            date: consultation.date,
            time: pi.metadata?.time || '',
            type: pi.metadata?.consultationType || 'Consultation',
            duration: consultation.booking?.slot?.duration ?? 45,
            bookingRef: `BK-${(consultation.booking?.id || consultation.id).slice(-6).toUpperCase()}`,
            meetingLink: consultation.meetingLink,
          }).catch((err) =>
            console.error('[stripe-webhook] consultation confirmation email failed:', err),
          );
        }
      }
    } catch (err) {
      console.error('[stripe-webhook] consultation status update failed:', err);
    }
  }

  console.log(`[stripe-webhook] payment ${payment.id} marked succeeded; order ${payment.orderId} → scheduled`);
}

async function handlePaymentIntentProcessing(pi: Stripe.PaymentIntent) {
  // Triggered for async methods like ACH bank debits while funds clear.
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: pi.id },
  });
  if (!payment) return;
  if (payment.status === 'succeeded' || payment.status === 'processing') return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'processing' },
  });
  console.log(`[stripe-webhook] payment ${payment.id} → processing (awaiting bank settlement)`);
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: pi.id },
  });
  if (!payment) return;
  if (payment.status === 'failed') return;

  const failureMessage = pi.last_payment_error?.message || 'Payment failed';

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'failed',
      description: payment.description
        ? `${payment.description} | Failed: ${failureMessage}`
        : `Failed: ${failureMessage}`,
    },
  });
  console.log(`[stripe-webhook] payment ${payment.id} → failed (${failureMessage})`);
}

async function handlePaymentIntentCanceled(pi: Stripe.PaymentIntent) {
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: pi.id },
  });
  if (!payment) return;
  if (payment.status === 'cancelled' || payment.status === 'refunded') return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'cancelled' },
  });
  console.log(`[stripe-webhook] payment ${payment.id} → cancelled`);
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const piId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!piId) return;

  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: piId },
  });
  if (!payment) return;
  if (payment.status === 'refunded') return;

  // Partial vs full refund — Stripe's `amount_refunded` is in cents on the charge
  const fullyRefunded = charge.amount_refunded >= charge.amount;
  const status = fullyRefunded ? 'refunded' : 'partially_refunded';

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status },
  });

  // If fully refunded, mark the order cancelled so it doesn't ship.
  if (fullyRefunded && payment.orderId) {
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { status: 'cancelled' },
    });
  }

  console.log(
    `[stripe-webhook] payment ${payment.id} → ${status} (${charge.amount_refunded / 100} of ${charge.amount / 100})`
  );
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;

  // Look up the payment via the charge → payment_intent chain
  const stripe = getStripe();
  const charge = await stripe.charges.retrieve(chargeId);
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return;

  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: piId },
  });
  if (!payment) return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'disputed',
      description: payment.description
        ? `${payment.description} | DISPUTE: ${dispute.reason}`
        : `DISPUTE: ${dispute.reason}`,
    },
  });

  console.warn(`[stripe-webhook] DISPUTE on payment ${payment.id}: ${dispute.reason} (${dispute.amount / 100})`);
}
