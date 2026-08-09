/**
 * Social traffic redirect — /go/[channel]
 *
 * Short UTM-tagged links for use in social bios and link stickers.
 *
 * Examples:
 *   https://www.awulak.com/go/tiktok      → /matchday?utm_source=tiktok&utm_medium=social&utm_campaign=matchday
 *   https://www.awulak.com/go/instagram   → /matchday?utm_source=instagram&utm_medium=social&utm_campaign=matchday
 *   https://www.awulak.com/go/shop        → /collections?utm_source=social&utm_medium=link&utm_campaign=shop
 *
 * Add the link to your TikTok/Instagram bio — every click is tracked in
 * Google Analytics / your analytics dashboard via the utm_* params.
 */

import { NextRequest, NextResponse } from 'next/server';

const CHANNEL_MAP: Record<string, { destination: string; source: string; medium: string; campaign: string }> = {
  tiktok: {
    destination: '/matchday',
    source: 'tiktok',
    medium: 'social',
    campaign: 'matchday',
  },
  instagram: {
    destination: '/matchday',
    source: 'instagram',
    medium: 'social',
    campaign: 'matchday',
  },
  reels: {
    destination: '/matchday',
    source: 'instagram',
    medium: 'reels',
    campaign: 'matchday',
  },
  shop: {
    destination: '/collections',
    source: 'social',
    medium: 'link',
    campaign: 'shop',
  },
  jerseys: {
    destination: '/matchday',
    source: 'social',
    medium: 'link',
    campaign: 'jerseys',
  },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel } = await params;
  const config = CHANNEL_MAP[channel.toLowerCase()];

  if (!config) {
    // Unknown channel — fall back to the homepage
    return NextResponse.redirect(new URL('/', process.env.NEXTAUTH_URL || 'https://www.awulak.com'), 302);
  }

  const base = process.env.NEXTAUTH_URL || 'https://www.awulak.com';
  const url = new URL(config.destination, base);
  url.searchParams.set('utm_source', config.source);
  url.searchParams.set('utm_medium', config.medium);
  url.searchParams.set('utm_campaign', config.campaign);

  return NextResponse.redirect(url, 302);
}
