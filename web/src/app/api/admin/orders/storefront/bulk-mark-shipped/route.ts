/**
 * POST /api/admin/orders/storefront/bulk-mark-shipped
 *
 * Marks multiple storefront orders as shipped in a single request.
 * Each order can optionally have its own tracking number; if a global
 * `carrier` and/or `trackingNumber` is supplied, it's used as the default.
 *
 * Body:
 *   orderIds: string[]              required
 *   carrier?: string                default "UPS"
 *   trackingNumber?: string         default null
 *   trackingNumbers?: Record<orderId, string>  per-order override
 *
 * Response:
 *   { processed, succeeded, failed: [{orderId, reason}] }
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { notifyOrderShipped } from '@/lib/order-events';
import { STOREFRONT_ORDER_NOTE_PREFIX } from '@/lib/auto-shipping';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const body = await req.json().catch(() => ({}));
  const orderIds: string[] = Array.isArray(body.orderIds) ? body.orderIds : [];
  const carrier: string = body.carrier || 'UPS';
  const defaultTracking: string | null = body.trackingNumber || null;
  const trackingMap: Record<string, string> = body.trackingNumbers || {};

  if (orderIds.length === 0) {
    return NextResponse.json({ error: 'orderIds is required' }, { status: 400 });
  }

  const succeeded: string[] = [];
  const failed: { orderId: string; reason: string }[] = [];

  for (const orderId of orderIds) {
    try {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) {
        failed.push({ orderId, reason: 'not_found' });
        continue;
      }

      // Skip if already shipped/delivered — don't re-notify the customer
      if (order.status === 'shipped' || order.status === 'delivered') {
        failed.push({ orderId, reason: 'already_shipped' });
        continue;
      }

      const tracking = trackingMap[orderId] || defaultTracking;

      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'shipped' },
      });

      if (tracking) {
        const existing = await prisma.shipment.findFirst({
          where: { notes: { contains: `${STOREFRONT_ORDER_NOTE_PREFIX}${orderId}` } },
        }).catch(() => null);

        if (existing) {
          await prisma.shipment.update({
            where: { id: existing.id },
            data: { trackingNumber: tracking, carrier, status: 'shipped', shippedAt: new Date() },
          }).catch((err) => console.error('[bulk-mark-shipped] shipment update failed:', err));
        }
      }

      await notifyOrderShipped(orderId, { trackingNumber: tracking, carrier });
      succeeded.push(orderId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown_error';
      console.error(`[bulk-mark-shipped] order ${orderId}:`, reason);
      failed.push({ orderId, reason });
    }
  }

  return NextResponse.json({
    processed: orderIds.length,
    succeeded: succeeded.length,
    failed,
  });
}
