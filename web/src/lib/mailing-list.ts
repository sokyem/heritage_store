import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { sendTemplate } from '@/lib/email';

const APP_URL = (process.env.NEXTAUTH_URL || 'https://www.awulak.com').replace(/\/$/, '');

export type AudienceKey = 'all' | 'customers' | 'subscribers';

export interface Recipient {
  email: string;
  name: string | null;
  token: string;
  kind: 'user' | 'subscriber';
}

/** One-click unsubscribe link. Token resolves to a User or a Subscriber. */
export function unsubscribeUrl(token: string): string {
  return `${APP_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Count the marketing audience without generating tokens — used for the
 * admin "this will reach N people" preview.
 */
export async function countAudience(audience: AudienceKey = 'all'): Promise<{
  customers: number;
  subscribers: number;
  total: number;
}> {
  const emails = new Set<string>();
  let customers = 0;
  let subscribers = 0;

  if (audience === 'all' || audience === 'customers') {
    const users = await prisma.user.findMany({
      where: { role: 'customer', marketingOptOut: false, email: { not: '' } },
      select: { email: true },
    });
    for (const u of users) {
      const e = u.email.toLowerCase();
      if (!emails.has(e)) { emails.add(e); customers++; }
    }
  }

  if (audience === 'all' || audience === 'subscribers') {
    const subs = await prisma.newsletterSubscriber.findMany({
      where: { status: 'subscribed' },
      select: { email: true },
    });
    for (const s of subs) {
      const e = s.email.toLowerCase();
      if (!emails.has(e)) { emails.add(e); subscribers++; }
    }
  }

  return { customers, subscribers, total: emails.size };
}

/**
 * Build the deduped recipient list, generating an unsubscribe token for any
 * customer who doesn't yet have one. A customer email wins over a bare
 * subscriber row for the same address.
 */
export async function buildAudience(audience: AudienceKey = 'all'): Promise<Recipient[]> {
  const byEmail = new Map<string, Recipient>();

  if (audience === 'all' || audience === 'customers') {
    const users = await prisma.user.findMany({
      where: { role: 'customer', marketingOptOut: false, email: { not: '' } },
      select: { id: true, email: true, name: true, marketingToken: true },
    });
    for (const u of users) {
      const key = u.email.toLowerCase();
      let token = u.marketingToken;
      if (!token) {
        token = randomUUID();
        await prisma.user.update({ where: { id: u.id }, data: { marketingToken: token } });
      }
      byEmail.set(key, { email: u.email, name: u.name, token, kind: 'user' });
    }
  }

  if (audience === 'all' || audience === 'subscribers') {
    const subs = await prisma.newsletterSubscriber.findMany({
      where: { status: 'subscribed' },
      select: { email: true, name: true, unsubToken: true },
    });
    for (const s of subs) {
      const key = s.email.toLowerCase();
      if (byEmail.has(key)) continue; // customer row already covers this address
      byEmail.set(key, { email: s.email, name: s.name, token: s.unsubToken, kind: 'subscriber' });
    }
  }

  return [...byEmail.values()];
}

/**
 * Send one marketing template to every recipient in the audience, threading
 * each recipient's personal unsubscribe link through. Returns send tallies.
 * Sends sequentially to stay well under SendGrid rate limits.
 */
export async function sendToAudience(
  templateKey: string,
  recipients: Recipient[],
  variablesFor: (r: Recipient) => Record<string, string | number | undefined | null>,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const ok = await sendTemplate(templateKey, r.email, {
      ...variablesFor(r),
      name: r.name || 'there',
      unsubscribeUrl: unsubscribeUrl(r.token),
    }).catch(() => false);
    if (ok) sent++; else failed++;
  }
  return { sent, failed };
}

/** Escape plain admin-typed text and turn newlines into <br/> for email HTML. */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\n/g, '<br/>');
}

/** First image URL from an AdminProduct.images JSON string, or a fallback. */
export function firstProductImage(images: string | null): string {
  if (!images) return `${APP_URL}/media/IMG_8376.jpg`;
  try {
    const arr = JSON.parse(images);
    if (Array.isArray(arr) && arr.length && typeof arr[0] === 'string') {
      const url = arr[0] as string;
      return url.startsWith('http') ? url : `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    }
  } catch {}
  return `${APP_URL}/media/IMG_8376.jpg`;
}

export function productUrl(slugOrId: string): string {
  return `${APP_URL}/products/${slugOrId}`;
}

export function fmtUsd(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
