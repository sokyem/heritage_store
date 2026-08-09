import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// GET /api/admin/inventory/stats
//
// Aggregate stats over the full FabricInventory table so the page can
// paginate the list without losing the summary cards.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const [total, lowStockCount, valueRows] = await Promise.all([
      prisma.fabricInventory.count(),
      // Low stock: quantity < minStock. Wrapped — schemas missing `minStock`
      // on older deploys would otherwise 500 the whole stats card.
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "FabricInventory"
        WHERE "quantity" < "minStock"
      `.catch(() => [{ count: BigInt(0) }] as Array<{ count: bigint }>),
      // Sum(quantity * cost) — Prisma's aggregate can't multiply two
      // columns, so we use a raw query for the true inventory value.
      prisma.$queryRaw<Array<{ total: number | null }>>`
        SELECT COALESCE(SUM(COALESCE("quantity", 0) * COALESCE("cost", 0)), 0)::float AS total
        FROM "FabricInventory"
      `.catch(() => [{ total: 0 }] as Array<{ total: number | null }>),
    ]);

    return NextResponse.json({
      total,
      lowStock: Number(lowStockCount[0]?.count ?? 0),
      totalValue: Number(valueRows[0]?.total ?? 0),
    });
  } catch (error) {
    console.error('[admin/inventory/stats]', error);
    return NextResponse.json({ error: 'Failed to load inventory stats' }, { status: 500 });
  }
}
