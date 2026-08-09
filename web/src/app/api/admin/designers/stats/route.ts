import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// GET /api/admin/designers/stats
//
// Aggregate stats over the entire PartnerDesigner table — independent of
// whatever page the admin is currently viewing. Lets the designers list
// page paginate without breaking its summary cards.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const [total, active, atCapacity, ratingAgg, ordersAgg] = await Promise.all([
      prisma.partnerDesigner.count(),
      prisma.partnerDesigner.count({ where: { status: 'active' } }),
      // "available" means active AND currentLoad < maxCapacity. Prisma can't
      // compare two columns directly, so we count "at-or-over capacity"
      // by fetching the few hot designers and subtract — cheaper than
      // pulling every row.
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "PartnerDesigner"
        WHERE "status" = 'active' AND "currentLoad" >= "maxCapacity"
      `.catch(() => [{ count: BigInt(0) }] as Array<{ count: bigint }>),
      prisma.partnerDesigner.aggregate({ _avg: { rating: true } }),
      prisma.partnerDesigner.aggregate({ _sum: { completedOrders: true } }),
    ]);

    const atCap = Number(atCapacity[0]?.count ?? 0);
    const available = Math.max(0, active - atCap);

    return NextResponse.json({
      total,
      active,
      available,
      avgRating: Number(((ratingAgg._avg.rating ?? 0)).toFixed(1)),
      totalCompletedOrders: ordersAgg._sum.completedOrders ?? 0,
    });
  } catch (error) {
    console.error('[admin/designers/stats]', error);
    return NextResponse.json({ error: 'Failed to load designer stats' }, { status: 500 });
  }
}
