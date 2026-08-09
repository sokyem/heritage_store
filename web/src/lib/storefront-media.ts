import storefrontImageManifest from '@/lib/generated/storefront-image-manifest.json';

const LEGACY_AWULAK_IMAGE_HOSTS = new Set(['awulak.com', 'www.awulak.com']);
const importedStorefrontImages = storefrontImageManifest as Record<string, string | string[]>;

const fallbackImagePools: Record<string, string[]> = {
  women: ['/media/IMG_8376.jpg', '/media/IMG_3628.jpg', '/media/orange-mermaid-full.jpg'],
  dresses: ['/media/IMG_3628.jpg', '/media/orange-mermaid-full.jpg', '/media/silver-sequin-flow.jpg'],
  skirts: ['/media/IMG_8376.jpg', '/media/IMG_4753.jpg'],
  shirts: ['/media/IMG_7454.jpg', '/media/IMG_7537.jpg', '/media/IMG_8376.jpg'],
  kimonos: ['/media/IMG_8376.jpg', '/media/silver-sequin-drape.jpg'],
  men: ['/media/IMG_7454.jpg', '/media/IMG_7537.jpg', '/media/IMG_4753.jpg'],
  tees: ['/media/IMG_7454.jpg', '/media/IMG_7537.jpg'],
  prom: ['/media/orange-mermaid-full.jpg', '/media/silver-sequin-pose.jpg', '/media/bridal-beaded-full.jpg'],
  gowns: ['/media/orange-mermaid-full.jpg', '/media/bridal-beaded-full.jpg', '/media/silver-sequin-flow.jpg'],
  accessories: ['/media/jewelry-headwrap.jpg', '/media/jewelry-kente-clutch.jpg'],
  bonnets: ['/media/jewelry-headwrap.jpg', '/media/jewelry-kente-clutch.jpg'],
  headwear: ['/media/jewelry-headwrap.jpg'],
  bags: ['/media/jewelry-kente-clutch.jpg'],
  jewelry: ['/media/jewelry-cowrie-choker.jpg', '/media/jewelry-beaded-bracelet.jpg', '/media/jewelry-waist-beads.jpg'],
  necklaces: ['/media/jewelry-cowrie-choker.jpg', '/media/jewelry-waist-beads.jpg'],
  bracelets: ['/media/jewelry-beaded-bracelet.jpg', '/media/jewelry-waist-beads.jpg'],
  earrings: ['/media/jewelry-earrings.jpg', '/media/jewelry-beaded-bracelet.jpg'],
  'waist-beads': ['/media/jewelry-waist-beads.jpg'],
  couture: ['/media/IMG_8376.jpg', '/media/IMG_4753.jpg', '/media/silver-sequin-toast.jpg'],
  bridal: ['/media/bridal-veil-portrait.jpg', '/media/bridal-beaded-full.jpg'],
  ceremonial: ['/media/bridal-veil-portrait.jpg', '/media/IMG_8376.jpg'],
  default: ['/media/IMG_8376.jpg', '/media/IMG_3628.jpg', '/media/IMG_4753.jpg'],
};

function normalizeKey(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pickFallback(pool: string[], seed: string) {
  const safePool = pool.length ? pool : fallbackImagePools.default;
  const index = Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0) % safePool.length;
  return safePool[index];
}

function getFallbackPool(category?: string | null, slug?: string | null) {
  const keys = [normalizeKey(category), normalizeKey(slug)].filter(Boolean);

  for (const key of keys) {
    if (fallbackImagePools[key]) {
      return fallbackImagePools[key];
    }

    if (key.includes('bridal')) return fallbackImagePools.bridal;
    if (key.includes('couture')) return fallbackImagePools.couture;
    if (key.includes('jewelry')) return fallbackImagePools.jewelry;
    if (key.includes('accessories')) return fallbackImagePools.accessories;
    if (key.includes('prom')) return fallbackImagePools.prom;
    if (key.includes('women')) return fallbackImagePools.women;
    if (key.includes('men')) return fallbackImagePools.men;
  }

  return fallbackImagePools.default;
}

export function normalizeLegacyStorefrontSourceKey(value?: string | null) {
  if (!value) return null;

  if (value.startsWith('/cdn/shop/')) {
    return value;
  }

  try {
    const url = new URL(value);
    if (!LEGACY_AWULAK_IMAGE_HOSTS.has(url.hostname) || !url.pathname.startsWith('/cdn/shop/')) {
      return null;
    }
    return url.pathname;
  } catch {
    return null;
  }
}

function getImportedStorefrontImageFromManifest(value?: string | null, slug?: string | null) {
  if (!value && !slug) return null;

  const candidates: (string | null | undefined)[] = [];
  
  // First try slug directly (most reliable) — try normalized and raw forms
  if (slug) {
    candidates.push(normalizeKey(slug));
    if (slug !== normalizeKey(slug)) candidates.push(slug);
  }
  
  // Then try to parse the URL
  if (value) {
    candidates.push(normalizeLegacyStorefrontSourceKey(value), value);
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const entry = importedStorefrontImages[candidate];
    if (entry) {
      return Array.isArray(entry) ? entry[0] : entry;
    }
  }

  // Last resort: scan manifest keys and see if any normalizes to match the slug
  if (slug) {
    const normalizedSlug = normalizeKey(slug);
    for (const [key, entry] of Object.entries(importedStorefrontImages)) {
      if (normalizeKey(key) === normalizedSlug) {
        return Array.isArray(entry) ? entry[0] : entry;
      }
    }
  }

  return null;
}

export function isLegacyStorefrontImageUrl(value?: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return LEGACY_AWULAK_IMAGE_HOSTS.has(url.hostname) && url.pathname.startsWith('/cdn/shop/');
  } catch {
    return false;
  }
}

export function getImportedStorefrontImage(value?: string | null, slug?: string | null) {
  if (!value && !slug) return null;
  if (value?.startsWith('/')) return value;
  return getImportedStorefrontImageFromManifest(value, slug);
}

export function resolveStorefrontImage(
  value?: string | null,
  options?: { category?: string | null; slug?: string | null; fallback?: string }
) {
  const pool = getFallbackPool(options?.category, options?.slug);
  const fallback = options?.fallback || pickFallback(pool, `${options?.category || ''}:${options?.slug || ''}`);

  if (!value) {
    return fallback;
  }

  if (value.startsWith('/')) {
    return value;
  }

  const importedImage = getImportedStorefrontImageFromManifest(value, options?.slug);
  if (importedImage) {
    return importedImage;
  }

  return isLegacyStorefrontImageUrl(value) ? fallback : value;
}

/**
 * Decide whether a product is buyable from the storefront. Bespoke
 * categories (bridal, couture, ceremonial) require a consultation, so
 * the "Add to cart" button is hidden — the customer is routed to a
 * design conversation instead. Everything else is buy-now.
 */
function slugifyCategory(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function isStorefrontCategoryBuyable(displayCategory?: string, adminCategory?: string): boolean {
  const display = slugifyCategory(displayCategory || '');
  const admin = slugifyCategory(adminCategory || '');
  if (display === 'bridal' || display === 'couture') return false;
  if (admin === 'ceremonial') return false;
  return true;
}