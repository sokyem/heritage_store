import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveStorefrontImage, isStorefrontCategoryBuyable } from '@/lib/storefront-media';
import { parseProductImages } from '@/lib/product-images';

/**
 * Product catalog feed in the Google Shopping RSS 2.0 format.
 *
 * One feed serves BOTH ad platforms:
 *   - Google Merchant Center  → Shopping ads + free listings
 *   - Meta (Facebook/Instagram) Commerce Manager → dynamic product ads
 *
 * Point each platform's scheduled fetch at:
 *   https://www.awulak.com/api/feed/products
 *
 * Only published, buyable products are included (bespoke/consultation-only
 * categories are excluded — they have no fixed "add to cart" price).
 */

const APP_URL = (process.env.NEXTAUTH_URL || 'https://www.awulak.com').replace(/\/$/, '');
const BRAND = 'AWULA K';

// Rendered per request (it queries the DB, so it can't be prerendered at build
// time — there's no database then). Edge/CDN caching is handled by the
// Cache-Control header on the response below, so ad platforms still fetch a
// cached copy on their hourly schedule.
export const dynamic = 'force-dynamic';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function absoluteUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function GET() {
  const products = await prisma.adminProduct.findMany({
    where: { isPublished: true },
    orderBy: { updatedAt: 'desc' },
    include: {
      collection: { select: { name: true, slug: true } },
      variants: true,
    },
  });

  const items: string[] = [];

  for (const p of products) {
    const displayCategory = p.collection?.name || p.category || 'Women';
    if (!isStorefrontCategoryBuyable(displayCategory, p.category)) continue;

    const slug = p.slug || p.id;
    const link = `${APP_URL}/products/${slug}`;

    const images = parseProductImages(p.images).map((e) =>
      absoluteUrl(resolveStorefrontImage(e.url, { category: displayCategory, slug }))
    );
    const imageLink = images[0];
    if (!imageLink) continue; // feeds reject items without an image

    const inStock = !p.trackInventory
      ? true
      : p.variants.length > 0
        ? p.variants.some((v) => v.isAvailable && v.stock > 0)
        : p.totalStock > 0;

    const title = xmlEscape(p.name);
    const description = xmlEscape(
      (p.description || p.longDescription || p.name).replace(/\s+/g, ' ').trim().slice(0, 5000)
    );

    const parts: string[] = [
      `<g:id>${xmlEscape(p.sku || p.id)}</g:id>`,
      `<g:title>${title}</g:title>`,
      `<g:description>${description}</g:description>`,
      `<g:link>${xmlEscape(link)}</g:link>`,
      `<g:image_link>${xmlEscape(imageLink)}</g:image_link>`,
      ...images.slice(1, 11).map((url) => `<g:additional_image_link>${xmlEscape(url)}</g:additional_image_link>`),
      `<g:availability>${inStock ? 'in_stock' : 'out_of_stock'}</g:availability>`,
      `<g:price>${p.price.toFixed(2)} USD</g:price>`,
      ...(p.compareAtPrice && p.compareAtPrice > p.price
        ? [`<g:sale_price>${p.price.toFixed(2)} USD</g:sale_price>`]
        : []),
      `<g:brand>${xmlEscape(BRAND)}</g:brand>`,
      `<g:condition>new</g:condition>`,
      `<g:product_type>${xmlEscape(displayCategory)}</g:product_type>`,
      ...(p.gender ? [`<g:gender>${xmlEscape(p.gender)}</g:gender>`] : []),
    ];

    items.push(`    <item>\n      ${parts.join('\n      ')}\n    </item>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(BRAND)} Product Feed</title>
    <link>${xmlEscape(APP_URL)}</link>
    <description>Bespoke African couture, ready-to-wear, and luxury accessories.</description>
${items.join('\n')}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
