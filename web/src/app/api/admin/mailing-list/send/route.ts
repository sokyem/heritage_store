import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import {
  buildAudience, sendToAudience, textToHtml, firstProductImage, productUrl, fmtUsd,
  type AudienceKey,
} from '@/lib/mailing-list';

// POST /api/admin/mailing-list/send
//
// Manual broadcast. Two modes:
//   { mode: 'message', audience, subject, body }   → free-text campaign
//   { mode: 'product', audience, productId }       → new-arrival announcement
//
// Sends to the deduped audience (customers + opt-ins) and records a
// MarketingCampaign row with the tallies.

const AUDIENCES: AudienceKey[] = ['all', 'customers', 'subscribers'];

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

  const mode = body.mode === 'product' ? 'product' : 'message';
  const audience: AudienceKey = AUDIENCES.includes(body.audience) ? body.audience : 'all';

  // Resolve the template + variables for the chosen mode.
  let templateKey: string;
  let subject: string;
  let storedHtml: string;
  let productId: string | null = null;
  let perRecipientVars: (r: { email: string }) => Record<string, string | number | undefined | null>;

  if (mode === 'product') {
    productId = typeof body.productId === 'string' ? body.productId : '';
    if (!productId) return NextResponse.json({ error: 'Pick a product to announce.' }, { status: 400 });

    const product = await prisma.adminProduct.findUnique({
      where: { id: productId },
      select: { id: true, name: true, slug: true, price: true, images: true, description: true, isPublished: true },
    });
    if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    if (!product.isPublished) return NextResponse.json({ error: 'Publish the product before announcing it.' }, { status: 400 });

    templateKey = 'new_product_announcement';
    subject = `New arrival: ${product.name}`;
    storedHtml = `New arrival announcement for ${product.name}`;
    const vars = {
      productName: product.name,
      productImage: firstProductImage(product.images),
      blurb: product.description || 'Discover our latest piece.',
      price: fmtUsd(product.price),
      productUrl: productUrl(product.slug || product.id),
    };
    perRecipientVars = () => vars;
  } else {
    subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!subject) return NextResponse.json({ error: 'Subject is required.' }, { status: 400 });
    if (!text) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });

    templateKey = 'newsletter_campaign';
    const html = textToHtml(text);
    storedHtml = html;
    const ctaBlock = typeof body.ctaUrl === 'string' && body.ctaUrl.trim()
      ? `<div style="text-align:center;margin-top:24px;"><a href="${body.ctaUrl.trim()}" style="display:inline-block;background:#1B2A5B;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;">${(typeof body.ctaLabel === 'string' && body.ctaLabel.trim()) || 'Shop now'}</a></div>`
      : '';
    perRecipientVars = () => ({ subject, body: html, ctaBlock });
  }

  // Build the audience now so we can record the recipient count.
  const recipients = await buildAudience(audience);
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No one is on this list yet.' }, { status: 400 });
  }

  const campaign = await prisma.marketingCampaign.create({
    data: {
      type: mode === 'product' ? 'new_product' : 'manual',
      subject,
      bodyHtml: storedHtml,
      audience,
      status: 'sending',
      productId,
      recipientCount: recipients.length,
      createdBy: auth.email,
    },
  });

  const { sent, failed } = await sendToAudience(templateKey, recipients, perRecipientVars);

  await prisma.marketingCampaign.update({
    where: { id: campaign.id },
    data: {
      status: failed > 0 && sent === 0 ? 'failed' : 'sent',
      sentCount: sent,
      failedCount: failed,
      sentAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, campaignId: campaign.id, recipients: recipients.length, sent, failed });
}
