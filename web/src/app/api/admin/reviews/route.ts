import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const REVIEW_SORTABLE: Record<string, 'createdAt' | 'rating' | 'status'> = {
  createdAt: 'createdAt',
  rating: 'rating',
  status: 'status',
};

// GET /api/admin/reviews — list reviews for moderation
// Supports server-side pagination + sort via ?page=&pageSize=&sortBy=&sortDir=
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['founder', 'staff'].includes((session.user as { role?: string }).role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';
  const where = status === 'all' ? {} : { status };

  const sortByParam = searchParams.get('sortBy') || 'createdAt';
  const sortBy = REVIEW_SORTABLE[sortByParam] || 'createdAt';
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawSize = parseInt(searchParams.get('pageSize') || '25', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 25));

  const [reviews, total] = await Promise.all([
    prisma.productReview.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        product: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.productReview.count({ where }),
  ]);

  return NextResponse.json({
    reviews,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sortBy: sortByParam in REVIEW_SORTABLE ? sortByParam : 'createdAt',
    sortDir,
  });
}
