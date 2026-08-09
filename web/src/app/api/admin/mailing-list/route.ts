import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { countAudience } from '@/lib/mailing-list';

// GET /api/admin/mailing-list
//   → { stats, subscribers, campaigns }
// GET /api/admin/mailing-list?export=csv
//   → text/csv of the full audience (customers + opt-ins)

function csvCell(v: string | null | undefined): string {
  const s = (v ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const url = new URL(req.url);

  if (url.searchParams.get('export') === 'csv') {
    const [users, subs] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'customer', marketingOptOut: false, email: { not: '' } },
        select: { email: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.newsletterSubscriber.findMany({
        where: { status: 'subscribed' },
        select: { email: true, name: true, source: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const seen = new Set<string>();
    const rows: string[] = ['Email,Name,Type,Source,Joined'];
    for (const u of users) {
      const key = u.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push([csvCell(u.email), csvCell(u.name), csvCell('Customer'), csvCell('account'), csvCell(u.createdAt.toISOString().slice(0, 10))].join(','));
    }
    for (const s of subs) {
      const key = s.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push([csvCell(s.email), csvCell(s.name), csvCell('Subscriber'), csvCell(s.source), csvCell(s.createdAt.toISOString().slice(0, 10))].join(','));
    }

    return new NextResponse(rows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="awulak-mailing-list.csv"`,
      },
    });
  }

  const [stats, subscribers, campaigns, optedOut] = await Promise.all([
    countAudience('all'),
    prisma.newsletterSubscriber.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, email: true, name: true, source: true, status: true, createdAt: true },
    }),
    prisma.marketingCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, type: true, subject: true, audience: true, status: true, recipientCount: true, sentCount: true, failedCount: true, sentAt: true, createdAt: true },
    }),
    prisma.user.count({ where: { role: 'customer', marketingOptOut: true } }),
  ]);

  return NextResponse.json({ stats: { ...stats, optedOut }, subscribers, campaigns });
}
