import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendTemplate } from '@/lib/email';

// POST /api/cron/daily-digest
//
// Sends a once-daily summary email of the prior day's business activity
// (revenue, orders, consultations, new customers) to the founder(s).
//
// Schedule once a day around 7-8 AM, e.g. cron-job.org:
//   0 7 * * *  POST https://www.awulak.com/api/cron/daily-digest
//              Header: Authorization: Bearer ${CRON_SECRET}

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

  // Window = yesterday 00:00 → today 00:00 (local server time).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const periodLabel = yesterday.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const range = { gte: yesterday, lt: today };

  // Aggregate yesterday's activity. .catch keeps the digest sending even if
  // one query fails on an out-of-sync schema.
  const [
    paidSum,
    refundedSum,
    orderCount,
    consultationCount,
    newCustomerCount,
    returnsOpened,
    pendingShipments,
  ] = await Promise.all([
    prisma.payment
      .aggregate({
        where: { createdAt: range, status: { in: ['succeeded', 'paid', 'completed'] } },
        _sum: { amount: true },
      })
      .catch(() => ({ _sum: { amount: 0 } } as { _sum: { amount: number | null } })),
    prisma.payment
      .aggregate({
        where: { createdAt: range, status: { in: ['refunded', 'partially_refunded'] } },
        _sum: { amount: true },
      })
      .catch(() => ({ _sum: { amount: 0 } } as { _sum: { amount: number | null } })),
    prisma.order.count({ where: { createdAt: range } }).catch(() => 0),
    prisma.consultationBooking.count({ where: { createdAt: range } }).catch(() => 0),
    prisma.user
      .count({ where: { createdAt: range, role: 'customer' } })
      .catch(() => 0),
    prisma.returnRequest.count({ where: { createdAt: range } }).catch(() => 0),
    prisma.shipment
      .count({ where: { status: { in: ['pending', 'label_created'] }, shippedAt: null } })
      .catch(() => 0),
  ]);

  const revenue = paidSum._sum.amount || 0;
  const refunds = refundedSum._sum.amount || 0;

  // Pick the recipients — founders/admins on the User table. Falls back to
  // FOUNDER_EMAIL / FROM_EMAIL if no founder accounts exist yet.
  const founders = await prisma.user.findMany({
    where: { role: { in: ['founder', 'admin'] } },
    select: { email: true },
  });
  const recipientEmails = Array.from(new Set([
    ...founders.map((f) => f.email).filter((e): e is string => Boolean(e)),
    ...(process.env.FOUNDER_EMAIL ? [process.env.FOUNDER_EMAIL] : []),
  ]));

  if (recipientEmails.length === 0) {
    return NextResponse.json({
      sent: false,
      reason: 'No founder/admin recipients found. Add a user with role=founder or set FOUNDER_EMAIL.',
    });
  }

  const vars = {
    periodLabel,
    revenue: fmtUsd(revenue),
    orderCount: String(orderCount),
    consultationCount: String(consultationCount),
    newCustomerCount: String(newCustomerCount),
    refunds: fmtUsd(refunds),
    returnsOpened: String(returnsOpened),
    pendingShipments: String(pendingShipments),
    adminUrl: `${APP_URL.replace(/\/$/, '')}/admin`,
  };

  const results = await Promise.all(
    recipientEmails.map((to) => sendTemplate('daily_digest', to, vars)),
  );
  const sentCount = results.filter(Boolean).length;

  return NextResponse.json({
    sent: sentCount > 0,
    sentCount,
    recipients: recipientEmails,
    period: periodLabel,
    stats: vars,
  });
}
