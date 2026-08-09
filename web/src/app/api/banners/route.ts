import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Public API: active storefront banners for the homepage, within their
// scheduled window, ordered by position then sortOrder. Mirrors the
// /api/featured pattern. `images` is a JSON array; `imageUrl` is the
// primary/legacy single image.
export async function GET() {
  try {
    const now = new Date();
    const banners = await prisma.storefrontBanner.findMany({
      where: {
        isActive: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true, title: true, subtitle: true, imageUrl: true, images: true,
        linkUrl: true, position: true, sortOrder: true,
      },
    });

    // Normalize images to a string[] per banner (falls back to imageUrl).
    const normalized = banners.map((b) => {
      let imgs: string[] = [];
      if (b.images) {
        try {
          const parsed = JSON.parse(b.images);
          if (Array.isArray(parsed)) imgs = parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
        } catch {}
      }
      if (imgs.length === 0 && b.imageUrl) imgs = [b.imageUrl];
      return { ...b, imageList: imgs };
    });

    const grouped: Record<string, typeof normalized> = {};
    for (const b of normalized) {
      (grouped[b.position] ||= []).push(b);
    }

    return NextResponse.json({ banners: normalized, grouped });
  } catch (error) {
    console.error('Load public banners error:', error);
    return NextResponse.json({ banners: [], grouped: {} });
  }
}
