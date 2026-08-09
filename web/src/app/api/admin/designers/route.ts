import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

const SORTABLE_COLUMNS: Record<string, 'name' | 'designerId' | 'rating' | 'completedOrders' | 'currentLoad' | 'status'> = {
  name: 'name',
  designerId: 'designerId',
  rating: 'rating',
  completedOrders: 'completedOrders',
  currentLoad: 'currentLoad',
  status: 'status',
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
      const designers = await prisma.partnerDesigner.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { customOrders: true, assignmentOffers: true } },
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      });
      return NextResponse.json(designers);
    }

    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
    const sortByParam = url.searchParams.get('sortBy') || 'name';
    const sortBy = SORTABLE_COLUMNS[sortByParam] || 'name';
    const sortDir = url.searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc';
    const rawPage = parseInt(url.searchParams.get('page') || '1', 10);
    const rawSize = parseInt(url.searchParams.get('pageSize') || '25', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 25));

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { designerId: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { location: { contains: search, mode: 'insensitive' as const } },
            { specialty: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.partnerDesigner.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { customOrders: true, assignmentOffers: true } },
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      }),
      prisma.partnerDesigner.count({ where }),
    ]);

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sortBy: sortByParam in SORTABLE_COLUMNS ? sortByParam : 'name',
      sortDir,
    });
  } catch (error) {
    console.error('Failed to fetch designers:', error);
    return NextResponse.json({ error: 'Failed to fetch designers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    // Auto-generate designerId
    const lastDesigner = await prisma.partnerDesigner.findFirst({
      orderBy: { designerId: 'desc' },
    });
    const nextNum = lastDesigner
      ? parseInt(lastDesigner.designerId.replace('DES-', '')) + 1
      : 1;
    const designerId = `DES-${String(nextNum).padStart(3, '0')}`;

    // If email provided and no userId, try to find/create a linked User account
    let userId = body.userId || null;
    if (!userId && body.email && body.linkAccount !== false) {
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
      });
      if (existingUser) {
        // Check if already linked to another designer
        const existingLink = await prisma.partnerDesigner.findUnique({
          where: { userId: existingUser.id },
        });
        if (!existingLink) {
          userId = existingUser.id;
          // Update user role to designer if not already
          if (existingUser.role !== 'designer') {
            await prisma.user.update({
              where: { id: existingUser.id },
              data: { role: 'designer' },
            });
          }
        }
      }
    }

    const designer = await prisma.partnerDesigner.create({
      data: {
        designerId,
        userId,
        name: body.name,
        businessName: body.businessName || null,
        email: body.email || null,
        phone: body.phone || null,
        location: body.location || null,
        specialty: body.specialty || null,
        bio: body.bio || null,
        portfolioUrl: body.portfolioUrl || null,
        profileImage: body.profileImage || null,
        status: body.status || 'active',
        maxCapacity: body.maxCapacity ?? 5,
        currentLoad: body.currentLoad ?? 0,
        rating: body.rating ?? 5.0,
        completedOrders: body.completedOrders ?? 0,
        avgDeliveryDays: body.avgDeliveryDays ?? null,
        priceRange: body.priceRange || null,
        tags: body.tags || null,
      },
      include: {
        _count: { select: { customOrders: true } },
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    });

    return NextResponse.json(designer, { status: 201 });
  } catch (error) {
    console.error('Failed to create designer:', error);
    return NextResponse.json({ error: 'Failed to create designer' }, { status: 500 });
  }
}
