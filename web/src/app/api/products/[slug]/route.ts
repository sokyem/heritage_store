import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveStorefrontImage, isStorefrontCategoryBuyable } from '@/lib/storefront-media';
import { parseProductImages } from '@/lib/product-images';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    // Look up by slug, then sku, then id
    const p =
      (await prisma.adminProduct.findFirst({
        where: { slug },
        include: { collection: { select: { name: true, slug: true } }, variants: true },
      })) ||
      (await prisma.adminProduct.findFirst({
        where: { sku: slug },
        include: { collection: { select: { name: true, slug: true } }, variants: true },
      })) ||
      (await prisma.adminProduct.findFirst({
        where: { id: slug },
        include: { collection: { select: { name: true, slug: true } }, variants: true },
      }));

    if (!p || !p.isPublished) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const displayCategory = p.collection?.name || p.category || 'Women';
    const imageEntries = parseProductImages(p.images);
    const imageList: string[] = imageEntries.map((e) => e.url);

    const parseJsonArray = (s: string | null): string[] => {
      if (!s) return [];
      try {
        const v = JSON.parse(s);
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
      } catch {
        return [];
      }
    };

    const product = {
      id: p.id,
      sku: p.sku,
      name: p.name,
      slug: p.slug || p.id,
      description: p.description || '',
      longDescription: p.longDescription || '',
      price: p.price,
      compareAt: p.compareAtPrice || undefined,
      image: resolveStorefrontImage(imageList[0] || '', { category: displayCategory, slug: p.slug || p.id }),
      images: imageList.map((img) =>
        resolveStorefrontImage(img, { category: displayCategory, slug: p.slug || p.id })
      ),
      imageEntries: imageEntries.map((e) => ({
        url: resolveStorefrontImage(e.url, { category: displayCategory, slug: p.slug || p.id }),
        color: e.color || null,
        label: e.label || null,
      })),
      category: displayCategory,
      rawCategory: p.category,
      subcategory: p.subcategory || undefined,
      collectionSlug: p.collection?.slug || undefined,
      collectionName: p.collection?.name || undefined,
      sizes: parseJsonArray(p.sizes),
      colors: parseJsonArray(p.colors),
      materials: parseJsonArray(p.materials),
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
      tags: parseJsonArray(p.tags),
      badge: p.isNewArrival ? 'New' : p.isFeatured ? 'Featured' : undefined,
      buyable: isStorefrontCategoryBuyable(displayCategory, p.category),
      // In stock unless we track inventory and there's none left. When the
      // product has variants, use their availability; otherwise totalStock.
      inStock: !p.trackInventory || (
        p.variants.length > 0
          ? p.variants.some((v) => v.isAvailable && v.stock > 0)
          : p.totalStock > 0
      ),
      isPublished: p.isPublished,
      isFeatured: p.isFeatured,
      isNewArrival: p.isNewArrival,
    };

    // Related: same collection, exclude self
    const relatedRaw = p.collectionId
      ? await prisma.adminProduct.findMany({
          where: { collectionId: p.collectionId, isPublished: true, NOT: { id: p.id } },
          take: 6,
          orderBy: { updatedAt: 'desc' },
        })
      : await prisma.adminProduct.findMany({
          where: { category: p.category, isPublished: true, NOT: { id: p.id } },
          take: 6,
          orderBy: { updatedAt: 'desc' },
        });

    // Aggregate approved-review ratings for the related products in one query,
    // so the "You may also like" cards can show an Amazon-style star summary.
    const relatedRatings = await prisma.productReview.groupBy({
      by: ['productId'],
      where: { status: 'approved', productId: { in: relatedRaw.map((r) => r.id) } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const relatedRatingByProduct = new Map(
      relatedRatings.map((g) => [
        g.productId,
        { avg: Math.round((g._avg.rating || 0) * 10) / 10, count: g._count.rating },
      ])
    );

    const related = relatedRaw.map((r) => {
      const rImgs = parseJsonArray(r.images);
      const rRating = relatedRatingByProduct.get(r.id);
      return {
        id: r.id,
        name: r.name,
        slug: r.slug || r.id,
        price: r.price,
        compareAt: r.compareAtPrice || undefined,
        image: resolveStorefrontImage(rImgs[0] || '', { category: r.category, slug: r.slug || r.id }),
        category: r.category,
        avgRating: rRating?.avg ?? 0,
        reviewCount: rRating?.count ?? 0,
      };
    });

    return NextResponse.json({ product, related });
  } catch (err) {
    console.error('product slug api', err);
    return NextResponse.json({ error: 'Failed to load product' }, { status: 500 });
  }
}
