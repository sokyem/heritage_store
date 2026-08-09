import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

// Next.js auto-serves this at /robots.txt. Allow public storefront crawling
// but block private surfaces (account, checkout, admin, designer workspace,
// API, NextAuth, video rooms) so they don't show up in search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/api/',
          '/auth/',
          '/cart',
          '/checkout',
          '/customer',
          '/customer/',
          '/dashboard',
          '/designer',
          '/designer/',
          '/inbox',
          '/inbox/',
          '/profile',
          '/profile/',
          '/orders',
          '/orders/',
          '/measurements',
          '/measurements/',
          '/wishlist',
          '/video-call',
          '/video-call/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
