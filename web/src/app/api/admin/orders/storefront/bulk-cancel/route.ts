/**
 * POST /api/admin/orders/storefront/bulk-cancel
 *
 * Soft-cancels multiple storefront orders in one request (sets
 * status='cancelled'). Does NOT issue Stripe refunds — admin must do
 * those separately. Already-cancelled / shipped / delivered orders are
 * skipped, not errored, so a careless multi-select doesn't blow up.
 *
 * Body:
 *   orderIds: string[]   required
 *
 * Returns:
 *   { processed, cancelled, skipped: [{orderId, reason}] }
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const body = await req.json().catch(() => ({}));
  const orderIds: string[] = Array.isArray(body.orderIds) ? body.orderIds : [];

  if (orderIds.length === 0) {
    return NextResponse.json({ error: 'orderIds is required' }, { status: 400 });
  }

  const cancelled: string[] = [];
  const skipped: { orderId: string; reason: string }[] = [];

  for (const orderId of orderIds) {
    try {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) {
        skipped.push({ orderId, reason: 'not_found' });
        continue;
      }
      // Don't silently cancel things that are already terminal — admin
      // should issue a refund / contact the customer instead
      if (['cancelled', 'refunded', 'shipped', 'delivered'].includes(order.status)) {
        skipped.push({ orderId, reason: `already_${order.status}` });
        continue;
      }
      await prisma.order.update({ where: { id: orderId }, data: { status: 'cancelled' } });
      cancelled.push(orderId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown_error';
      console.error(`[bulk-cancel] order ${orderId}:`, reason);
      skipped.push({ orderId, reason });
    }
  }

  return NextResponse.json({
    processed: orderIds.length,
    cancelled: cancelled.length,
    skipped,
  });
}
