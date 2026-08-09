import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendTemplate } from '@/lib/email';
import { STOREFRONT_ORDER_NOTE_PREFIX } from '@/lib/auto-shipping';

// POST /api/cron/review-prompts
//
// Sends a single "leave a review" email 3-7 days after a storefront order
// is delivered. We trigger off Shipment.actualDelivery (set by both the
// USPS/UPS webhook and the admin mark-delivered button), find the linked
// storefront order via the note prefix, and dedup on a Notification row
// of type='review_prompt_sent'.
//
// Schedule once a day:
//   0 15 * * *  POST https://www.awulak.com/api/cron/review-prompts
//               Header: Authorization: Bearer ${CRON_SECRET}

const APP_URL = process.env.NEXTAUTH_URL || 'https://www.awulak.com';

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
  const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);

  // Recently delivered shipments — wide enough net to catch any we missed
  // earlier if a cron run failed. Dedup at the notification layer.
  const shipments = await prisma.shipment.findMany({
    where: {
      status: 'delivered',
      actualDelivery: { lte: threeDaysAgo, gte: tenDaysAgo },
    },
    take: 100,
  });

  const results: Array<{ shipmentId: string; status: 'sent' | 'skipped'; reason?: string }> = [];

  for (const shipment of shipments) {
    // Find the linked storefront order. The shipment may be attached via
    // either the explicit storefrontOrderId column or via a note prefix
    // (auto-shipping.ts created shipments use the prefix). Belt + suspenders.
    let orderId = shipment.storefrontOrderId;
    if (!orderId && shipment.notes?.includes(STOREFRONT_ORDER_NOTE_PREFIX)) {
      const match = shipment.notes.match(
        new RegExp(`${STOREFRONT_ORDER_NOTE_PREFIX}([a-zA-Z0-9_-]+)`),
      );
      if (match) orderId = match[1];
    }
    if (!orderId) {
      results.push({ shipmentId: shipment.id, status: 'skipped', reason: 'no-order-link' });
      continue;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        product: { select: { id: true, name: true } },
      },
    });
    if (!order || !order.user?.email) {
      results.push({ shipmentId: shipment.id, status: 'skipped', reason: 'no-customer-email' });
      continue;
    }

    const already = await prisma.notification.findFirst({
      where: { type: 'review_prompt_sent', relatedId: order.id },
      select: { id: true },
    });
    if (already) {
      results.push({ shipmentId: shipment.id, status: 'skipped', reason: 'already-sent' });
      continue;
    }

    const reviewUrl = order.product?.id
      ? `${APP_URL.replace(/\/$/, '')}/products/${order.product.id}#review`
      : `${APP_URL.replace(/\/$/, '')}/orders/${order.id}`;

    const sent = await sendTemplate('review_prompt', order.user.email, {
      name: order.user.name || 'there',
      productName: order.product?.name || 'your order',
      reviewUrl,
    }).catch((err) => {
      console.error('[review-prompts] send failed', order.id, err);
      return false;
    });

    if (sent) {
      await prisma.notification.create({
        data: {
          userId: order.user.id,
          type: 'review_prompt_sent',
          title: 'Review prompt sent',
          message: `Review request emailed for ${order.product?.name || 'order'}`,
          relatedId: order.id,
        },
      }).catch(() => null);
      results.push({ shipmentId: shipment.id, status: 'sent' });
    } else {
      results.push({ shipmentId: shipment.id, status: 'skipped', reason: 'send-failed' });
    }
  }

  return NextResponse.json({
    checked: shipments.length,
    sent: results.filter((r) => r.status === 'sent').length,
    results,
  });
}
