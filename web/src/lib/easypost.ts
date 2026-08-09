/**
 * EasyPost USPS label provider.
 *
 * Bridges label-buying to EasyPost so the storefront can purchase real USPS
 * labels while our own USPS developer app is still pending the `labels` /
 * `payments` OAuth scopes (see memory: usps-shipping-setup-progress).
 *
 * EasyPost holds its own approved USPS access, so labels purchase against an
 * EasyPost balance instead of our EPS account — no dependency on our scope
 * request. The function returns the SAME `USPSShipmentResult` shape as
 * lib/usps.ts `createShipment`, so every existing label call site
 * (auto-shipping, admin manual buy, fulfill) works unchanged.
 *
 * To go live: set EASYPOST_API_KEY (test key `EZTK…` for sandbox labels,
 * production key `EZAK…` for real postage). When our direct USPS scope is
 * approved, lib/usps.ts prefers the direct API again automatically.
 */
import { getShipperAddress } from '@/lib/shipper-address';
import type { ShipToAddress, PackageDetails } from '@/lib/ups';
import type { USPSServiceCode, USPSShipmentResult } from '@/lib/usps';

// Canonical name is EASYPOST_API_KEY; also accept EASYPOST_API and the
// underscored EASY_POST_API / EASY_POST_API_KEY as aliases so any common
// env-var spelling activates the bridge. Set this to a live key (EZAK…) in
// production for real postage, or a test key (EZTK…) for free sandbox labels.
const EASYPOST_API_KEY =
  process.env.EASYPOST_API_KEY ||
  process.env.EASYPOST_API ||
  process.env.EASY_POST_API_KEY ||
  process.env.EASY_POST_API ||
  '';
const EASYPOST_BASE_URL = process.env.EASYPOST_BASE_URL || 'https://api.easypost.com/v2';

export function isEasyPostConfigured(): boolean {
  return !!EASYPOST_API_KEY;
}

// Map our internal USPS service codes to EasyPost's USPS service names.
const EASYPOST_SERVICE: Record<USPSServiceCode, string> = {
  USPS_GROUND_ADVANTAGE: 'GroundAdvantage',
  PRIORITY_MAIL: 'Priority',
  PRIORITY_MAIL_EXPRESS: 'Express',
  LIBRARY_MAIL: 'LibraryMail',
  MEDIA_MAIL: 'MediaMail',
  PARCEL_SELECT: 'ParcelSelect',
};

function authHeader(): string {
  // EasyPost uses HTTP Basic auth with the API key as the username (empty password).
  return `Basic ${Buffer.from(`${EASYPOST_API_KEY}:`).toString('base64')}`;
}

// Wrap fetch with a hard timeout so a stalled EasyPost/CDN call surfaces as a
// readable error (caught upstream) instead of hanging until the platform
// gateway returns an opaque 502.
async function fetchWithTimeout(url: string, init: RequestInit, ms = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`EasyPost request timed out after ${ms}ms (${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function epFetch(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(`${EASYPOST_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`EasyPost ${init.method || 'GET'} ${path} failed: ${res.status} — ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/** The cheapest USPS rate for a parcel, plus the ids needed to buy it later. */
export interface EasyPostRate {
  shipmentId: string;
  rateId: string;
  service: string; // EasyPost service name, e.g. "GroundAdvantage"
  cost: number; // USD
  currency: string;
  optionCount: number;
}

/**
 * Step 1 — create an EasyPost shipment and return the CHEAPEST USPS rate
 * WITHOUT buying. Lets the admin preview the postage cost before committing.
 * The returned shipmentId/rateId can be passed to {@link buyRate} to purchase
 * the exact rate that was quoted (guaranteeing the price doesn't change).
 */
export async function getCheapestRate(
  shipTo: ShipToAddress,
  packageDetails: PackageDetails,
  serviceCode: USPSServiceCode = 'USPS_GROUND_ADVANTAGE',
): Promise<EasyPostRate> {
  const SHIPPER = await getShipperAddress();
  // EasyPost requires a complete origin address. Fail with a clear, actionable
  // message instead of a cryptic 422 when the shipper address isn't set.
  if (!SHIPPER.addressLine1 || !SHIPPER.city || !SHIPPER.state || !SHIPPER.zip) {
    throw new Error('Shipper (origin) address is not set. Add your studio address in Admin → Settings → Shipping before buying labels.');
  }
  const targetService = EASYPOST_SERVICE[serviceCode] || EASYPOST_SERVICE.USPS_GROUND_ADVANTAGE;

  // EasyPost parcel weight is in OUNCES; our PackageDetails.weight is in pounds.
  const weightOz = Math.round(packageDetails.weight * 16 * 10) / 10;

  const shipperFullName =
    [SHIPPER.firstName, SHIPPER.lastName].filter(Boolean).join(' ').trim() || SHIPPER.name || 'AWULA K';

  // International shipments (destination outside the origin country) require
  // USPS customs info — without it EasyPost rejects the buy with
  // "Customs info error: missing required field: ContentsType". Apparel is
  // declared as merchandise; HS 6204 covers women's garments/dresses, the
  // brand's core catalogue. Values default sensibly when not provided.
  const originCountry = (SHIPPER.country || 'US').toUpperCase();
  const destCountry = (shipTo.country || 'US').toUpperCase();
  const isInternational = destCountry !== originCountry;
  const declaredUsd = Math.max(1, Math.round((packageDetails.declaredValue || 50) * 100) / 100);
  const customsInfo = isInternational
    ? {
        customs_info: {
          contents_type: 'merchandise',
          contents_explanation: 'Apparel / fashion garments',
          customs_certify: true,
          customs_signer: shipperFullName,
          non_delivery_option: 'return',
          restriction_type: 'none',
          eel_pfc: 'NOEEI 30.37(a)',
          customs_items: [
            {
              description: 'Apparel / fashion garment',
              quantity: 1,
              value: declaredUsd,
              weight: weightOz,
              origin_country: originCountry,
              hs_tariff_number: '620443',
            },
          ],
        },
      }
    : {};

  // Create the shipment to get rates.
  const created = await epFetch('/shipments', {
    method: 'POST',
    body: JSON.stringify({
      shipment: {
        to_address: {
          name: shipTo.name,
          street1: shipTo.addressLine1,
          street2: shipTo.addressLine2 || '',
          city: shipTo.city,
          state: shipTo.state,
          zip: shipTo.postalCode,
          country: shipTo.country || 'US',
          ...(shipTo.phone ? { phone: shipTo.phone } : {}),
        },
        from_address: {
          name: shipperFullName,
          company: SHIPPER.name || undefined,
          street1: SHIPPER.addressLine1,
          street2: SHIPPER.addressLine2 || '',
          city: SHIPPER.city,
          state: SHIPPER.state,
          zip: SHIPPER.zip,
          country: SHIPPER.country || 'US',
          ...(SHIPPER.phone ? { phone: SHIPPER.phone } : {}),
        },
        parcel: {
          length: packageDetails.length,
          width: packageDetails.width,
          height: packageDetails.height,
          weight: weightOz,
        },
        ...customsInfo,
        options: { label_format: 'PDF' },
      },
    }),
  });

  const shipmentId = created.id as string;
  const rates = (created.rates as Array<Record<string, unknown>>) || [];

  // Prefer the REQUESTED service (USPS Ground Advantage by default) so domestic
  // labels are consistently Ground Advantage rather than whatever is cheapest
  // for a given weight/zone. Fall back to the cheapest available service only
  // when the requested one isn't offered — e.g. international destinations,
  // where Ground Advantage doesn't exist and an international service is needed.
  const uspsRates = rates
    .filter((r) => String(r.carrier) === 'USPS')
    .sort((a, b) => parseFloat(String(a.rate)) - parseFloat(String(b.rate)));
  const preferred = uspsRates.find((r) => String(r.service) === targetService);
  const chosen = preferred || uspsRates[0];

  if (!chosen) {
    throw new Error(`EasyPost returned no USPS rates for shipment ${shipmentId}`);
  }
  console.log(
    `[easypost] selected USPS rate: ${chosen.service} $${chosen.rate}` +
      `${preferred ? ` (requested ${targetService})` : ` (fallback — ${targetService} not offered)`} of ${uspsRates.length} options`,
  );

  return {
    shipmentId,
    rateId: String(chosen.id),
    service: String(chosen.service),
    cost: parseFloat(String(chosen.rate)) || 0,
    currency: String(chosen.currency || 'USD'),
    optionCount: uspsRates.length,
  };
}

/**
 * Step 2 — buy a specific rate that was previously quoted by
 * {@link getCheapestRate}. This purchases real postage on a production key.
 */
export async function buyRate(
  shipmentId: string,
  rateId: string,
  declaredValue?: number,
): Promise<USPSShipmentResult> {
  const bought = await epFetch(`/shipments/${shipmentId}/buy`, {
    method: 'POST',
    body: JSON.stringify({
      rate: { id: rateId },
      ...(typeof declaredValue === 'number' && declaredValue > 0
        ? { insurance: declaredValue.toFixed(2) }
        : {}),
    }),
  });

  const trackingNumber = (bought.tracking_code as string) || '';
  const selectedRate = (bought.selected_rate as Record<string, unknown>) || {};
  const totalCharge = parseFloat(String(selectedRate.rate ?? '0')) || 0;

  const postageLabel = (bought.postage_label as Record<string, unknown>) || {};
  const labelUrl = (postageLabel.label_url as string) || '';

  // Fetch the PDF and base64-encode it to match how every label consumer
  // stores/serves Shipment.labelData (Buffer.from(labelData, 'base64')).
  let labelImageBase64 = '';
  if (labelUrl) {
    // Best-effort: a slow CDN shouldn't fail the whole label (we already have
    // the tracking number + label_url). Cap it and swallow errors.
    try {
      const labelRes = await fetchWithTimeout(labelUrl, {}, 15000);
      if (labelRes.ok) {
        labelImageBase64 = Buffer.from(await labelRes.arrayBuffer()).toString('base64');
      }
    } catch (err) {
      console.error('[easypost] label PDF fetch failed (non-fatal):', err instanceof Error ? err.message : err);
    }
  }

  return {
    trackingNumber,
    labelImageBase64,
    labelFormat: 'PDF',
    totalCharge,
    currency: 'USD',
  };
}

// A representative US destination used to price the "domestic equivalent" of an
// international parcel. Ground Advantage is nearly flat across zones for light
// parcels, so a fixed far-coast reference gives a stable, customer-fair baseline.
const US_BASELINE_ADDRESS: ShipToAddress = {
  name: 'Customer',
  addressLine1: '1600 Amphitheatre Pkwy',
  city: 'Mountain View',
  state: 'CA',
  postalCode: '94043',
  country: 'US',
};

/**
 * Extra shipping the customer should absorb on an INTERNATIONAL order while
 * AWULA K keeps covering the domestic-equivalent cost: the cheapest USPS
 * international rate minus what USPS Ground Advantage would cost for the same
 * parcel domestically (e.g. intl $18 − domestic $5 = $13).
 *
 * Returns 0 for US destinations, when EasyPost isn't configured, or on any
 * error — so checkout degrades to "no surcharge" rather than blocking the sale.
 * Both legs are priced through EasyPost (the same source the label is bought
 * from), so the surcharge matches the real cost difference.
 */
export async function getInternationalSurcharge(
  shipTo: ShipToAddress,
  packageDetails: PackageDetails,
): Promise<number> {
  if (!isEasyPostConfigured()) return 0;
  if ((shipTo.country || 'US').toUpperCase() === 'US') return 0;
  try {
    const [intl, domestic] = await Promise.all([
      getCheapestRate(shipTo, packageDetails),
      getCheapestRate(US_BASELINE_ADDRESS, packageDetails, 'USPS_GROUND_ADVANTAGE'),
    ]);
    const diff = intl.cost - domestic.cost;
    return diff > 0 ? Math.round(diff * 100) / 100 : 0;
  } catch (err) {
    console.error('[easypost] international surcharge calc failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * Void / refund a purchased label by its tracking code. EasyPost submits the
 * refund to USPS; for USPS the refund is asynchronous — it comes back as
 * `submitted` and USPS credits the EasyPost balance once it confirms the label
 * was unused (typically within a couple of weeks). We refund by tracking code
 * (POST /v2/refunds) rather than shipment id because we don't persist the
 * EasyPost shipment id. Best-effort: returns ok:false with the carrier message
 * instead of throwing, so the recreate flow can decide how to proceed.
 */
export async function refundLabel(
  trackingCode: string,
  carrier = 'USPS',
): Promise<{ ok: boolean; status?: string; message?: string }> {
  if (!isEasyPostConfigured()) return { ok: false, message: 'EasyPost is not configured' };
  if (!trackingCode) return { ok: false, message: 'No tracking number to refund' };
  try {
    const data = (await epFetch('/refunds', {
      method: 'POST',
      body: JSON.stringify({ refund: { carrier, tracking_codes: trackingCode } }),
    })) as unknown;
    // EasyPost returns an array of Refund objects (or a single object).
    const list = Array.isArray(data) ? data : [data as Record<string, unknown>];
    const r = (list[0] as Record<string, unknown>) || {};
    const status = String(r.status || 'submitted');
    console.log(`[easypost] refund requested for ${trackingCode}: ${status}`);
    return { ok: status !== 'rejected', status };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'refund failed';
    console.error('[easypost] refund failed:', message);
    return { ok: false, message };
  }
}

/**
 * Map an EasyPost tracker status to our internal Shipment status vocabulary.
 * EasyPost normalises across carriers, so this is the single source of truth
 * used by both the tracker webhook and the polling cron fallback.
 * EasyPost statuses: pre_transit, in_transit, out_for_delivery, delivered,
 * available_for_pickup, return_to_sender, failure, cancelled, error, unknown.
 */
export function mapEasyPostStatus(status: string): string | null {
  const map: Record<string, string> = {
    pre_transit: 'label_created',
    in_transit: 'in_transit',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    available_for_pickup: 'in_transit',
    return_to_sender: 'returned',
    failure: 'exception',
    error: 'exception',
    cancelled: 'cancelled',
  };
  return map[String(status || '').toLowerCase()] || null;
}

/** A normalized EasyPost tracker snapshot for polling. */
export interface EasyPostTracker {
  status: string; // raw EasyPost status
  trackingCode: string;
  estDeliveryDate: string | null;
  lastMessage: string | null;
}

/**
 * Look up the latest tracker for a tracking code. EasyPost auto-creates a
 * Tracker when a label is bought, so this returns live status without us
 * having to register anything. Returns null if not found / not configured.
 */
export async function getTrackerByCode(trackingCode: string): Promise<EasyPostTracker | null> {
  if (!isEasyPostConfigured() || !trackingCode) return null;
  try {
    const data = await epFetch(`/trackers?tracking_code=${encodeURIComponent(trackingCode)}`, { method: 'GET' });
    const trackers = (data.trackers as Array<Record<string, unknown>>) || [];
    const t = trackers[0];
    if (!t) return null;
    const detail = (t.tracking_details as Array<Record<string, unknown>>) || [];
    const last = detail[detail.length - 1];
    return {
      status: String(t.status || 'unknown'),
      trackingCode: String(t.tracking_code || trackingCode),
      estDeliveryDate: (t.est_delivery_date as string) || null,
      lastMessage: last ? String(last.message || '') : null,
    };
  } catch (err) {
    console.error('[easypost] tracker lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Full tracking snapshot in the same shape lib/usps.ts returns, so callers
 *  (admin track modal, customer tracking) work unchanged. */
export interface EasyPostTrackResult {
  status: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  events: Array<{ status: string; description: string; location: string; date: string; time: string }>;
}

/**
 * Track a tracking code via EasyPost (which holds approved USPS access), so we
 * don't depend on the direct USPS Tracking API — USPS locked that behind an IP
 * Agreement on 2026-04-01 and it now 403s. Reuses the tracker EasyPost created
 * when the label was bought; creates one on demand if missing. Returns null if
 * EasyPost isn't configured or the lookup fails.
 */
export async function trackByEasyPost(trackingCode: string, carrier = 'USPS'): Promise<EasyPostTrackResult | null> {
  if (!isEasyPostConfigured() || !trackingCode) return null;
  try {
    let tracker: Record<string, unknown> | null = null;
    const found = await epFetch(`/trackers?tracking_code=${encodeURIComponent(trackingCode)}`, { method: 'GET' });
    tracker = ((found.trackers as Array<Record<string, unknown>>) || [])[0] || null;
    if (!tracker) {
      // No tracker yet (e.g. label bought before the EasyPost bridge) — create
      // one so this and future lookups (+ webhooks) resolve.
      tracker = await epFetch('/trackers', {
        method: 'POST',
        body: JSON.stringify({ tracker: { tracking_code: trackingCode, carrier } }),
      }).catch(() => null);
    }
    if (!tracker) return null;

    const details = (tracker.tracking_details as Array<Record<string, unknown>>) || [];
    const events = details
      .map((d) => {
        const loc = (d.tracking_location as Record<string, string>) || {};
        const dt = String(d.datetime || '');
        const [date, timeRaw] = dt.split('T');
        return {
          status: String(d.status || ''),
          description: String(d.message || d.description || d.status || ''),
          location: [loc.city, loc.state, loc.zip].filter(Boolean).join(', '),
          date: date || '',
          time: timeRaw ? timeRaw.replace('Z', '').slice(0, 5) : '',
        };
      })
      .reverse(); // newest first — matches what the tracking modal expects

    const status = String(tracker.status || 'unknown');
    const lastDt = details.length ? String(details[details.length - 1].datetime || '') : '';
    return {
      status,
      estimatedDelivery: (tracker.est_delivery_date as string) || undefined,
      actualDelivery: status.toLowerCase() === 'delivered' ? (lastDt.split('T')[0] || undefined) : undefined,
      events,
    };
  } catch (err) {
    console.error('[easypost] track failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Rate + buy in one call — the cheapest USPS rate is selected and purchased.
 * Used by auto-shipping on payment (no admin preview step).
 */
export async function createShipment(
  shipTo: ShipToAddress,
  packageDetails: PackageDetails,
  serviceCode: USPSServiceCode = 'USPS_GROUND_ADVANTAGE',
  _description?: string
): Promise<USPSShipmentResult> {
  const rate = await getCheapestRate(shipTo, packageDetails, serviceCode);
  return buyRate(rate.shipmentId, rate.rateId, packageDetails.declaredValue);
}
