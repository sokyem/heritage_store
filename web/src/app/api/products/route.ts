import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveStorefrontImage, isStorefrontCategoryBuyable } from '@/lib/storefront-media';
import { parseProductImages } from '@/lib/product-images';

function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const featuredOnly = url.searchParams.get('featured') === 'true';
    const adminOnly = url.searchParams.get('adminOnly') === 'true';
    const categoryFilter = url.searchParams.get('category');
    const collectionFilter = url.searchParams.get('collection'); // collection slug
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.max(parseInt(limitParam, 10) || 0, 0) : null;

    // Try DB first
    const dbProducts = await prisma.adminProduct.findMany({
      where: {
        isPublished: true,
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(collectionFilter ? { collection: { slug: collectionFilter } } : {}),
        ...(featuredOnly ? { OR: [{ isFeatured: true }, { featuredPlacements: { some: { isActive: true } } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: { collection: { select: { name: true } } },
      ...(limit ? { take: limit } : {}),
    });

    if (dbProducts.length > 0) {
      // Aggregate approved review ratings per product in a single grouped query,
      // so listing cards can show an Amazon-style star summary without firing
      // one request per card.
      const ratingGroups = await prisma.productReview.groupBy({
        by: ['productId'],
        where: { status: 'approved', productId: { in: dbProducts.map((p) => p.id) } },
        _avg: { rating: true },
        _count: { rating: true },
      });
      const ratingByProduct = new Map(
        ratingGroups.map((g) => [
          g.productId,
          { avg: Math.round((g._avg.rating || 0) * 10) / 10, count: g._count.rating },
        ])
      );

      const products = dbProducts.map((p) => {
        const rating = ratingByProduct.get(p.id);
        const displayCategory = p.collection?.name || p.category || 'Women';
        const imageEntries = parseProductImages(p.images);
        const imageList = imageEntries.map((e) => e.url);

        const resolvedImages = imageList.map((img) => resolveStorefrontImage(img, {
          category: displayCategory,
          slug: p.slug || p.id,
        }));
        const resolvedEntries = imageEntries.map((e) => ({
          url: resolveStorefrontImage(e.url, { category: displayCategory, slug: p.slug || p.id }),
          color: e.color || null,
          label: e.label || null,
        }));

        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          slug: p.slug || p.id,
          price: p.price,
          compareAt: p.compareAtPrice || undefined,
          description: p.description || '',
          image: resolvedImages[0] || resolveStorefrontImage('', {
            category: displayCategory,
            slug: p.slug || p.id,
          }),
          images: resolvedImages,
          imageEntries: resolvedEntries,
          category: displayCategory,
          rawCategory: p.category,
          subcategory: p.subcategory || undefined,
          gender: p.gender || undefined,
          sizes: parseJsonArray(p.sizes),
          colors: parseJsonArray(p.colors),
          materials: parseJsonArray(p.materials),
          tags: parseJsonArray(p.tags),
          sizeChartImage: p.sizeChartImage || null,
          sizeChartData: (() => {
            if (!p.sizeChartData) return null;
            try { return JSON.parse(p.sizeChartData); } catch { return null; }
          })(),
          allowCustomization: p.allowCustomization || false,
          colorStock: (() => {
            if (!p.colorStock) return null;
            try {
              const obj = JSON.parse(p.colorStock);
              return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, number>) : null;
            } catch { return null; }
          })(),
          sizeStock: (() => {
            if (!p.sizeStock) return null;
            try {
              const obj = JSON.parse(p.sizeStock);
              return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, number>) : null;
            } catch { return null; }
          })(),
          variantStock: (() => {
            if (!p.variantStock) return null;
            try {
              const obj = JSON.parse(p.variantStock);
              return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, Record<string, number>>) : null;
            } catch { return null; }
          })(),
          badge: p.isNewArrival ? 'New' : p.isFeatured ? 'Featured' : undefined,
          buyable: isStorefrontCategoryBuyable(displayCategory, p.category),
          avgRating: rating?.avg ?? 0,
          reviewCount: rating?.count ?? 0,
        };
      });
      return NextResponse.json(products);
    }

    // DB is the only source of truth — the legacy static catalog has been
    // removed so customers never see invented prices. An empty result here
    // means the admin hasn't published any products matching the request.
    return NextResponse.json([]);
  } catch (err) {
    console.error('[api/products] failed:', err);
    return NextResponse.json([]);
  }
}
