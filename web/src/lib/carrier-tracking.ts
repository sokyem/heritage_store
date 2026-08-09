/**
 * Carrier tracking helpers.
 *
 * Builds the public, customer-facing tracking URL for a given carrier +
 * tracking number so admin (and emails) can deep-link straight to the
 * carrier's "where is my package" page. Returns null when we can't build a
 * sensible URL (unknown carrier or missing tracking number).
 */

export type CarrierName = 'UPS' | 'USPS' | 'FedEx' | 'DHL' | string;

export function normalizeCarrierName(raw?: string | null): string {
  return String(raw || '').trim().toUpperCase();
}

/**
 * Return the public tracking URL for a carrier + tracking number, or null if
 * one can't be constructed.
 */
export function carrierTrackingUrl(carrier?: string | null, trackingNumber?: string | null): string | null {
  const tn = String(trackingNumber || '').trim();
  if (!tn) return null;

  const code = normalizeCarrierName(carrier);
  const enc = encodeURIComponent(tn);

  switch (code) {
    case 'UPS':
      return `https://www.ups.com/track?loc=en_US&tracknum=${enc}`;
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${enc}`;
    case 'FEDEX':
      return `https://www.fedex.com/fedextrack/?trknbr=${enc}`;
    case 'DHL':
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${enc}`;
    default:
      // Unknown carrier — fall back to a Google search so the link is still useful.
      return `https://www.google.com/search?q=${encodeURIComponent(`${carrier || ''} tracking ${tn}`.trim())}`;
  }
}
