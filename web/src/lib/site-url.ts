// Single source of truth for the public site URL. Used by sitemap, robots,
// JSON-LD structured data, and anywhere we emit an absolute customer-facing
// link. Honours NEXT_PUBLIC_SITE_URL (preferred) and falls back to NEXTAUTH_URL
// (which is already set everywhere) so we don't have to add a new env var
// to every deployment immediately.
export const SITE_URL: string = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXTAUTH_URL ||
  'https://www.awulak.com'
).replace(/\/$/, '');

/** Join the configured site URL with a path, guaranteeing exactly one slash. */
export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
