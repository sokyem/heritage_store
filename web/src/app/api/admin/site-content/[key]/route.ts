import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

// GET — admin fetch (same as public but consistent path under /admin)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { key } = await params;
  const row = await prisma.siteContent.findUnique({ where: { key } });
  return NextResponse.json({ key, value: row?.value ?? null, updatedAt: row?.updatedAt ?? null });
}

// PUT — upsert content
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { key } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const value = (body as { value?: unknown })?.value;
  if (value === undefined || value === null) {
    return NextResponse.json({ error: 'Missing "value" field' }, { status: 400 });
  }

  const row = await prisma.siteContent.upsert({
    where: { key },
    create: { key, value: value as object, updatedBy: auth.email },
    update: { value: value as object, updatedBy: auth.email },
  });

  return NextResponse.json({ key: row.key, value: row.value, updatedAt: row.updatedAt });
}
