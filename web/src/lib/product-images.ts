/**
 * Shared helpers for product image arrays that may include per-color tags.
 *
 * Storage format (TEXT JSON on AdminProduct.images):
 *   Legacy:    ["https://...", "https://..."]
 *   New:       [{ "url": "https://...", "color": "Red", "label": "Front" }, "https://..."]
 *
 * Plain strings remain valid and are treated as untagged images.
 */

export interface ProductImage {
  url: string;
  color?: string | null;
  label?: string | null;
}

export function parseProductImages(value?: string | null): ProductImage[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ProductImage[] = [];
  for (const item of parsed) {
    if (typeof item === 'string') {
      const url = item.trim();
      if (url) out.push({ url });
    } else if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const url = typeof rec.url === 'string' ? rec.url.trim() : '';
      if (!url) continue;
      const color = typeof rec.color === 'string' && rec.color.trim() ? rec.color.trim() : null;
      const label = typeof rec.label === 'string' && rec.label.trim() ? rec.label.trim() : null;
      out.push({ url, color, label });
    }
  }
  return out;
}

export function serializeProductImages(entries: ProductImage[]): string {
  // Compact form: write plain strings for untagged images (backward compat).
  const compact = entries
    .map((e) => {
      const url = (e.url || '').trim();
      if (!url) return null;
      if (!e.color && !e.label) return url;
      const obj: Record<string, string> = { url };
      if (e.color) obj.color = e.color;
      if (e.label) obj.label = e.label;
      return obj;
    })
    .filter((x): x is string | Record<string, string> => x !== null);
  return JSON.stringify(compact);
}

/** Pull just the URLs (for legacy callers that expect string[]). */
export function imageUrlsOnly(entries: ProductImage[]): string[] {
  return entries.map((e) => e.url).filter((u): u is string => !!u);
}

/** Pick the best image URL for a given color, falling back to first available. */
export function pickImageForColor(entries: ProductImage[], color?: string | null): string | null {
  if (!entries.length) return null;
  if (color) {
    const needle = color.trim().toLowerCase();
    const match = entries.find((e) => e.color && e.color.trim().toLowerCase() === needle);
    if (match) return match.url;
  }
  return entries[0]?.url ?? null;
}

/** Order images so the matching color comes first, then others (stable). */
export function orderImagesForColor(entries: ProductImage[], color?: string | null): ProductImage[] {
  if (!color) return entries;
  const needle = color.trim().toLowerCase();
  const match: ProductImage[] = [];
  const rest: ProductImage[] = [];
  for (const e of entries) {
    if (e.color && e.color.trim().toLowerCase() === needle) match.push(e);
    else rest.push(e);
  }
  return [...match, ...rest];
}
