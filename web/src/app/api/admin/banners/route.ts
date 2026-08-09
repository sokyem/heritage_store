import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

const VALID_POSITIONS = ['hero', 'announcement', 'promo_strip'] as const;

// GET — list all storefront banners (optionally filtered by position)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const position = searchParams.get('position');

    const where: Record<string, unknown> = {};
    if (position) where.position = position;

    const banners = await prisma.storefrontBanner.findMany({
      where,
      orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }],
    });
    return NextResponse.json(banners);
  } catch (error) {
    console.error('Banners GET error:', error);
    return NextResponse.json({ error: 'Failed to load banners' }, { status: 500 });
  }
}

// POST — create a new banner
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const position = body.position && VALID_POSITIONS.includes(body.position)
      ? body.position
      : 'hero';

    // Accept multiple images. Store as a JSON array; keep imageUrl = first
    // image for back-compat with anything still reading the single field.
    const imageList: string[] = Array.isArray(body.images)
      ? body.images.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
      : (body.imageUrl ? [body.imageUrl.trim()] : []);

    const banner = await prisma.storefrontBanner.create({
      data: {
        title: body.title.trim(),
        subtitle: body.subtitle?.trim() || null,
        imageUrl: imageList[0] || null,
        images: imageList.length ? JSON.stringify(imageList) : null,
        linkUrl: body.linkUrl?.trim() || null,
        position,
        sortOrder: body.sortOrder != null ? parseInt(String(body.sortOrder)) || 0 : 0,
        isActive: body.isActive ?? true,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
    });
    return NextResponse.json(banner, { status: 201 });
  } catch (error) {
    console.error('Banner POST error:', error);
    return NextResponse.json({ error: 'Failed to create banner' }, { status: 500 });
  }
}
