import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { sendTemplate, isEmailConfigured } from '@/lib/email';

// POST /api/admin/notifications/test-email
//
// Fires a "test_email" template to either the configured admin notification
// address or a custom recipient supplied in the body. Used from the admin
// Settings → Notifications tab to verify end-to-end deliverability before
// the first real order shows up.
//
// Body (optional): { to?: string }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  if (!isEmailConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'SENDGRID_API_KEY is not set in Railway env. Email sending is in mock mode.' },
      { status: 503 },
    );
  }

  let body: { to?: string } = {};
  try {
    body = (await req.json()) as { to?: string };
  } catch {
    // empty body is fine — defaults to ADMIN_NOTIFICATION_EMAIL
  }

  const defaultTo = process.env.ADMIN_NOTIFICATION_EMAIL || 'awulak.ent@gmail.com';
  const to = (body.to || defaultTo).trim();

  // Basic format check — guard against accidentally blasting to an empty/invalid address.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ ok: false, error: `Not a valid email address: "${to}"` }, { status: 400 });
  }

  const sentAt = new Date().toISOString().replace('T', ' ').replace(/\..*/, ' UTC');
  const ok = await sendTemplate('test_email', to, {
    sentAt,
    fromAddress: process.env.FROM_EMAIL || 'AWULA K <info@awulak.com>',
    triggeredBy: auth.email || 'admin',
  });

  if (!ok) {
    return NextResponse.json(
      { ok: false, error: 'SendGrid call failed — check server logs for the SendGrid error message.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sentTo: to, sentAt });
}
