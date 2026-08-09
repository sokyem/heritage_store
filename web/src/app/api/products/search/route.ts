import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function parseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function safeFirst(arr: string[]): string {
  return arr[0] || '';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const category = searchParams.get('category') || '';
  const minPrice = parseFloat(searchParams.get('min') || '0') || 0;
  const maxPrice = parseFloat(searchParams.get('max') || '0') || 0;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const perPage = 24;

  if (!q && !category) {
    return NextResponse.json({ products: [], total: 0, page, perPage });
  }

  const where: Record<string, unknown> = { isPublished: true };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { tags: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (category) {
    where.category = { contains: category, mode: 'insensitive' };
  }

  if (minPrice > 0) {
    (where as any).price = { ...((where as any).price || {}), gte: minPrice };
  }

  if (maxPrice > 0) {
    (where as any).price = { ...((where as any).price || {}), lte: maxPrice };
  }

  const [total, rows] = await prisma.$transaction([
    prisma.adminProduct.count({ where }),
    prisma.adminProduct.findMany({
      where,
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, name: true, slug: true, sku: true, price: true,
        compareAtPrice: true, images: true,
        category: true, subcategory: true,
        isNewArrival: true,
        collection: { select: { name: true, slug: true } },
      },
    }),
  ]);

  // Aggregate approved review ratings per product in one grouped query so
  // search result cards can show an Amazon-style star summary.
  const ratingGroups = await prisma.productReview.groupBy({
    by: ['productId'],
    where: { status: 'approved', productId: { in: rows.map((p: any) => p.id) } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const ratingByProduct = new Map(
    ratingGroups.map((g) => [
      g.productId,
      { avg: Math.round((g._avg.rating || 0) * 10) / 10, count: g._count.rating },
    ])
  );

  const products = rows.map((p: any) => {
    const imgs = parseJSON<string[]>(p.images, []);
    const rating = ratingByProduct.get(p.id);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug || p.id,
      price: p.price,
      compareAt: p.compareAtPrice ?? undefined,
      image: imgs[0] || '/images/placeholder.jpg',
      category: p.category,
      isNewArrival: p.isNewArrival,
      collectionName: p.collection?.name,
      avgRating: rating?.avg ?? 0,
      reviewCount: rating?.count ?? 0,
    };
  });

  return NextResponse.json({ products, total, page, perPage });
}
