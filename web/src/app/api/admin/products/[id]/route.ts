import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';


export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  try {
    const product = await prisma.adminProduct.findUnique({
      where: { id },
      include: { variants: true, collection: true },
    });
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load product' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  try {
    const body = await req.json();
    const product = await prisma.adminProduct.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        description: body.description ?? undefined,
        longDescription: body.longDescription ?? undefined,
        category: body.category ?? undefined,
        subcategory: body.subcategory ?? undefined,
        gender: body.gender ?? undefined,
        price: body.price !== undefined ? parseFloat(body.price) : undefined,
        compareAtPrice: body.compareAtPrice !== undefined ? (body.compareAtPrice ? parseFloat(body.compareAtPrice) : null) : undefined,
        costPrice: body.costPrice !== undefined ? (body.costPrice ? parseFloat(body.costPrice) : null) : undefined,
        images: body.images ?? undefined,
        sizeChartImage: body.sizeChartImage !== undefined ? (body.sizeChartImage || null) : undefined,
        sizeChartData: body.sizeChartData !== undefined ? (body.sizeChartData || null) : undefined,
        allowCustomization: body.allowCustomization ?? undefined,
        sizes: body.sizes ?? undefined,
        colors: body.colors ?? undefined,
        materials: body.materials ?? undefined,
        trackInventory: body.trackInventory ?? undefined,
        totalStock: body.totalStock !== undefined ? parseInt(body.totalStock) : undefined,
        colorStock: body.colorStock !== undefined ? (body.colorStock || null) : undefined,
        sizeStock: body.sizeStock !== undefined ? (body.sizeStock || null) : undefined,
        variantStock: body.variantStock !== undefined ? (body.variantStock || null) : undefined,
        weightLb: body.weightLb !== undefined ? (body.weightLb ? parseFloat(body.weightLb) : null) : undefined,
        isPublished: body.isPublished ?? undefined,
        isFeatured: body.isFeatured ?? undefined,
        isNewArrival: body.isNewArrival ?? undefined,
        tags: body.tags ?? undefined,
        collectionId: body.collectionId !== undefined ? (body.collectionId || null) : undefined,
      },
    });
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  try {
    await prisma.adminProduct.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
