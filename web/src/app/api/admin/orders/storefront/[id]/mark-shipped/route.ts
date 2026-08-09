/**
 * POST /api/admin/orders/storefront/[id]/mark-shipped
 *
 * Marks the order as shipped, optionally records a tracking number,
 * and emails the customer + notifies them in-app.
 *
 * Body:
 *   trackingNumber?: string
 *   carrier?: string  (defaults to "UPS")
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { notifyOrderShipped } from '@/lib/order-events';
import { STOREFRONT_ORDER_NOTE_PREFIX, createShipmentRow } from '@/lib/auto-shipping';
import { recordAudit } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const trackingNumber: string | null = body.trackingNumber || null;
  const carrier: string = body.carrier || 'UPS';

  try {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Advance status
    await prisma.order.update({
      where: { id },
      data: { status: 'shipped' },
    });

    // Persist tracking on the linked Shipment row if it exists, otherwise
    // create a minimal Shipment row so we don't lose the tracking number.
    if (trackingNumber) {
      const existing = await prisma.shipment.findFirst({
        where: { notes: { contains: `${STOREFRONT_ORDER_NOTE_PREFIX}${id}` } },
      }).catch(() => null);

      if (existing) {
        await prisma.shipment.update({
          where: { id: existing.id },
          data: {
            trackingNumber,
            carrier,
            status: 'shipped',
            shippedAt: new Date(),
          },
        }).catch((err) => console.error('[mark-shipped] shipment update failed:', err));
      } else {
        // Best-effort minimal record using the canonical Shipment field names
        // and a collision-proof id (the previous inline create omitted the
        // required shipmentId and used non-existent recipient* columns, so it
        // silently failed every time).
        await createShipmentRow({
          trackingNumber,
          carrier,
          status: 'shipped',
          shippedAt: new Date(),
          notes: `${STOREFRONT_ORDER_NOTE_PREFIX}${id}`,
          storefrontOrderId: id,
          recipientName: order.shippingName || '',
          addressLine1: order.shippingAddress || '',
          addressLine2: order.shippingAddress2 || null,
          city: order.shippingCity || '',
          state: order.shippingState || '',
          postalCode: order.shippingZip || '',
          country: order.shippingCountry || 'US',
        }).catch((err) => console.error('[mark-shipped] shipment create failed:', err));
      }
    }

    // Email + notify customer
    await notifyOrderShipped(id, { trackingNumber, carrier });

    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'Order',
      entityId: id,
      summary: `Marked shipped${trackingNumber ? ` (${carrier} ${trackingNumber})` : ''}`,
      diff: { trackingNumber, carrier },
    });

    return NextResponse.json({ ok: true, trackingNumber, carrier });
  } catch (error) {
    console.error('[mark-shipped]', error);
    return NextResponse.json({ error: 'Failed to mark shipped' }, { status: 500 });
  }
}
