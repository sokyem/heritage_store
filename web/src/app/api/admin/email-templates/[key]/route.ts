import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';
import {
  getBuiltinTemplate,
  renderEmailTemplate,
  BUILTIN_TEMPLATES,
} from '@/lib/email-templates';

const TemplateSchema = z.object({
  subject: z.string().min(1).max(300),
  html: z.string().min(1).max(64_000),
  enabled: z.boolean().default(true),
});

function isValidKey(key: string) {
  return BUILTIN_TEMPLATES.some((t) => t.key === key);
}

// GET /api/admin/email-templates/[key]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { key } = await params;
  if (!isValidKey(key)) return NextResponse.json({ error: 'Unknown template' }, { status: 404 });

  const builtin = getBuiltinTemplate(key)!;
  let row = null;
  try {
    row = await prisma.emailTemplate.findUnique({ where: { key } });
  } catch {}

  return NextResponse.json({
    template: {
      key,
      name: builtin.name,
      description: builtin.description,
      variables: builtin.variables,
      subject: row?.subject ?? builtin.subject,
      html: row?.html ?? builtin.html,
      enabled: row?.enabled ?? true,
      customized: Boolean(row),
      builtinSubject: builtin.subject,
      builtinHtml: builtin.html,
    },
  });
}

// PUT /api/admin/email-templates/[key]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { key } = await params;
  if (!isValidKey(key)) return NextResponse.json({ error: 'Unknown template' }, { status: 404 });
  const builtin = getBuiltinTemplate(key)!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = TemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const before = await prisma.emailTemplate.findUnique({ where: { key } });
  const saved = await prisma.emailTemplate.upsert({
    where: { key },
    create: {
      key,
      name: builtin.name,
      description: builtin.description,
      subject: parsed.data.subject,
      html: parsed.data.html,
      variables: builtin.variables as never,
      enabled: parsed.data.enabled,
      updatedBy: auth.email ?? null,
    },
    update: {
      subject: parsed.data.subject,
      html: parsed.data.html,
      enabled: parsed.data.enabled,
      updatedBy: auth.email ?? null,
    },
  });

  await recordAudit({
    actorEmail: auth.email,
    action: 'update',
    entity: 'EmailTemplate',
    entityId: key,
    summary: `Updated email template ${key}`,
    diff: { before, after: saved },
    ip: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({ template: saved });
}

// DELETE — revert to built-in
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { key } = await params;
  if (!isValidKey(key)) return NextResponse.json({ error: 'Unknown template' }, { status: 404 });

  try {
    await prisma.emailTemplate.delete({ where: { key } });
  } catch {
    // already at default
  }
  await recordAudit({
    actorEmail: auth.email,
    action: 'delete',
    entity: 'EmailTemplate',
    entityId: key,
    summary: `Reverted email template ${key} to default`,
    ip: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true });
}

// POST — preview (render with example variables)
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { key } = await params;
  if (!isValidKey(key)) return NextResponse.json({ error: 'Unknown template' }, { status: 404 });

  let body: { subject?: string; html?: string; variables?: Record<string, string> } = {};
  try {
    body = await req.json();
  } catch {}

  // If subject/html supplied, render those directly without saving; else use stored/builtin.
  if (body.subject || body.html) {
    const merged = { siteName: 'AWULA K', ...(body.variables || {}) };
    const sub = (body.subject || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, n) => String(merged[n as keyof typeof merged] ?? ''));
    const html = (body.html || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, n) => String(merged[n as keyof typeof merged] ?? ''));
    return NextResponse.json({ subject: sub, html });
  }

  const rendered = await renderEmailTemplate(key, body.variables || {});
  return NextResponse.json(rendered ?? { subject: '', html: '' });
}
