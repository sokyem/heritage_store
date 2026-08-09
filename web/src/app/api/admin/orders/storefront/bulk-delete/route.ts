/**
 * POST /api/admin/orders/storefront/bulk-delete
 *
 * Hard-deletes multiple storefront orders in one request. Same safety
 * gates as the single-order destroy endpoint:
 *   - Body must include { confirm: "DELETE" }
 *   - Orders with succeeded payments are skipped unless { force: true }
 *
 * Body:
 *   orderIds: string[]    required
 *   confirm: "DELETE"     required (literal)
 *   force?: boolean       allow deletion of paid orders (default false)
 *
 * Returns:
 *   { processed, deleted, skipped: [{orderId, reason}] }
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { STOREFRONT_ORDER_NOTE_PREFIX } from '@/lib/auto-shipping';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const body = await req.json().catch(() => ({}));
  const orderIds: string[] = Array.isArray(body.orderIds) ? body.orderIds : [];
  const confirm: string = body.confirm || '';
  const force: boolean = body.force === true;

  if (confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Missing or incorrect confirmation. Send { confirm: "DELETE", orderIds: [...] }' },
      { status: 400 }
    );
  }
  if (orderIds.length === 0) {
    return NextResponse.json({ error: 'orderIds is required' }, { status: 400 });
  }

  const deleted: string[] = [];
  const skipped: { orderId: string; reason: string }[] = [];

  for (const orderId of orderIds) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { payment: true, user: { select: { email: true } } },
      });
      if (!order) {
        skipped.push({ orderId, reason: 'not_found' });
        continue;
      }
      if (!force && order.payment?.status === 'succeeded') {
        skipped.push({ orderId, reason: 'payment_succeeded' });
        continue;
      }

      console.warn('[HARD-DELETE bulk]', {
        orderId: order.id,
        shortId: order.id.slice(-8).toUpperCase(),
        amount: order.amount,
        status: order.status,
        paymentStatus: order.payment?.status,
        adminEmail: auth.email,
        force,
        at: new Date().toISOString(),
      });

      const shipments = await prisma.shipment.findMany({
        where: { notes: { contains: `${STOREFRONT_ORDER_NOTE_PREFIX}${orderId}` } },
      }).catch(() => []);
      for (const s of shipments) {
        await prisma.shipmentEvent.deleteMany({ where: { shipmentId: s.id } }).catch(() => null);
        await prisma.shipment.delete({ where: { id: s.id } }).catch(() => null);
      }

      if (order.payment) {
        await prisma.order.update({ where: { id: orderId }, data: { paymentId: null } });
        await prisma.payment.delete({ where: { id: order.payment.id } }).catch(() => null);
      }

      await prisma.order.delete({ where: { id: orderId } });
      deleted.push(orderId);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown_error';
      console.error(`[bulk-delete] order ${orderId}:`, reason);
      skipped.push({ orderId, reason });
    }
  }

  return NextResponse.json({
    processed: orderIds.length,
    deleted: deleted.length,
    skipped,
  });
}
