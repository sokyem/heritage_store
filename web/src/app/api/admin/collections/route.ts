import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// GET — list all collections with product count
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const collections = await prisma.adminCollection.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { products: true } },
      },
    });
    return NextResponse.json(collections);
  } catch (error) {
    console.error('Load collections error:', error);
    return NextResponse.json({ error: 'Failed to load collections' }, { status: 500 });
  }
}

// POST — create a new collection (auto-slug if missing)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const name = body.name.trim();
    const slug = body.slug?.trim() ? slugify(body.slug) : slugify(name);

    const collection = await prisma.adminCollection.create({
      data: {
        name,
        slug: slug || null,
        description: body.description?.trim() || null,
        image: body.image?.trim() || null,
        season: body.season?.trim() || null,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder != null ? parseInt(String(body.sortOrder)) || 0 : 0,
      },
    });
    return NextResponse.json(collection, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create collection';
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'A collection with this slug already exists' }, { status: 409 });
    }
    console.error('Create collection error:', error);
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}
