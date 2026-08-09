import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';
import { PageBlocksSchema } from '@/lib/page-blocks';

const PageCreateSchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9/-]+$/, 'Slug must be lowercase letters, numbers, hyphens, or slashes'),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  blocks: PageBlocksSchema.optional(),
  status: z.enum(['draft', 'published']).optional(),
});

// GET /api/admin/pages — list all
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const pages = await prisma.page.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      updatedBy: true,
    },
  });
  return NextResponse.json({ pages });
}

// POST /api/admin/pages — create
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PageCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const existing = await prisma.page.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) {
    return NextResponse.json({ error: `A page with slug "${parsed.data.slug}" already exists` }, { status: 409 });
  }

  const page = await prisma.page.create({
    data: {
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      blocks: (parsed.data.blocks ?? []) as never,
      status: parsed.data.status ?? 'draft',
      updatedBy: auth.email ?? null,
    },
  });

  await recordAudit({
    actorEmail: auth.email,
    action: 'create',
    entity: 'Page',
    entityId: page.id,
    summary: `Created page ${page.slug}`,
    diff: { after: page },
    ip: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({ page });
}
