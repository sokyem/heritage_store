/**
 * POST /api/email/inbound
 *
 * SendGrid Inbound Parse webhook. When a customer replies to one of our emails,
 * SendGrid POSTs the parsed message here (multipart/form-data). We decode the
 * thread token from the recipient address and file the reply into the right
 * order thread or inbox conversation — so every conversation lives in the app.
 *
 * Configure in SendGrid → Inbound Parse with destination:
 *   https://www.awulak.com/api/email/inbound?key=<INBOUND_WEBHOOK_SECRET>
 * See lib/inbound.ts for the full DNS/SendGrid setup.
 *
 * Hits the DB and must never be statically prerendered.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ADMIN_ROLES, type Role } from '@/lib/roles';
import { parseThreadAddress, extractReplyText } from '@/lib/inbound';

export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET = process.env.INBOUND_WEBHOOK_SECRET || '';

// Pull the first email address out of a "Name <a@b>, x@y" style header.
function firstEmail(value: string): string {
  const m = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : '';
}

// Find the thread token across the `to` header and the envelope `to[]`.
function resolveToken(toHeader: string, envelope: string) {
  const candidates: string[] = [];
  if (toHeader) candidates.push(...toHeader.split(','));
  try {
    const env = JSON.parse(envelope || '{}');
    if (Array.isArray(env.to)) candidates.push(...env.to);
  } catch { /* ignore */ }
  for (const c of candidates) {
    const parsed = parseThreadAddress(c);
    if (parsed) return parsed;
  }
  return null;
}

async function notifyAdmins(title: string, message: string, relatedId: string) {
  const admins = await prisma.user.findMany({ where: { role: { in: ['founder', 'staff'] } }, select: { id: true } });
  if (!admins.length) return;
  const existing = await prisma.notification.findFirst({ where: { type: 'customer_reply', relatedId } });
  if (existing) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, type: 'customer_reply', title, message, relatedId })),
  }).catch((err) => console.error('[email/inbound] admin notify failed:', err));
}

export async function POST(req: NextRequest) {
  // Reject forged calls when a secret is configured.
  if (WEBHOOK_SECRET) {
    const key = new URL(req.url).searchParams.get('key') || req.headers.get('x-webhook-secret') || '';
    if (key !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const form = await req.formData();
    const get = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : '');

    const token = resolveToken(get('to'), get('envelope'));
    const fromEmail = firstEmail(get('from') || get('envelope'));
    const body = extractReplyText(get('text') || '');
    const subject = get('subject') || '';

    if (!body) {
      return NextResponse.json({ ok: true, ignored: 'empty body' });
    }

    // ── Order thread ──────────────────────────────────────────────
    if (token?.kind === 'order') {
      const order = await prisma.order.findUnique({ where: { id: token.id }, select: { id: true, user: { select: { name: true } } } });
      if (!order) return NextResponse.json({ ok: true, ignored: 'order not found' });
      await prisma.orderMessage.create({
        data: { orderId: order.id, direction: 'inbound', content: body, sentBy: order.user?.name || fromEmail || 'Customer' },
      });
      await notifyAdmins('Customer replied to an order', `${fromEmail || 'A customer'}: ${body.slice(0, 120)}`, order.id);
      return NextResponse.json({ ok: true, routed: 'order', orderId: order.id });
    }

    // ── Inbox conversation ────────────────────────────────────────
    if (token?.kind === 'conv') {
      const convo = await prisma.conversation.findUnique({
        where: { id: token.id },
        include: { participants: { select: { id: true, role: true } } },
      });
      if (!convo) return NextResponse.json({ ok: true, ignored: 'conversation not found' });
      // Attribute to the customer participant (or the sender if matched).
      const customer = convo.participants.find((p) => !ADMIN_ROLES.includes(p.role as Role)) || convo.participants[0];
      const sender = fromEmail ? await prisma.user.findUnique({ where: { email: fromEmail }, select: { id: true } }) : null;
      const userId = sender?.id || customer?.id;
      if (!userId) return NextResponse.json({ ok: true, ignored: 'no attributable user' });
      await prisma.message.create({ data: { conversationId: convo.id, userId, content: body, isRead: false } });
      await prisma.conversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
      await notifyAdmins('New customer message', `${fromEmail || 'A customer'}: ${body.slice(0, 120)}`, convo.id);
      return NextResponse.json({ ok: true, routed: 'conversation', conversationId: convo.id });
    }

    // ── No token — open a fresh inbox conversation if we know the sender ──
    if (fromEmail) {
      const user = await prisma.user.findUnique({ where: { email: fromEmail }, select: { id: true, name: true } });
      if (user) {
        const staff = await prisma.user.findMany({ where: { role: { in: ['founder', 'staff'] } }, select: { id: true } });
        const convo = await prisma.conversation.create({
          data: {
            title: subject || `Message from ${user.name || fromEmail}`,
            participants: { connect: [{ id: user.id }, ...staff.map((s) => ({ id: s.id }))] },
            messages: { create: { userId: user.id, content: body, isRead: false } },
          },
        });
        await notifyAdmins('New customer message', `${fromEmail}: ${body.slice(0, 120)}`, convo.id);
        return NextResponse.json({ ok: true, routed: 'new-conversation', conversationId: convo.id });
      }
    }

    // Unknown sender + no token: acknowledge so SendGrid doesn't retry.
    return NextResponse.json({ ok: true, ignored: 'unmatched sender' });
  } catch (error) {
    console.error('[email/inbound] handler error:', error);
    // 200 so SendGrid doesn't hammer retries on a transient error.
    return NextResponse.json({ ok: false, error: 'handler error' });
  }
}
