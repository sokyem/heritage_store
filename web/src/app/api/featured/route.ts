import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Public API: returns active featured products for the storefront
export async function GET() {
  try {
    const now = new Date();

    const placements = await prisma.featuredPlacement.findMany({
      where: {
        isActive: true,
        OR: [
          { startDate: null },
          { startDate: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endDate: null },
              { endDate: { gte: now } },
            ],
          },
        ],
        product: {
          isPublished: true,
        },
      },
      orderBy: [{ section: 'asc' }, { position: 'asc' }],
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            compareAtPrice: true,
            images: true,
            category: true,
            subcategory: true,
            gender: true,
            isNewArrival: true,
            isFeatured: true,
          },
        },
      },
    });

    // Group by section for easy frontend consumption
    const grouped: Record<string, typeof placements> = {};
    for (const p of placements) {
      if (!grouped[p.section]) grouped[p.section] = [];
      grouped[p.section].push(p);
    }

    return NextResponse.json({ placements, grouped });
  } catch (error) {
    console.error('Load public featured error:', error);
    return NextResponse.json({ placements: [], grouped: {} });
  }
}
