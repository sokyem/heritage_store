import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// GET — list all featured placements (optionally filtered by section)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const section = searchParams.get('section');

    const where: Record<string, unknown> = {};
    if (section) where.section = section;

    const placements = await prisma.featuredPlacement.findMany({
      where,
      orderBy: [{ section: 'asc' }, { position: 'asc' }],
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            compareAtPrice: true,
            images: true,
            slug: true,
            category: true,
            isPublished: true,
          },
        },
      },
    });
    return NextResponse.json(placements);
  } catch (error) {
    console.error('Load featured placements error:', error);
    return NextResponse.json({ error: 'Failed to load featured placements' }, { status: 500 });
  }
}

// POST — create a new featured placement (validates product exists)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    if (!body.productId || !body.section) {
      return NextResponse.json({ error: 'productId and section are required' }, { status: 400 });
    }

    // Validate product exists
    const product = await prisma.adminProduct.findUnique({
      where: { id: body.productId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const placement = await prisma.featuredPlacement.create({
      data: {
        productId: body.productId,
        section: body.section,
        position: body.position != null ? parseInt(String(body.position)) || 0 : 0,
        title: body.title?.trim() || null,
        subtitle: body.subtitle?.trim() || null,
        ctaText: body.ctaText?.trim() || null,
        isActive: body.isActive ?? true,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            images: true,
            slug: true,
            category: true,
          },
        },
      },
    });
    return NextResponse.json(placement, { status: 201 });
  } catch (error) {
    console.error('Create featured placement error:', error);
    return NextResponse.json({ error: 'Failed to create featured placement' }, { status: 500 });
  }
}
