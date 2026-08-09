import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Public API: active admin collections for the storefront /collections page.
// Image falls back to the first published product's first image when the
// collection has no image of its own.
export async function GET() {
  try {
    const cols = await prisma.adminCollection.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        image: true,
        _count: { select: { products: true } },
        products: {
          where: { isPublished: true },
          select: { images: true },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    const collections = cols.map((c) => {
      let image = c.image || '';
      if (!image && c.products[0]?.images) {
        try {
          const arr = JSON.parse(c.products[0].images);
          if (Array.isArray(arr) && typeof arr[0] === 'string') image = arr[0];
        } catch {}
      }
      return {
        id: c.id,
        name: c.name,
        slug: c.slug || c.id,
        description: c.description || '',
        image,
        count: c._count.products,
      };
    });

    return NextResponse.json({ collections });
  } catch (error) {
    console.error('Public collections error:', error);
    return NextResponse.json({ collections: [] });
  }
}
