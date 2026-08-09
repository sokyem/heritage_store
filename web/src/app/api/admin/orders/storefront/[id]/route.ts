/**
 * GET    /api/admin/orders/storefront/[id]   — full order detail
 * PUT    /api/admin/orders/storefront/[id]   — update status, notes, shipping address
 * DELETE /api/admin/orders/storefront/[id]   — soft cancel (sets status='cancelled')
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { STOREFRONT_ORDER_NOTE_PREFIX } from '@/lib/auto-shipping';
import { recordAudit } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true, createdAt: true } },
        product: true,
        payment: true,
        measurement: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Find the linked Shipment via the note prefix (Shipment doesn't have a
    // direct relation to storefront Order — see auto-shipping.ts).
    const shipment = await prisma.shipment.findFirst({
      where: { notes: { contains: `${STOREFRONT_ORDER_NOTE_PREFIX}${id}` } },
      orderBy: { createdAt: 'desc' },
      include: { events: { orderBy: { occurredAt: 'asc' } } },
    }).catch(() => null);

    // Don't ship the base64 label blob to the client — expose only a flag.
    // The PDF is fetched on demand via /api/admin/shipping/[id]/label.
    const shipmentSafe = shipment
      ? (() => {
          const { labelData, events: _events, ...rest } = shipment;
          return { ...rest, hasLabel: Boolean(labelData) };
        })()
      : null;

    // Build a chronological timeline from the order + payment + shipment.
    // Each entry is a small object the UI can render directly. This keeps
    // the page free of stitching logic and lets us reuse it elsewhere.
    type TimelineEntry = {
      at: string;
      kind:
        | 'placed' | 'paid' | 'refunded' | 'label_created' | 'picked_up'
        | 'in_transit' | 'out_for_delivery' | 'shipped' | 'delivered'
        | 'returned' | 'exception' | 'cancelled' | 'status';
      title: string;
      description?: string | null;
      meta?: string | null;
    };
    const timeline: TimelineEntry[] = [];
    timeline.push({
      at: order.createdAt.toISOString(),
      kind: 'placed',
      title: 'Order placed',
      description: order.user?.email ? `by ${order.user.email}` : null,
    });
    if (order.payment) {
      if (order.payment.status === 'succeeded' || order.payment.status === 'paid') {
        timeline.push({
          at: order.payment.updatedAt.toISOString(),
          kind: 'paid',
          title: 'Payment received',
          description: order.payment.brand && order.payment.last4
            ? `${order.payment.brand.toUpperCase()} •••• ${order.payment.last4}`
            : (order.payment.paymentMethod ?? null),
          meta: order.payment.amount != null
            ? `$${order.payment.amount.toFixed(2)} ${order.payment.currency}`
            : null,
        });
      }
      if (order.payment.status === 'refunded' || order.payment.status === 'partially_refunded') {
        timeline.push({
          at: order.payment.updatedAt.toISOString(),
          kind: 'refunded',
          title: order.payment.status === 'refunded' ? 'Refunded' : 'Partially refunded',
        });
      }
    }
    if (shipment) {
      const labelTitles: Record<string, { title: string; kind: TimelineEntry['kind'] }> = {
        label_created: { title: 'Shipping label created', kind: 'label_created' },
        picked_up: { title: 'Picked up by carrier', kind: 'picked_up' },
        in_transit: { title: 'In transit', kind: 'in_transit' },
        out_for_delivery: { title: 'Out for delivery', kind: 'out_for_delivery' },
        delivered: { title: 'Delivered', kind: 'delivered' },
        returned: { title: 'Returned to sender', kind: 'returned' },
        exception: { title: 'Tracking exception', kind: 'exception' },
      };
      if (shipment.events && shipment.events.length) {
        for (const ev of shipment.events) {
          const mapped = labelTitles[ev.status] || { title: ev.status, kind: 'status' as const };
          timeline.push({
            at: ev.occurredAt.toISOString(),
            kind: mapped.kind,
            title: mapped.title,
            description: ev.description ?? null,
            meta: ev.location ?? null,
          });
        }
      } else {
        // No carrier events yet — synthesize from the shipment record itself.
        if (shipment.shippedAt) {
          timeline.push({
            at: shipment.shippedAt.toISOString(),
            kind: 'shipped',
            title: 'Shipped',
            description: shipment.trackingNumber ? `${shipment.carrier} ${shipment.trackingNumber}` : shipment.carrier,
          });
        } else if (shipment.labelUrl) {
          timeline.push({
            at: shipment.createdAt.toISOString(),
            kind: 'label_created',
            title: 'Shipping label created',
            description: shipment.carrier,
          });
        }
        if (shipment.actualDelivery) {
          timeline.push({
            at: shipment.actualDelivery.toISOString(),
            kind: 'delivered',
            title: 'Delivered',
          });
        }
      }
    }
    if (order.status === 'cancelled') {
      timeline.push({
        at: order.updatedAt.toISOString(),
        kind: 'cancelled',
        title: 'Order cancelled',
      });
    }
    timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    // The storefront Order links to the simple Product by name; the size chart
    // lives on the richer AdminProduct. Match by name so the admin sees the
    // chart for THIS specific product when fulfilling.
    let sizeChart: { image: string | null; data: unknown | null } | null = null;
    if (order.product?.name) {
      const ap = await prisma.adminProduct.findFirst({
        where: { name: order.product.name },
        select: { sizeChartImage: true, sizeChartData: true },
      }).catch(() => null);
      if (ap && (ap.sizeChartImage || ap.sizeChartData)) {
        sizeChart = {
          image: ap.sizeChartImage || null,
          data: ap.sizeChartData ? (() => { try { return JSON.parse(ap.sizeChartData!); } catch { return null; } })() : null,
        };
      }
    }

    return NextResponse.json({
      ...order,
      shortId: order.id.slice(-8).toUpperCase(),
      shipment: shipmentSafe,
      sizeChart,
      timeline,
    });
  } catch (error) {
    console.error('[admin/orders/storefront/[id] GET]', error);
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const body = await req.json();

  // Whitelist editable fields — never let admin edit payment/amount via this endpoint.
  const allowed: Partial<{
    status: string;
    customNotes: string | null;
    shippingName: string | null;
    shippingAddress: string | null;
    shippingAddress2: string | null;
    shippingCity: string | null;
    shippingState: string | null;
    shippingZip: string | null;
    shippingCountry: string | null;
    shippingPhone: string | null;
  }> = {};

  if (typeof body.status === 'string') allowed.status = body.status;
  if ('customNotes' in body) allowed.customNotes = body.customNotes || null;
  if ('shippingName' in body) allowed.shippingName = body.shippingName || null;
  if ('shippingAddress' in body) allowed.shippingAddress = body.shippingAddress || null;
  if ('shippingAddress2' in body) allowed.shippingAddress2 = body.shippingAddress2 || null;
  if ('shippingCity' in body) allowed.shippingCity = body.shippingCity || null;
  if ('shippingState' in body) allowed.shippingState = body.shippingState || null;
  if ('shippingZip' in body) allowed.shippingZip = body.shippingZip || null;
  if ('shippingCountry' in body) allowed.shippingCountry = body.shippingCountry || null;
  if ('shippingPhone' in body) allowed.shippingPhone = body.shippingPhone || null;

  try {
    const order = await prisma.order.update({
      where: { id },
      data: allowed,
      include: {
        user: { select: { email: true, name: true } },
        product: { select: { name: true } },
        payment: true,
      },
    });
    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'Order',
      entityId: id,
      summary: allowed.status ? `Status → ${allowed.status}` : 'Updated storefront order',
      diff: allowed,
    });
    return NextResponse.json(order);
  } catch (error) {
    console.error('[admin/orders/storefront/[id] PUT]', error);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    // Soft cancel rather than hard delete to preserve payment history.
    const order = await prisma.order.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'Order',
      entityId: id,
      summary: 'Cancelled storefront order',
    });
    return NextResponse.json(order);
  } catch (error) {
    console.error('[admin/orders/storefront/[id] DELETE]', error);
    return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 });
  }
}
