/**
 * Shipping notification helpers — server-side
 * Creates in-app notifications + ShipmentEvents when shipment status changes
 *
 * Three order types flow through here:
 *   - AdminOrder  (linked via shipment.adminOrderId)
 *   - CustomOrder (linked via shipment.customOrderId)
 *   - Order (storefront) — NOT a foreign key; linked via the magic note
 *     `STOREFRONT_ORDER:<orderId>` that auto-shipping.ts writes when it
 *     creates the shipment.
 *
 * Storefront orders get full email + status-flip treatment via the
 * order-events helpers; the older order types still use the in-line
 * Notification creation below.
 */

import { prisma } from '@/lib/prisma';
import { STOREFRONT_ORDER_NOTE_PREFIX } from '@/lib/auto-shipping';
import { notifyOrderDelivered, notifyOrderShipped } from '@/lib/order-events';

/**
 * Extract every storefront orderId linked to a shipment. The note prefix is
 * used by auto-shipping (and the combine route, which writes one prefix per
 * order on a single combined shipment); the storefrontOrderId FK is used by
 * the admin Shipping & Labels manual-buy path. Returning all of them keeps
 * combined shipments from leaving sibling orders stuck on "processing".
 */
function extractStorefrontOrderIds(shipment: {
  storefrontOrderId?: string | null;
  notes?: string | null;
}): string[] {
  const ids = new Set<string>();
  if (shipment.storefrontOrderId) ids.add(shipment.storefrontOrderId);
  if (shipment.notes) {
    const re = new RegExp(`${STOREFRONT_ORDER_NOTE_PREFIX}([A-Za-z0-9_-]+)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(shipment.notes)) !== null) ids.add(m[1]);
  }
  return Array.from(ids);
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  label_created: 'Label Created',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  returned: 'Returned',
  exception: 'Exception',
};

/**
 * Record a ShipmentEvent and optionally notify the customer
 */
export async function recordShipmentEvent(
  shipmentId: string,
  status: string,
  opts?: { description?: string; location?: string; source?: string }
) {
  await prisma.shipmentEvent.create({
    data: {
      shipmentId,
      status,
      description: opts?.description || `Status changed to ${STATUS_LABELS[status] || status}`,
      location: opts?.location,
      source: opts?.source || 'system',
    },
  });
}

/**
 * Update shipment status + record event + create user notification
 */
export async function updateShipmentStatus(
  shipmentDbId: string,
  newStatus: string,
  opts?: { description?: string; location?: string; source?: string }
) {
  const shipment = await prisma.shipment.update({
    where: { id: shipmentDbId },
    data: {
      status: newStatus,
      ...(newStatus === 'delivered' ? { actualDelivery: new Date() } : {}),
      ...(newStatus === 'picked_up' || newStatus === 'in_transit' ? { shippedAt: new Date() } : {}),
    },
  });

  // Record event
  await recordShipmentEvent(shipmentDbId, newStatus, opts);

  // ─── Storefront order(s)? Route through the rich order-events helpers ─
  // (They handle status flip on Order, customer email via order_delivered /
  // shipping_update templates, plus the in-app notification — all idempotent.)
  const storefrontOrderIds = extractStorefrontOrderIds(shipment);
  if (storefrontOrderIds.length > 0) {
    for (const storefrontOrderId of storefrontOrderIds) {
      try {
        if (newStatus === 'delivered') {
          await notifyOrderDelivered(storefrontOrderId, {
            trackingNumber: shipment.trackingNumber,
            carrier: shipment.carrier,
            deliveredAt: shipment.actualDelivery || new Date(),
          });
        } else if (newStatus === 'picked_up' || newStatus === 'in_transit' || newStatus === 'out_for_delivery') {
          // Only emit the "shipped" email once — notifyOrderShipped flips
          // Order.status from pending/processing/scheduled to 'shipped' so
          // subsequent transit events are no-ops.
          const order = await prisma.order.findUnique({
            where: { id: storefrontOrderId },
            select: { status: true },
          });
          if (order && !['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status)) {
            await notifyOrderShipped(storefrontOrderId, {
              trackingNumber: shipment.trackingNumber,
              carrier: shipment.carrier,
            });
          }
        }
      } catch (err) {
        console.error('[shipping-notifications] storefront order sync failed:', err);
      }
    }
    // Storefront flow handles its own notifications — skip the AdminOrder/
    // CustomOrder branches below.
    return shipment;
  }

  // Try to find the customer userId from the linked order
  let userId: string | null = null;
  if (shipment.adminOrderId) {
    const order = await prisma.adminOrder.findUnique({
      where: { id: shipment.adminOrderId },
      include: { client: { select: { email: true } } },
    });
    if (order?.client?.email) {
      const user = await prisma.user.findUnique({ where: { email: order.client.email } });
      userId = user?.id || null;
    }
  }
  if (!userId && shipment.customOrderId) {
    const order = await prisma.customOrder.findUnique({
      where: { id: shipment.customOrderId },
      include: { client: { select: { email: true } } },
    });
    if (order?.client?.email) {
      const user = await prisma.user.findUnique({ where: { email: order.client.email } });
      userId = user?.id || null;
    }
  }

  // Create in-app notification if we have a user
  if (userId) {
    const notificationType = newStatus === 'delivered' ? 'shipment_delivered' : 'shipment_status_changed';
    const title = newStatus === 'delivered'
      ? 'Order Delivered!'
      : `Shipment Update: ${STATUS_LABELS[newStatus] || newStatus}`;
    const message = newStatus === 'delivered'
      ? `Your shipment ${shipment.shipmentId} has been delivered!`
      : `Your shipment ${shipment.shipmentId} is now ${STATUS_LABELS[newStatus] || newStatus}.`;

    try {
      await prisma.notification.create({
        data: {
          userId,
          type: notificationType,
          title,
          message,
          relatedId: shipment.shipmentId,
        },
      });
    } catch {
      // Notification creation failed — non-critical
      console.error('Failed to create shipment notification');
    }
  }

  return shipment;
}
