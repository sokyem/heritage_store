import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// PUT — update a featured placement (often used to toggle isActive or change position)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.productId !== undefined) data.productId = body.productId;
    if (body.section !== undefined) data.section = body.section;
    if (body.position !== undefined) data.position = parseInt(String(body.position)) || 0;
    if (body.title !== undefined) data.title = body.title || null;
    if (body.subtitle !== undefined) data.subtitle = body.subtitle || null;
    if (body.ctaText !== undefined) data.ctaText = body.ctaText || null;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;

    const placement = await prisma.featuredPlacement.update({
      where: { id },
      data,
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
    return NextResponse.json(placement);
  } catch (error) {
    console.error('Featured placement PUT error:', error);
    return NextResponse.json({ error: 'Failed to update featured placement' }, { status: 500 });
  }
}

// DELETE — remove a featured placement
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    await prisma.featuredPlacement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Featured placement DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete featured placement' }, { status: 500 });
  }
}
