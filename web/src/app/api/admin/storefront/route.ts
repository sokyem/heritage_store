import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';


export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const banners = await prisma.storefrontBanner.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return NextResponse.json(banners);
  } catch (error) {
    console.error('Load banners error:', error);
    return NextResponse.json({ error: 'Failed to load banners' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    const banner = await prisma.storefrontBanner.create({
      data: {
        title: body.title,
        subtitle: body.subtitle || null,
        imageUrl: body.imageUrl || null,
        linkUrl: body.linkUrl || null,
        position: body.position || 'hero',
        sortOrder: body.sortOrder || 0,
        isActive: body.isActive ?? true,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
    });
    return NextResponse.json(banner, { status: 201 });
  } catch (error) {
    console.error('Create banner error:', error);
    return NextResponse.json({ error: 'Failed to create banner' }, { status: 500 });
  }
}
