import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/cron/expire-pending-orders
//
// Sweep stale, never-paid storefront orders into "abandoned" so the admin
// Storefront Orders list only shows real orders. A pending Order is created the
// moment checkout starts; the payment + checkout-init handlers already abandon a
// buyer's leftover attempts, but customers who never return leave their pending
// order behind. After the abandoned-cart reminder window (7 days) such an order
// is dead — mark it abandoned. Never touches an order whose payment succeeded.
//
// No customer-facing effect (no emails). Schedule daily, e.g.:
//   30 3 * * *  POST https://www.awulak.com/api/cron/expire-pending-orders
//               Header: Authorization: Bearer ${CRON_SECRET}

const STALE_DAYS = 7;

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.order.findMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    select: { id: true, payment: { select: { status: true } } },
    take: 1000,
  });

  // Only abandon orders with no successful payment.
  const ids = candidates.filter((o) => o.payment?.status !== 'succeeded').map((o) => o.id);

  let abandoned = 0;
  if (ids.length) {
    const res = await prisma.order.updateMany({
      where: { id: { in: ids } },
      data: { status: 'abandoned' },
    });
    abandoned = res.count;
  }

  return NextResponse.json({ checked: candidates.length, abandoned });
}
