import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';


export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
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
      include: {
        _count: { select: { variants: true } },
        collection: { select: { id: true, name: true } },
        featuredPlacements: {
          where: { isActive: true },
          orderBy: [{ section: 'asc' }, { position: 'asc' }],
          select: { id: true, section: true, isActive: true },
        },
      },
    });
    return NextResponse.json(products);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    // Generate next SKU: AWK-P001, AWK-P002, etc.
    const lastProduct = await prisma.adminProduct.findFirst({
      orderBy: { sku: 'desc' },
      select: { sku: true },
    });
    let nextNum = 1;
    if (lastProduct) {
      const match = lastProduct.sku.match(/AWK-P(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const sku = body.sku || `AWK-P${String(nextNum).padStart(3, '0')}`;

    const product = await prisma.adminProduct.create({
      data: {
        sku,
        name: body.name,
        description: body.description || null,
        longDescription: body.longDescription || null,
        category: body.category || 'ready-to-wear',
        subcategory: body.subcategory || null,
        gender: body.gender || null,
        price: parseFloat(body.price) || 0,
        compareAtPrice: body.compareAtPrice ? parseFloat(body.compareAtPrice) : null,
        costPrice: body.costPrice ? parseFloat(body.costPrice) : null,
        images: body.images || null,
        sizeChartImage: body.sizeChartImage || null,
        sizeChartData: body.sizeChartData || null,
        allowCustomization: body.allowCustomization ?? false,
        sizes: body.sizes || null,
        colors: body.colors || null,
        materials: body.materials || null,
        trackInventory: body.trackInventory ?? true,
        totalStock: body.totalStock ? parseInt(body.totalStock) : 0,
        colorStock: body.colorStock || null,
        sizeStock: body.sizeStock || null,
        variantStock: body.variantStock || null,
        weightLb: body.weightLb ? parseFloat(body.weightLb) : null,
        isPublished: body.isPublished ?? false,
        isFeatured: body.isFeatured ?? false,
        isNewArrival: body.isNewArrival ?? false,
        tags: body.tags || null,
        collectionId: body.collectionId || null,
      },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
