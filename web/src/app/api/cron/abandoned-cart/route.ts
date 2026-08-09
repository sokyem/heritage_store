import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendTemplate } from '@/lib/email';

// POST /api/cron/abandoned-cart
//
// Finds storefront orders where checkout was started but never completed
// — Order.status='pending' with a Payment row still in 'pending' state —
// and emails the customer once with a "did you forget something?" prompt.
//
// Window: created 24h-7d ago. Older than that, the cart is stale and the
// reminder feels weird; newer than that, the customer may still be
// finishing checkout.
//
// Dedup: we create a Notification row of type='abandoned_cart_sent' with
// relatedId=order.id after sending, and skip orders that already have one.
//
// Schedule once a day, e.g. cron-job.org:
//   0 14 * * *  POST https://www.awulak.com/api/cron/abandoned-cart
//               Header: Authorization: Bearer ${CRON_SECRET}

const APP_URL = process.env.NEXTAUTH_URL || 'https://www.awulak.com';

function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = Date.now();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // Candidates: pending storefront orders in the window.
  const orders = await prisma.order.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: oneDayAgo, gte: sevenDaysAgo },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
      product: { select: { name: true } },
      payment: { select: { status: true } },
    },
    take: 100,
  });

  const results: Array<{ orderId: string; status: 'sent' | 'skipped'; reason?: string }> = [];

  for (const order of orders) {
    // Only nudge if checkout was actually started (payment row exists & not paid)
    // OR if the order has no payment row at all (rare — bare cart submission).
    const paid = order.payment?.status &&
      ['succeeded', 'paid', 'completed'].includes(order.payment.status);
    if (paid) {
      results.push({ orderId: order.id, status: 'skipped', reason: 'paid' });
      continue;
    }
    if (!order.user?.email) {
      results.push({ orderId: order.id, status: 'skipped', reason: 'no-email' });
      continue;
    }

    // Skip if we already sent one for this order.
    const already = await prisma.notification.findFirst({
      where: { type: 'abandoned_cart_sent', relatedId: order.id },
      select: { id: true },
    });
    if (already) {
      results.push({ orderId: order.id, status: 'skipped', reason: 'already-sent' });
      continue;
    }

    const sent = await sendTemplate('abandoned_cart', order.user.email, {
      name: order.user.name || 'there',
      productName: order.product?.name || 'your selection',
      amount: fmtUsd(order.amount || 0),
      checkoutUrl: `${APP_URL.replace(/\/$/, '')}/orders/${order.id}`,
    }).catch((err) => {
      console.error('[abandoned-cart] send failed', order.id, err);
      return false;
    });

    if (sent) {
      await prisma.notification.create({
        data: {
          userId: order.user.id,
          type: 'abandoned_cart_sent',
          title: 'Cart reminder sent',
          message: `Reminder email sent for ${order.product?.name || 'order'}`,
          relatedId: order.id,
        },
      }).catch(() => null);
      results.push({ orderId: order.id, status: 'sent' });
    } else {
      results.push({ orderId: order.id, status: 'skipped', reason: 'send-failed' });
    }
  }

  return NextResponse.json({
    checked: orders.length,
    sent: results.filter((r) => r.status === 'sent').length,
    results,
  });
}
