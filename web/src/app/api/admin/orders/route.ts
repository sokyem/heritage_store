import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';


// Whitelist of sortable columns. Client can never inject arbitrary fields
// into `orderBy`.
const SORTABLE_COLUMNS: Record<string, 'orderId' | 'updatedAt' | 'totalPrice' | 'status' | 'dueDate'> = {
  orderId: 'orderId',
  updatedAt: 'updatedAt',
  totalPrice: 'totalPrice',
  status: 'status',
  dueDate: 'dueDate',
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const url = new URL(req.url);
  // Opt-in pagination: bare GET still returns the flat array so any
  // existing caller that doesn't pass `?page=` keeps working.
  const wantsPaginated =
    url.searchParams.has('page') ||
    url.searchParams.has('pageSize') ||
    url.searchParams.get('paginate') === '1';

  try {
    if (!wantsPaginated) {
      const orders = await prisma.adminOrder.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { client: true, production: true, payments: true },
      });
      return NextResponse.json(orders);
    }

    const status = url.searchParams.get('status') || '';
    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
    const sortByParam = url.searchParams.get('sortBy') || 'updatedAt';
    const sortBy = SORTABLE_COLUMNS[sortByParam] || 'updatedAt';
    const sortDir = url.searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';

    const rawPage = parseInt(url.searchParams.get('page') || '1', 10);
    const rawSize = parseInt(url.searchParams.get('pageSize') || '25', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 25));

    const where = {
      ...(status && status !== 'all' ? { status } : {}),
      ...(search
        ? {
            OR: [
              { orderId: { contains: search, mode: 'insensitive' as const } },
              { item: { contains: search, mode: 'insensitive' as const } },
              { fabric: { contains: search, mode: 'insensitive' as const } },
              { client: { name: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.adminOrder.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { client: true, production: true, payments: true },
      }),
      prisma.adminOrder.count({ where }),
    ]);

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sortBy: sortByParam in SORTABLE_COLUMNS ? sortByParam : 'updatedAt',
      sortDir,
    });
  } catch (error) {
    console.error('[admin/orders GET]', error);
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    // Generate next order ID
    const lastOrder = await prisma.adminOrder.findFirst({ orderBy: { orderId: 'desc' } });
    const nextNum = lastOrder
      ? parseInt(lastOrder.orderId.replace('AWK-', '')) + 1
      : 1;
    const orderId = `AWK-${String(nextNum).padStart(3, '0')}`;

    const balance = (body.totalPrice || 0) - (body.deposit || 0);

    const order = await prisma.adminOrder.create({
      data: {
        orderId,
        clientId: body.clientId,
        item: body.item,
        fabric: body.fabric || null,
        totalPrice: body.totalPrice || null,
        deposit: body.deposit || 0,
        totalPaid: body.deposit || 0,
        balance: balance > 0 ? balance : null,
        status: body.status || 'Inquiry',
        dueDate: body.dueDate || null,
        notes: body.notes || null,
        productionAllowed: body.productionAllowed || 'HOLD',
      },
      include: { client: true },
    });
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error('Create order error:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
