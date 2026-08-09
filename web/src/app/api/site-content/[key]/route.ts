import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/site-content/[key] — public read
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  try {
    const row = await prisma.siteContent.findUnique({ where: { key } });
    return NextResponse.json({ key, value: row?.value ?? null, updatedAt: row?.updatedAt ?? null });
  } catch (err: any) {
    return NextResponse.json({ key, value: null, error: err?.message }, { status: 200 });
  }
}
