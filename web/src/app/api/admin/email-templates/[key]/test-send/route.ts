import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import { requireAdmin } from '@/lib/auth-guard';
import { recordAudit } from '@/lib/audit';
import {
  getBuiltinTemplate,
  renderEmailTemplate,
  BUILTIN_TEMPLATES,
} from '@/lib/email-templates';
import { isEmailConfigured } from '@/lib/email';

// POST /api/admin/email-templates/[key]/test-send
//
// Sends a one-off rendered copy of the template to a chosen address (defaults
// to the calling admin's own email) so the team can sanity-check formatting
// in real clients before the customer ever sees it. Accepts the in-progress
// subject/html so you can preview unsaved edits, plus example variables.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { key } = await params;
  if (!BUILTIN_TEMPLATES.some((t) => t.key === key)) {
    return NextResponse.json({ error: 'Unknown template' }, { status: 404 });
  }

  let body: { to?: string; subject?: string; html?: string; variables?: Record<string, string> } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — we just use the stored template + admin email.
  }

  const to = (body.to || auth.email || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: 'A valid recipient email is required.' }, { status: 400 });
  }

  // Render: use the in-flight subject/html if supplied, otherwise the stored
  // template (which `renderEmailTemplate` already resolves from DB → builtin).
  let subject = '';
  let html = '';
  if (body.subject || body.html) {
    const builtin = getBuiltinTemplate(key)!;
    const merged: Record<string, string | number | undefined | null> = {
      siteName: 'AWULA K',
      ...Object.fromEntries(builtin.variables.map((v) => [v, ''])),
      ...(body.variables || {}),
    };
    const fill = (s: string) =>
      s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, n) => String(merged[n] ?? ''));
    subject = fill(body.subject || builtin.subject);
    html = fill(body.html || builtin.html);
  } else {
    const rendered = await renderEmailTemplate(key, body.variables || {});
    if (!rendered) {
      return NextResponse.json({ error: 'Template is disabled or missing.' }, { status: 400 });
    }
    subject = rendered.subject;
    html = rendered.html;
  }

  // Tag the subject so test sends are never mistaken for the real thing in
  // a customer inbox if the wrong "to" is keyed in by accident.
  const taggedSubject = `[TEST] ${subject}`;

  if (!isEmailConfigured()) {
    console.log(`[EMAIL-MOCK] test-send ${key} -> ${to}: ${taggedSubject}`);
    await recordAudit({
      actorEmail: auth.email,
      action: 'other',
      entity: 'EmailTemplate',
      entityId: key,
      summary: `Test-send ${key} to ${to} (mocked — SendGrid not configured)`,
    });
    return NextResponse.json({ ok: true, mocked: true, sentTo: to });
  }

  try {
    await sgMail.send({
      from: process.env.FROM_EMAIL || 'AWULA K <info@awulak.com>',
      to,
      subject: taggedSubject,
      html,
      ...(process.env.REPLY_TO_EMAIL ? { replyTo: process.env.REPLY_TO_EMAIL } : {}),
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
        openTracking: { enable: false },
      },
    });
  } catch (err) {
    console.error('Failed to test-send template', key, err);
    return NextResponse.json({ error: 'SendGrid rejected the message.' }, { status: 502 });
  }

  await recordAudit({
    actorEmail: auth.email,
    action: 'other',
    entity: 'EmailTemplate',
    entityId: key,
    summary: `Test-send ${key} to ${to}`,
  });

  return NextResponse.json({ ok: true, mocked: false, sentTo: to });
}
