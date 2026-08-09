import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendTemplate } from '@/lib/email';
import { firstProductImage, productUrl, unsubscribeUrl } from '@/lib/mailing-list';
import { randomUUID } from 'crypto';

// POST /api/cron/back-in-stock
//
// Emails customers who asked to be notified once a sold-out product is
// restocked. A request fires when its product is back in stock (inventory
// not tracked, totalStock > 0, or an available variant with stock). We
// stamp notifiedAt so nobody is notified twice for the same restock.
//
// The unsubscribe link reuses the subscriber's token if they're on the
// list; otherwise we mint a one-off NewsletterSubscriber-less token via a
// throwaway subscriber row so the footer link always resolves.
//
// Schedule a few times a day, e.g.:
//   0 */6 * * *  POST https://www.awulak.com/api/cron/back-in-stock
//                Header: Authorization: Bearer ${CRON_SECRET}

function inStock(p: { trackInventory: boolean; totalStock: number; variants: { stock: number; isAvailable: boolean }[] }): boolean {
  if (!p.trackInventory) return true;
  if (p.variants.length > 0) return p.variants.some((v) => v.isAvailable && v.stock > 0);
  return p.totalStock > 0;
}

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const pending = await prisma.backInStockRequest.findMany({
    where: { notifiedAt: null },
    take: 200,
    include: {
      product: {
        select: { id: true, name: true, slug: true, images: true, trackInventory: true, totalStock: true, isPublished: true, variants: { select: { stock: true, isAvailable: true } } },
      },
    },
  });

  const results: Array<{ id: string; status: string }> = [];

  for (const reqRow of pending) {
    const p = reqRow.product;
    if (!p || !p.isPublished || !inStock(p)) {
      results.push({ id: reqRow.id, status: 'still-out' });
      continue;
    }

    // Resolve an unsubscribe token for this email.
    let token: string | null = null;
    const user = await prisma.user.findUnique({ where: { email: reqRow.email }, select: { id: true, marketingToken: true } });
    if (user) {
      token = user.marketingToken;
      if (!token) {
        token = randomUUID();
        await prisma.user.update({ where: { id: user.id }, data: { marketingToken: token } });
      }
    } else {
      const sub = await prisma.newsletterSubscriber.findUnique({ where: { email: reqRow.email }, select: { unsubToken: true } });
      token = sub?.unsubToken || null;
    }

    const ok = await sendTemplate('back_in_stock', reqRow.email, {
      name: reqRow.name || 'there',
      productName: p.name,
      productImage: firstProductImage(p.images),
      productUrl: productUrl(p.slug || p.id),
      unsubscribeUrl: token ? unsubscribeUrl(token) : `${(process.env.NEXTAUTH_URL || 'https://www.awulak.com').replace(/\/$/, '')}/`,
    }).catch(() => false);

    if (ok) {
      await prisma.backInStockRequest.update({ where: { id: reqRow.id }, data: { notifiedAt: new Date() } });
      results.push({ id: reqRow.id, status: 'notified' });
    } else {
      results.push({ id: reqRow.id, status: 'send-failed' });
    }
  }

  return NextResponse.json({
    checked: pending.length,
    notified: results.filter((r) => r.status === 'notified').length,
    results,
  });
}
