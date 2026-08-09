import prisma from '@/lib/prisma';

/**
 * A storefront `Order` is created the moment a customer STARTS checkout — the
 * cart posts to /api/orders, "Buy now" / guest checkout posts to /api/checkout
 * — and it defaults to status `pending`. If the customer never completes THAT
 * attempt (they refresh, go back, re-add items, or just leave), the row lingers
 * as `pending` forever and clutters the admin Storefront Orders list, even
 * though it was never a real sale.
 *
 * This marks a user's stale, never-paid `pending` orders as `abandoned` so the
 * list reflects reality: at most one live pending order per customer (their
 * current cart), and none left behind after they pay. Only orders whose payment
 * has NOT succeeded are touched, and `exceptOrderId` (the order just paid or
 * just created) is always preserved.
 *
 * Safe to call on the payment path: it never touches a paid/advanced order, and
 * the payment-success handlers promote `pending` OR `abandoned` → `scheduled`,
 * so an abandoned order whose PaymentIntent later clears is still recovered.
 */
export async function abandonStalePendingOrders(userId: string | null | undefined, exceptOrderId?: string): Promise<number> {
  if (!userId) return 0;
  try {
    const candidates = await prisma.order.findMany({
      where: {
        userId,
        status: 'pending',
        ...(exceptOrderId ? { id: { not: exceptOrderId } } : {}),
      },
      select: { id: true, payment: { select: { status: true } } },
    });
    const ids = candidates.filter((o) => o.payment?.status !== 'succeeded').map((o) => o.id);
    if (!ids.length) return 0;
    const res = await prisma.order.updateMany({
      where: { id: { in: ids } },
      data: { status: 'abandoned' },
    });
    return res.count;
  } catch (err) {
    console.error('[orders] abandonStalePendingOrders failed:', err);
    return 0;
  }
}
