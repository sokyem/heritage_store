/**
 * DELETE /api/admin/orders/storefront/[id]/destroy
 *
 * HARD-DELETES a storefront order from the database. Permanently removes
 * the Order row, its linked Payment row, and any Shipment+ShipmentEvent
 * rows tied to it via the STOREFRONT_ORDER notes prefix.
 *
 * This is destructive and irreversible. Use sparingly — for test orders,
 * spam, or rows you accidentally created. For real orders use Cancel
 * Order (soft) + Issue Refund (Stripe).
 *
 * Safety:
 *   - Requires the request body to include { confirm: "DELETE" } literally
 *   - Logs the admin's email + order summary BEFORE deleting so we have a
 *     trail in Railway logs even though the DB row is gone
 *   - Refuses to delete orders whose payment succeeded unless { force: true }
 *     is also set — accidents around real money should be loud
 *
 * Body:
 *   confirm: "DELETE"  (literal string, required)
 *   force?: boolean    (override the succeeded-payment guard)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { STOREFRONT_ORDER_NOTE_PREFIX } from '@/lib/auto-shipping';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const confirm: string = body.confirm || '';
  const force: boolean = body.force === true;

  if (confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Missing or incorrect confirmation. Send { confirm: "DELETE" } in the body.' },
      { status: 400 }
    );
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { payment: true, user: { select: { email: true } } },
    });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Block accidental hard-delete of orders with actual paid money on them
    // unless the admin explicitly forces it.
    if (!force && order.payment?.status === 'succeeded') {
      return NextResponse.json({
        error: 'This order has a SUCCEEDED Stripe payment. Issue a refund first, or pass { confirm: "DELETE", force: true } to delete anyway. The Stripe charge will NOT be refunded by this operation.',
        code: 'payment_succeeded',
      }, { status: 409 });
    }

    // Log a permanent record of what's being deleted (Railway logs survive
    // DB row removal, so this gives us a trail).
    console.warn('[HARD-DELETE]', {
      orderId: order.id,
      shortId: order.id.slice(-8).toUpperCase(),
      amount: order.amount,
      status: order.status,
      paymentStatus: order.payment?.status,
      stripePaymentIntent: order.payment?.stripePaymentIntentId,
      customerEmail: order.user?.email,
      adminEmail: auth.email,
      force,
      at: new Date().toISOString(),
    });

    // Wipe linked Shipment + ShipmentEvents tied to this storefront order via the notes prefix
    const shipments = await prisma.shipment.findMany({
      where: { notes: { contains: `${STOREFRONT_ORDER_NOTE_PREFIX}${id}` } },
    }).catch(() => []);
    for (const s of shipments) {
      await prisma.shipmentEvent.deleteMany({ where: { shipmentId: s.id } }).catch(() => null);
      await prisma.shipment.delete({ where: { id: s.id } }).catch(() => null);
    }

    // Wipe the Payment row (Order doesn't cascade because Order.paymentId is optional)
    if (order.payment) {
      await prisma.order.update({ where: { id }, data: { paymentId: null } });
      await prisma.payment.delete({ where: { id: order.payment.id } }).catch(() => null);
    }

    await prisma.order.delete({ where: { id } });

    return NextResponse.json({ ok: true, deleted: order.id, shortId: order.id.slice(-8).toUpperCase() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[storefront destroy]', message);
    return NextResponse.json({ error: 'Failed to delete order', detail: message }, { status: 500 });
  }
}
