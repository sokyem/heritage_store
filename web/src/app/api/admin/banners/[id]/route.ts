import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// GET — single banner
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const banner = await prisma.storefrontBanner.findUnique({ where: { id } });
    if (!banner) {
      return NextResponse.json({ error: 'Banner not found' }, { status: 404 });
    }
    return NextResponse.json(banner);
  } catch (error) {
    console.error('Banner GET error:', error);
    return NextResponse.json({ error: 'Failed to load banner' }, { status: 500 });
  }
}

// PUT — partial update (used for both edits and isActive toggles)
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
    if (body.title !== undefined) data.title = body.title;
    if (body.subtitle !== undefined) data.subtitle = body.subtitle || null;
    if (body.images !== undefined) {
      const imageList: string[] = Array.isArray(body.images)
        ? body.images.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];
      data.images = imageList.length ? JSON.stringify(imageList) : null;
      data.imageUrl = imageList[0] || null; // keep primary in sync
    } else if (body.imageUrl !== undefined) {
      data.imageUrl = body.imageUrl || null;
    }
    if (body.linkUrl !== undefined) data.linkUrl = body.linkUrl || null;
    if (body.position !== undefined) data.position = body.position;
    if (body.sortOrder !== undefined) data.sortOrder = parseInt(String(body.sortOrder)) || 0;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;

    const banner = await prisma.storefrontBanner.update({
      where: { id },
      data,
    });
    return NextResponse.json(banner);
  } catch (error) {
    console.error('Banner PUT error:', error);
    return NextResponse.json({ error: 'Failed to update banner' }, { status: 500 });
  }
}

// DELETE — remove banner
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    await prisma.storefrontBanner.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Banner DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete banner' }, { status: 500 });
  }
}
