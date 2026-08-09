/**
 * POST /api/admin/orders/storefront/[id]/resend-shipping
 *
 * Re-sends the shipping_update email to the customer using the tracking
 * info already on the linked Shipment. Useful when the customer says
 * "I didn't receive the tracking email" or you updated the tracking
 * number after the first mark-shipped.
 *
 * No status changes happen here — order stays at 'shipped' (or wherever
 * it is). This is purely a re-notify.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { notifyOrderShipped } from '@/lib/order-events';
import { STOREFRONT_ORDER_NOTE_PREFIX } from '@/lib/auto-shipping';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const shipment = await prisma.shipment.findFirst({
      where: { notes: { contains: `${STOREFRONT_ORDER_NOTE_PREFIX}${id}` } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);

    const trackingNumber = shipment?.trackingNumber || null;
    const carrier = shipment?.carrier || 'UPS';

    if (!trackingNumber) {
      return NextResponse.json(
        { error: 'No tracking number on this order yet. Mark as shipped first.' },
        { status: 400 }
      );
    }

    // notifyOrderShipped is idempotent on status, but always sends the email.
    // It also creates an in-app notification on each call — that's fine here
    // since the admin is intentionally re-notifying.
    await notifyOrderShipped(id, { trackingNumber, carrier });

    return NextResponse.json({ ok: true, trackingNumber, carrier });
  } catch (error) {
    console.error('[resend-shipping]', error);
    return NextResponse.json({ error: 'Failed to resend shipping email' }, { status: 500 });
  }
}
