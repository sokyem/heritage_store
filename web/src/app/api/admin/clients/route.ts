import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';


// Whitelist of sortable columns. We never let the client write directly
// into Prisma's `orderBy` — only these mapped values flow through.
const SORTABLE_COLUMNS: Record<string, 'clientId' | 'name' | 'createdAt' | 'vipTier'> = {
  clientId: 'clientId',
  name: 'name',
  createdAt: 'createdAt',
  vipTier: 'vipTier',
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const url = new URL(req.url);
  // Opt-in pagination: if `?page=` (or `?paginate=1`) is present, we return
  // the paginated envelope. Otherwise we keep the legacy bare-array shape
  // so the dozens of admin dropdowns/pickers don't break.
  const wantsPaginated =
    url.searchParams.has('page') ||
    url.searchParams.has('pageSize') ||
    url.searchParams.get('paginate') === '1';

  const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
  const sortByParam = url.searchParams.get('sortBy') || 'clientId';
  const sortBy = SORTABLE_COLUMNS[sortByParam] || 'clientId';
  const sortDir = url.searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc';

  try {
    if (!wantsPaginated) {
      const clients = await prisma.client.findMany({
        orderBy: { clientId: 'asc' },
        include: { _count: { select: { orders: true } } },
      });
      return NextResponse.json(clients);
    }

    const rawPage = parseInt(url.searchParams.get('page') || '1', 10);
    const rawSize = parseInt(url.searchParams.get('pageSize') || '25', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 25));

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { clientId: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search } },
            { instagram: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { orders: true } } },
      }),
      prisma.client.count({ where }),
    ]);

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sortBy: sortByParam in SORTABLE_COLUMNS ? sortByParam : 'clientId',
      sortDir,
    });
  } catch (error) {
    console.error('[admin/clients GET]', error);
    return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    // Generate next client ID
    const lastClient = await prisma.client.findFirst({ orderBy: { clientId: 'desc' } });
    const nextNum = lastClient
      ? parseInt(lastClient.clientId.replace('C-', '')) + 1
      : 1;
    const clientId = `C-${String(nextNum).padStart(3, '0')}`;

    const client = await prisma.client.create({
      data: {
        clientId,
        name: body.name,
        phone: body.phone || null,
        instagram: body.instagram || null,
        email: body.email || null,
        city: body.city || null,
        notes: body.notes || null,
      },
    });
    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}
