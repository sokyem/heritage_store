import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';


const SORTABLE_COLUMNS: Record<string, 'fabricType' | 'color' | 'quantity' | 'cost' | 'supplier'> = {
  fabricType: 'fabricType',
  color: 'color',
  quantity: 'quantity',
  cost: 'cost',
  supplier: 'supplier',
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const url = new URL(req.url);
  const wantsPaginated =
    url.searchParams.has('page') ||
    url.searchParams.has('pageSize') ||
    url.searchParams.get('paginate') === '1';

  try {
    if (!wantsPaginated) {
      const items = await prisma.fabricInventory.findMany({
        orderBy: { fabricType: 'asc' },
      });
      return NextResponse.json(items);
    }

    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
    const sortByParam = url.searchParams.get('sortBy') || 'fabricType';
    const sortBy = SORTABLE_COLUMNS[sortByParam] || 'fabricType';
    const sortDir = url.searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc';
    const rawPage = parseInt(url.searchParams.get('page') || '1', 10);
    const rawSize = parseInt(url.searchParams.get('pageSize') || '25', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 25));

    const where = search
      ? {
          OR: [
            { fabricType: { contains: search, mode: 'insensitive' as const } },
            { color: { contains: search, mode: 'insensitive' as const } },
            { supplier: { contains: search, mode: 'insensitive' as const } },
            { usedForOrder: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.fabricInventory.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.fabricInventory.count({ where }),
    ]);

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sortBy: sortByParam in SORTABLE_COLUMNS ? sortByParam : 'fabricType',
      sortDir,
    });
  } catch (error) {
    console.error('[admin/inventory GET]', error);
    return NextResponse.json({ error: 'Failed to load inventory' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const item = await prisma.fabricInventory.create({
      data: {
        fabricType: body.fabricType,
        color: body.color || null,
        quantity: body.quantity || 0,
        unit: body.unit || 'yards',
        supplier: body.supplier || null,
        cost: body.cost || null,
        usedForOrder: body.usedForOrder || null,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add inventory' }, { status: 500 });
  }
}
