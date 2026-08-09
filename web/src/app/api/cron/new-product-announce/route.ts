import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  buildAudience, sendToAudience, firstProductImage, productUrl, fmtUsd,
} from '@/lib/mailing-list';

// POST /api/cron/new-product-announce
//
// Auto-announces freshly published new arrivals to the mailing list. A
// product qualifies when it is published, flagged isNewArrival, created in
// the last ~25h, and has NOT already been announced (no new_product
// MarketingCampaign row for its id — that row is also the dedupe key).
//
// Cap per run so a bulk import can't blast dozens of emails at once;
// leftovers go out on the next day's run.
//
// Schedule daily, e.g.:
//   0 16 * * *  POST https://www.awulak.com/api/cron/new-product-announce
//               Header: Authorization: Bearer ${CRON_SECRET}

const MAX_PER_RUN = 3;

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const since = new Date(Date.now() - 25 * 60 * 60 * 1000);

  const candidates = await prisma.adminProduct.findMany({
    where: { isPublished: true, isNewArrival: true, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { id: true, name: true, slug: true, price: true, images: true, description: true },
  });

  const results: Array<{ productId: string; status: string; sent?: number }> = [];
  let announced = 0;

  for (const product of candidates) {
    if (announced >= MAX_PER_RUN) {
      results.push({ productId: product.id, status: 'deferred-to-next-run' });
      continue;
    }

    const already = await prisma.marketingCampaign.findFirst({
      where: { type: 'new_product', productId: product.id },
      select: { id: true },
    });
    if (already) {
      results.push({ productId: product.id, status: 'already-announced' });
      continue;
    }

    const recipients = await buildAudience('all');
    if (recipients.length === 0) {
      results.push({ productId: product.id, status: 'no-audience' });
      continue;
    }

    const campaign = await prisma.marketingCampaign.create({
      data: {
        type: 'new_product',
        subject: `New arrival: ${product.name}`,
        bodyHtml: `Automated new-arrival announcement for ${product.name}`,
        audience: 'all',
        status: 'sending',
        productId: product.id,
        recipientCount: recipients.length,
        createdBy: 'cron',
      },
    });

    const vars = {
      productName: product.name,
      productImage: firstProductImage(product.images),
      blurb: product.description || 'Discover our latest piece.',
      price: fmtUsd(product.price),
      productUrl: productUrl(product.slug || product.id),
    };
    const { sent, failed } = await sendToAudience('new_product_announcement', recipients, () => vars);

    await prisma.marketingCampaign.update({
      where: { id: campaign.id },
      data: { status: failed > 0 && sent === 0 ? 'failed' : 'sent', sentCount: sent, failedCount: failed, sentAt: new Date() },
    });

    announced++;
    results.push({ productId: product.id, status: 'announced', sent });
  }

  return NextResponse.json({ checked: candidates.length, announced, results });
}
