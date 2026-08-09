'use client';

/**
 * Client-side ad/analytics tracking for Meta Pixel + Google Analytics 4.
 *
 * Both platforms are loaded from the same place (see components/Analytics.tsx)
 * and gated on env vars — if an ID is missing, the corresponding helper is a
 * no-op, so this is safe to call unconditionally from the storefront.
 *
 *   NEXT_PUBLIC_META_PIXEL_ID  — Meta (Facebook/Instagram) Pixel ID
 *   NEXT_PUBLIC_GA4_ID         — GA4 Measurement ID (G-XXXXXXXXXX)
 *
 * Events map to each platform's standard ecommerce vocabulary so they light up
 * conversion reporting, retargeting audiences, and dynamic product ads without
 * extra config:
 *
 *   intent          Meta              GA4
 *   ──────────────  ────────────────  ───────────────
 *   view category   ViewCategory*     view_item_list
 *   view product    ViewContent       view_item
 *   add to cart     AddToCart         add_to_cart
 *   begin checkout  InitiateCheckout  begin_checkout
 *   purchase        Purchase          purchase
 *   search          Search            search
 *   (* recommended custom event)
 */

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '';
export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID || '';

export const ANALYTICS_ENABLED = Boolean(META_PIXEL_ID || GA4_ID);

const CURRENCY = 'USD';

type Params = Record<string, unknown>;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function fbq(...args: unknown[]) {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq(...args);
  }
}

function gtag(...args: unknown[]) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag(...args);
  }
}

export interface TrackedProduct {
  id: string;
  name: string;
  price: number;
  category?: string;
  quantity?: number;
}

/** A single product page view. */
export function trackViewContent(p: TrackedProduct) {
  fbq('track', 'ViewContent', {
    content_ids: [p.id],
    content_name: p.name,
    content_type: 'product',
    content_category: p.category,
    value: p.price,
    currency: CURRENCY,
  });
  gtag('event', 'view_item', {
    currency: CURRENCY,
    value: p.price,
    items: [ga4Item(p)],
  });
}

/** Customer added an item to the cart — the key retargeting signal. */
export function trackAddToCart(p: TrackedProduct) {
  const qty = p.quantity ?? 1;
  fbq('track', 'AddToCart', {
    content_ids: [p.id],
    content_name: p.name,
    content_type: 'product',
    contents: [{ id: p.id, quantity: qty }],
    value: p.price * qty,
    currency: CURRENCY,
  });
  gtag('event', 'add_to_cart', {
    currency: CURRENCY,
    value: p.price * qty,
    items: [ga4Item(p)],
  });
}

/** Customer reached the checkout page. */
export function trackInitiateCheckout(value: number, items: TrackedProduct[]) {
  fbq('track', 'InitiateCheckout', {
    content_ids: items.map((i) => i.id),
    contents: items.map((i) => ({ id: i.id, quantity: i.quantity ?? 1 })),
    num_items: items.reduce((n, i) => n + (i.quantity ?? 1), 0),
    value,
    currency: CURRENCY,
  });
  gtag('event', 'begin_checkout', {
    currency: CURRENCY,
    value,
    items: items.map(ga4Item),
  });
}

/** Completed purchase. `orderId` dedupes server/refresh double-counting. */
export function trackPurchase(orderId: string, value: number, items: TrackedProduct[]) {
  fbq(
    'track',
    'Purchase',
    {
      content_ids: items.map((i) => i.id),
      contents: items.map((i) => ({ id: i.id, quantity: i.quantity ?? 1 })),
      content_type: 'product',
      num_items: items.reduce((n, i) => n + (i.quantity ?? 1), 0),
      value,
      currency: CURRENCY,
    },
    { eventID: `order_${orderId}` }
  );
  gtag('event', 'purchase', {
    transaction_id: orderId,
    currency: CURRENCY,
    value,
    items: items.map(ga4Item),
  });
}

/**
 * A collection / category page was viewed. Drives Meta's "ViewCategory"
 * recommended event (for dynamic ads) and GA4 view_item_list.
 */
export function trackViewItemList(listName: string, items: TrackedProduct[]) {
  fbq('trackCustom', 'ViewCategory', {
    content_category: listName,
    content_ids: items.slice(0, 50).map((i) => i.id),
    content_type: 'product',
  });
  gtag('event', 'view_item_list', {
    item_list_name: listName,
    items: items.slice(0, 50).map(ga4Item),
  });
}

/**
 * A search was performed. Drives Meta's "Search" standard event and GA4
 * "search" / view_search_results — useful for understanding demand and for
 * search-intent retargeting.
 */
export function trackSearch(searchString: string, items: TrackedProduct[]) {
  fbq('track', 'Search', {
    search_string: searchString,
    content_ids: items.slice(0, 50).map((i) => i.id),
    content_type: 'product',
  });
  gtag('event', 'search', { search_term: searchString });
  gtag('event', 'view_search_results', {
    search_term: searchString,
    items: items.slice(0, 50).map(ga4Item),
  });
}

/** Fire PageView/page_view on SPA route changes. */
export function trackPageView(path: string) {
  fbq('track', 'PageView');
  if (GA4_ID) {
    gtag('event', 'page_view', {
      page_path: path,
      page_location: typeof window !== 'undefined' ? window.location.href : path,
    });
  }
}

function ga4Item(p: TrackedProduct) {
  return {
    item_id: p.id,
    item_name: p.name,
    item_category: p.category,
    price: p.price,
    quantity: p.quantity ?? 1,
  };
}
