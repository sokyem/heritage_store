import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';
import { PageBlocksSchema } from '@/lib/page-blocks';

const PageUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9/-]+$/).optional(),
  blocks: PageBlocksSchema.optional(),
  status: z.enum(['draft', 'published']).optional(),
  metaTitle: z.string().max(200).nullable().optional(),
  metaDesc: z.string().max(400).nullable().optional(),
  ogImage: z.string().nullable().optional(),
  revisionNote: z.string().max(200).optional(),
});

// GET /api/admin/pages/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const page = await prisma.page.findUnique({
    where: { id },
    include: {
      revisions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, createdAt: true, createdBy: true, note: true, title: true },
      },
    },
  });
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  return NextResponse.json({ page });
}

// PUT /api/admin/pages/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PageUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const existing = await prisma.page.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  // Snapshot a revision when blocks change.
  if (parsed.data.blocks) {
    await prisma.pageRevision.create({
      data: {
        pageId: existing.id,
        title: existing.title,
        blocks: existing.blocks as never,
        note: parsed.data.revisionNote ?? null,
        createdBy: auth.email ?? null,
      },
    });
  }

  const data: Record<string, unknown> = { updatedBy: auth.email ?? null };
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.slug !== undefined) data.slug = parsed.data.slug;
  if (parsed.data.blocks !== undefined) data.blocks = parsed.data.blocks as never;
  if (parsed.data.metaTitle !== undefined) data.metaTitle = parsed.data.metaTitle;
  if (parsed.data.metaDesc !== undefined) data.metaDesc = parsed.data.metaDesc;
  if (parsed.data.ogImage !== undefined) data.ogImage = parsed.data.ogImage;
  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
    if (parsed.data.status === 'published') data.publishedAt = new Date();
  }

  const updated = await prisma.page.update({ where: { id }, data });

  await recordAudit({
    actorEmail: auth.email,
    action: 'update',
    entity: 'Page',
    entityId: id,
    summary: `Updated page ${updated.slug}`,
    diff: { before: existing, after: updated },
    ip: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({ page: updated });
}

// DELETE /api/admin/pages/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const existing = await prisma.page.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  await prisma.page.delete({ where: { id } });

  await recordAudit({
    actorEmail: auth.email,
    action: 'delete',
    entity: 'Page',
    entityId: id,
    summary: `Deleted page ${existing.slug}`,
    diff: { before: existing },
    ip: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({ ok: true });
}
