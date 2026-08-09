/**
 * POST /api/admin/orders/storefront/[id]/mark-delivered
 *
 * Manually mark a storefront order as delivered. This is the admin-side
 * fallback for orders whose carrier webhook isn't wired up (or hasn't
 * fired yet). Runs through the same notifyOrderDelivered() helper as the
 * UPS/USPS webhook flow, so the customer gets the email + in-app
 * notification + the order status flips to 'delivered'.
 *
 * Body (all optional):
 *   trackingNumber?: string
 *   carrier?:        string  (defaults to "UPS")
 *   deliveredAt?:    ISO string (defaults to now)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { notifyOrderDelivered } from '@/lib/order-events';
import { STOREFRONT_ORDER_NOTE_PREFIX } from '@/lib/auto-shipping';
import { recordAudit } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const trackingOverride: string | null = body.trackingNumber || null;
  const carrierOverride: string | null = body.carrier || null;
  const deliveredAtOverride: Date | null = body.deliveredAt ? new Date(body.deliveredAt) : null;

  try {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (order.status === 'delivered') {
      return NextResponse.json({ ok: true, alreadyDelivered: true });
    }

    // Pull the linked Shipment so we use the same tracking/carrier the customer
    // already saw in their shipping email — unless the admin explicitly overrode.
    const shipment = await prisma.shipment.findFirst({
      where: { notes: { contains: `${STOREFRONT_ORDER_NOTE_PREFIX}${id}` } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);

    const trackingNumber = trackingOverride ?? shipment?.trackingNumber ?? null;
    const carrier = carrierOverride ?? shipment?.carrier ?? 'UPS';
    const deliveredAt = deliveredAtOverride ?? shipment?.actualDelivery ?? new Date();

    // Also stamp the shipment as delivered if we have one — keeps the
    // detail page's "Shipment" panel honest.
    if (shipment) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { status: 'delivered', actualDelivery: deliveredAt },
      }).catch((err) => console.error('[mark-delivered] shipment update failed:', err));
    }

    // notifyOrderDelivered flips Order.status -> 'delivered', sends
    // order_delivered email, creates in-app notification. Idempotent.
    await notifyOrderDelivered(id, { trackingNumber, carrier, deliveredAt });

    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'Order',
      entityId: id,
      summary: `Marked delivered${trackingNumber ? ` (${carrier} ${trackingNumber})` : ''}`,
      diff: { trackingNumber, carrier, deliveredAt: deliveredAt.toISOString() },
    });

    return NextResponse.json({ ok: true, trackingNumber, carrier, deliveredAt });
  } catch (error) {
    console.error('[mark-delivered]', error);
    return NextResponse.json({ error: 'Failed to mark delivered' }, { status: 500 });
  }
}
