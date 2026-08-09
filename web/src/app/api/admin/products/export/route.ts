/**
 * GET /api/admin/products/export
 *
 * Streams a CSV of all admin (storefront catalog) products. Honors the
 * same `category` / `published` / `featured` filters as the list endpoint.
 * Capped at 10k rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { toCsv, csvFilename } from '@/lib/csv';

const MAX_ROWS = 10_000;

function firstImage(json: string | null | undefined): string {
  if (!json) return '';
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0]);
  } catch {}
  return '';
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const published = url.searchParams.get('published');
  const featured = url.searchParams.get('featured');

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (published === 'true') where.isPublished = true;
  if (published === 'false') where.isPublished = false;
  if (featured === 'true') where.isFeatured = true;

  const products = await prisma.adminProduct.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: MAX_ROWS,
    include: {
      collection: { select: { name: true } },
      _count: { select: { variants: true } },
    },
  });

  const rows = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    slug: p.slug ?? '',
    category: p.category,
    subcategory: p.subcategory ?? '',
    gender: p.gender ?? '',
    collection: p.collection?.name ?? '',
    price: p.price,
    compareAtPrice: p.compareAtPrice ?? '',
    costPrice: p.costPrice ?? '',
    totalStock: p.totalStock,
    trackInventory: p.trackInventory ? 'yes' : 'no',
    variantCount: p._count?.variants ?? 0,
    isPublished: p.isPublished ? 'yes' : 'no',
    isFeatured: p.isFeatured ? 'yes' : 'no',
    isNewArrival: p.isNewArrival ? 'yes' : 'no',
    allowCustomization: p.allowCustomization ? 'yes' : 'no',
    weightLb: p.weightLb ?? '',
    primaryImage: firstImage(p.images),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  const csv = toCsv(rows, [
    { key: 'sku', header: 'SKU' },
    { key: 'name', header: 'Name' },
    { key: 'slug', header: 'Slug' },
    { key: 'category', header: 'Category' },
    { key: 'subcategory', header: 'Subcategory' },
    { key: 'gender', header: 'Gender' },
    { key: 'collection', header: 'Collection' },
    { key: 'price', header: 'Price' },
    { key: 'compareAtPrice', header: 'Compare At' },
    { key: 'costPrice', header: 'Cost' },
    { key: 'totalStock', header: 'Stock' },
    { key: 'trackInventory', header: 'Track Inventory' },
    { key: 'variantCount', header: 'Variants' },
    { key: 'isPublished', header: 'Published' },
    { key: 'isFeatured', header: 'Featured' },
    { key: 'isNewArrival', header: 'New Arrival' },
    { key: 'allowCustomization', header: 'Customization' },
    { key: 'weightLb', header: 'Weight (lb)' },
    { key: 'primaryImage', header: 'Primary Image' },
    { key: 'createdAt', header: 'Created At' },
    { key: 'updatedAt', header: 'Updated At' },
  ]);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('products')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
