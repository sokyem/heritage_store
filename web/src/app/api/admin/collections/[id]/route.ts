import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// GET — single collection (with its products)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const collection = await prisma.adminCollection.findUnique({
      where: { id },
      include: {
        products: {
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            images: true,
            isPublished: true,
            category: true,
            slug: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
        _count: { select: { products: true } },
      },
    });
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }
    return NextResponse.json(collection);
  } catch (error) {
    console.error('Collection GET error:', error);
    return NextResponse.json({ error: 'Failed to load collection' }, { status: 500 });
  }
}

// PUT — partial update
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
    if (body.name !== undefined) data.name = body.name;
    if (body.slug !== undefined) data.slug = body.slug || null;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.image !== undefined) data.image = body.image || null;
    if (body.season !== undefined) data.season = body.season || null;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    if (body.sortOrder !== undefined) data.sortOrder = parseInt(String(body.sortOrder)) || 0;

    const collection = await prisma.adminCollection.update({
      where: { id },
      data,
    });
    return NextResponse.json(collection);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update collection';
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'A collection with this slug already exists' }, { status: 409 });
    }
    console.error('Collection PUT error:', error);
    return NextResponse.json({ error: 'Failed to update collection' }, { status: 500 });
  }
}

// DELETE — remove collection
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    await prisma.adminCollection.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Collection DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 });
  }
}
