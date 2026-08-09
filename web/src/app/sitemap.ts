import type { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';
import { SITE_URL } from '@/lib/site-url';

// Rebuild the sitemap at most once an hour so newly published products /
// collections / pages get indexed without us paying the cost on every request.
export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

// Static high-value routes the marketing team always wants indexed. Anything
// gated behind auth (cart, profile, dashboard, admin, designer) is blocked in
// robots.ts and intentionally omitted here.
const STATIC_PATHS: Array<{ path: string; changeFrequency?: Entry['changeFrequency']; priority?: number }> = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/products', changeFrequency: 'daily', priority: 0.9 },
  { path: '/collections', changeFrequency: 'daily', priority: 0.8 },
  { path: '/consultations', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/become-a-designer', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/search', changeFrequency: 'monthly', priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: Entry[] = STATIC_PATHS.map((s) => ({
    url: `${SITE_URL}${s.path}`,
    lastModified: now,
    changeFrequency: s.changeFrequency,
    priority: s.priority,
  }));

  // Pull just what the sitemap needs — slug + updatedAt — and ignore drafts /
  // collections without a slug (those have no public URL).
  let productEntries: Entry[] = [];
  let collectionEntries: Entry[] = [];
  let pageEntries: Entry[] = [];

  try {
    const [products, collections, pages] = await Promise.all([
      prisma.adminProduct.findMany({
        where: { isPublished: true, slug: { not: null } },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5000,
      }),
      prisma.adminCollection.findMany({
        where: { isActive: true, slug: { not: null } },
        select: { slug: true, updatedAt: true },
        take: 1000,
      }),
      prisma.page.findMany({
        where: { status: 'published' },
        select: { slug: true, updatedAt: true },
        take: 1000,
      }),
    ]);

    productEntries = products
      .filter((p) => p.slug)
      .map((p) => ({
        url: `${SITE_URL}/products/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));

    collectionEntries = collections
      .filter((c) => c.slug)
      .map((c) => ({
        url: `${SITE_URL}/collections/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));

    pageEntries = pages.map((pg) => ({
      url: `${SITE_URL}/p/${pg.slug}`,
      lastModified: pg.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }));
  } catch (err) {
    // Never let a DB hiccup take the sitemap down — fall back to static routes
    // so Googlebot still gets *something* useful.
    console.error('sitemap: failed to load dynamic entries', err);
  }

  return [...staticEntries, ...collectionEntries, ...productEntries, ...pageEntries];
}
