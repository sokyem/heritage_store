// ═══════════════════════════════════════════════════════════════════
// USPS Shipping Integration — AWULA K
// Uses USPS APIs Platform (OAuth 2.0 + REST v3)
// Docs: https://developer.usps.com/
// Reference specs (in repo): labels_10_0.yaml, addresses-v3r2_4.yaml
//
// Shares ShipToAddress / PackageDetails shape with lib/ups.ts so callers
// can swap carriers without changing the call site.
// ═══════════════════════════════════════════════════════════════════

import type { ShipToAddress, PackageDetails } from '@/lib/ups';

// Accept both the OAuth-standard names and USPS's marketing wording ("Consumer Key").
// USPS docs use both interchangeably, so we tolerate either to avoid silent misconfig.
const USPS_BASE_URL = process.env.USPS_BASE_URL || 'https://apis.usps.com';
const USPS_CLIENT_ID = process.env.USPS_CLIENT_ID || process.env.USPS_CONSUMER_KEY || '';
const USPS_CLIENT_SECRET = process.env.USPS_CLIENT_SECRET || process.env.USPS_CONSUMER_SECRET || process.env.USPS_SECRET || '';
const USPS_CRID = process.env.USPS_CRID || '';
const USPS_MID = process.env.USPS_MID || process.env.USPS_MAILER_ID || '';
const USPS_PAYMENT_ACCOUNT = process.env.USPS_PAYMENT_ACCOUNT || process.env.USPS_ACCOUNT_ID || '';

// Shipper address now lives in DB-backed settings (lib/shipper-address.ts);
// env values feed the defaults for that record. See lib/settings.ts.
import { getShipperAddress } from '@/lib/shipper-address';
import { isEasyPostConfigured, createShipment as createEasyPostShipment, trackByEasyPost } from '@/lib/easypost';

// ─── Service codes (mailClass values for Labels v3) ───────────────

export type USPSServiceCode =
  | 'USPS_GROUND_ADVANTAGE'   // cheapest small parcels, 2–5 days
  | 'PRIORITY_MAIL'           // 1–3 days
  | 'PRIORITY_MAIL_EXPRESS'   // 1–2 days, guaranteed
  | 'LIBRARY_MAIL'
  | 'MEDIA_MAIL'
  | 'PARCEL_SELECT';

export const USPS_SERVICES: Record<USPSServiceCode, string> = {
  USPS_GROUND_ADVANTAGE: 'USPS Ground Advantage',
  PRIORITY_MAIL: 'Priority Mail',
  PRIORITY_MAIL_EXPRESS: 'Priority Mail Express',
  LIBRARY_MAIL: 'Library Mail',
  MEDIA_MAIL: 'Media Mail',
  PARCEL_SELECT: 'Parcel Select',
};

function assertCredsForProd(feature: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`USPS ${feature} unavailable: USPS_CLIENT_ID/USPS_CLIENT_SECRET must be set in production`);
  }
}

// ─── OAuth Token Management ───────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

// Every scope we might need across the integration. Requesting them
// explicitly is required by some OAuth servers — they only attach an
// elevated scope to the token when it's named in the token request,
// even if the app is approved for it.
const USPS_REQUESTED_SCOPES = [
  'addresses', 'tracking',
  'prices', 'domestic-prices', 'international-prices',
  'locations', 'service-standards',
  'labels', 'pickup', 'carrier-pickup', 'payments',
  'subscriptions', 'subscriptions-tracking',
  'shipments', 'logistics',
].join(' ');

async function fetchUSPSToken(scope?: string): Promise<{ access_token: string; expires_in?: number; scope?: string } | null> {
  try {
    const res = await fetch(`${USPS_BASE_URL}/oauth2/v3/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: USPS_CLIENT_ID,
        client_secret: USPS_CLIENT_SECRET,
        ...(scope ? { scope } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[usps] token request failed (scope=${scope ? 'explicit' : 'none'}): ${res.status} — ${text}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[usps] token request error:', err);
    return null;
  }
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  // First try: ask USPS to attach every scope we want. If the app is
  // approved for them, we get them on the token immediately. If a requested
  // scope is unattached, USPS returns `invalid_scope` — fall back to the
  // unscoped request so default scopes (addresses/tracking) keep working.
  let data = await fetchUSPSToken(USPS_REQUESTED_SCOPES);
  if (!data) data = await fetchUSPSToken();
  if (!data) throw new Error('USPS OAuth failed — see logs');

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000,
  };
  return cachedToken.token;
}

export { USPS_REQUESTED_SCOPES, fetchUSPSToken };

// ─── Payments v3 — Payment Authorization Token ────────────────────
// The Labels v3 endpoint requires header X-Payment-Authorization-Token, a JWT
// minted by /payments/v3/payment-authorization that says "this OAuth client is
// authorized to bill EPS account X under CRID Y on behalf of label-owner CRID Z."
// Without this, every label request comes back 401.

let cachedPaymentAuth: { token: string; expiresAt: number } | null = null;

async function getPaymentAuthorizationToken(): Promise<string> {
  if (cachedPaymentAuth && Date.now() < cachedPaymentAuth.expiresAt) {
    return cachedPaymentAuth.token;
  }
  if (!USPS_CRID || !USPS_MID || !USPS_PAYMENT_ACCOUNT) {
    throw new Error('USPS payment auth missing: set USPS_CRID, USPS_MID, USPS_PAYMENT_ACCOUNT');
  }

  const oauthToken = await getAccessToken();

  // Single-shipper setup: same CRID/MID/EPS plays every role.
  const roles = [
    { roleName: 'PAYER', CRID: USPS_CRID, MID: USPS_MID, manifestMID: USPS_MID, accountType: 'EPS', accountNumber: USPS_PAYMENT_ACCOUNT },
    { roleName: 'LABEL_OWNER', CRID: USPS_CRID, MID: USPS_MID, manifestMID: USPS_MID, accountType: 'EPS', accountNumber: USPS_PAYMENT_ACCOUNT },
    { roleName: 'RATE_HOLDER', CRID: USPS_CRID, MID: USPS_MID, manifestMID: USPS_MID, accountType: 'EPS', accountNumber: USPS_PAYMENT_ACCOUNT },
    { roleName: 'SERVICE_PROVIDER', CRID: USPS_CRID, MID: USPS_MID },
  ];

  const res = await fetch(`${USPS_BASE_URL}/payments/v3/payment-authorization`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${oauthToken}`,
    },
    body: JSON.stringify({ roles }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS payment authorization failed: ${res.status} — ${text}`);
  }

  const data = await res.json();
  const token = data.paymentAuthorizationToken || data.token;
  if (!token) throw new Error('USPS payment authorization returned no token');

  // USPS payment tokens are valid for 8 hours (per API onboarding terms) and
  // must NOT be regenerated per call — our production grant is capped at 50 API
  // calls/day, so re-minting every 45 min would burn ~20 calls/day on auth
  // alone. Cache for 7.5h (8h validity minus a 30-min safety margin) so the
  // token is reused across the whole working day.
  cachedPaymentAuth = { token, expiresAt: Date.now() + 7.5 * 60 * 60 * 1000 };
  return token;
}

// ─── Create Shipment & Label ──────────────────────────────────────

export interface USPSShipmentResult {
  trackingNumber: string;
  labelImageBase64: string;
  labelFormat: 'PDF' | 'TIF' | 'PNG';
  totalCharge: number;
  currency: string;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export async function createShipment(
  shipTo: ShipToAddress,
  packageDetails: PackageDetails,
  serviceCode: USPSServiceCode = 'USPS_GROUND_ADVANTAGE',
  _description?: string
): Promise<USPSShipmentResult> {
  // Prefer the direct USPS Labels API once our app holds the labels/payments
  // scope + EPS account. Until then, if EasyPost is configured, buy the label
  // through EasyPost (rides on their approved USPS access). Only fall back to a
  // mock when neither path is available, so admin can still create pending
  // shipments to fulfill manually at the USPS counter or via Click-N-Ship.
  if (!isUSPSDirectLabelsReady()) {
    if (isEasyPostConfigured()) {
      return createEasyPostShipment(shipTo, packageDetails, serviceCode, _description);
    }
    assertCredsForProd('label creation');
    return getMockShipment();
  }

  // Direct USPS is the preferred path, but it must never be a single point of
  // failure: if the label call errors (USPS outage, the 50/day quota exhausted,
  // an EPS funding gap, an unexpected response shape) AND EasyPost is configured,
  // buy through EasyPost instead so the order still gets a label. Only when no
  // fallback exists does the error propagate.
  try {
    return await createUSPSDirectShipment(shipTo, packageDetails, serviceCode);
  } catch (err) {
    if (isEasyPostConfigured()) {
      console.error(
        '[usps] direct label failed — falling back to EasyPost:',
        err instanceof Error ? err.message : err,
      );
      return createEasyPostShipment(shipTo, packageDetails, serviceCode, _description);
    }
    throw err;
  }
}

// Buys a label through our OWN USPS Labels v3 app (EPS-billed). Separated from
// createShipment so the caller can wrap it with an EasyPost fallback. Throws on
// any failure — including a 200 that carries no tracking number — so the
// fallback triggers rather than returning a useless empty label.
async function createUSPSDirectShipment(
  shipTo: ShipToAddress,
  packageDetails: PackageDetails,
  serviceCode: USPSServiceCode,
): Promise<USPSShipmentResult> {
  const [oauthToken, paymentToken, SHIPPER] = await Promise.all([
    getAccessToken(),
    getPaymentAuthorizationToken(),
    getShipperAddress(),
  ]);
  const recipient = splitName(shipTo.name);
  const today = new Date().toISOString().split('T')[0];

  const declaredValue = packageDetails.declaredValue;
  const wantsInsurance = typeof declaredValue === 'number' && declaredValue > 0;

  // Request structure per labels_10_0.yaml LabelRequest schema.
  const body: Record<string, unknown> = {
    imageInfo: { imageType: 'PDF', labelType: '4X6LABEL', receiptOption: 'NONE' },
    toAddress: {
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      streetAddress: shipTo.addressLine1,
      secondaryAddress: shipTo.addressLine2 || '',
      city: shipTo.city,
      state: shipTo.state,
      ZIPCode: (shipTo.postalCode || '').split('-')[0],
      ZIPPlus4: (shipTo.postalCode || '').split('-')[1] || '',
      ...(shipTo.phone && { phone: shipTo.phone }),
    },
    fromAddress: {
      firstName: SHIPPER.firstName,
      lastName: SHIPPER.lastName,
      ...(SHIPPER.name && { firm: SHIPPER.name }),
      streetAddress: SHIPPER.addressLine1,
      secondaryAddress: SHIPPER.addressLine2,
      city: SHIPPER.city,
      state: SHIPPER.state,
      ZIPCode: (SHIPPER.zip || '').split('-')[0],
      ZIPPlus4: (SHIPPER.zip || '').split('-')[1] || '',
      ...(SHIPPER.phone && { phone: SHIPPER.phone }),
    },
    packageDescription: {
      weightUOM: 'lb',
      weight: packageDetails.weight,
      dimensionsUOM: 'in',
      length: packageDetails.length,
      width: packageDetails.width,
      height: packageDetails.height,
      mailClass: serviceCode,
      rateIndicator: 'SP',
      processingCategory: 'MACHINABLE',
      destinationEntryFacilityType: 'NONE',
      mailingDate: today,
      ...(wantsInsurance && {
        extraServices: [930],
        packageOptions: { packageValue: declaredValue },
      }),
    },
  };

  // application/vnd.usps.labels+json returns a single JSON doc with base64
  // images embedded — much simpler than parsing the default multipart response.
  const res = await fetch(`${USPS_BASE_URL}/labels/v3/label`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.usps.labels+json',
      'Authorization': `Bearer ${oauthToken}`,
      'X-Payment-Authorization-Token': paymentToken,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS Label creation failed: ${res.status} — ${text}`);
  }

  // Per LabelVendorResponse schema: top-level LabelMetadata fields + labelImage/receiptImage as base64.
  const data = await res.json();
  const trackingNumber = (data.trackingNumber as string) || '';
  const postage = typeof data.postage === 'number' ? data.postage : 0;
  const labelBase64 = (data.labelImage as string) || '';

  // A 200 with no tracking number is unusable — treat it as a failure so the
  // caller's EasyPost fallback kicks in rather than persisting an empty label.
  if (!trackingNumber) {
    throw new Error('USPS Label creation returned no tracking number');
  }

  return {
    trackingNumber,
    labelImageBase64: labelBase64,
    labelFormat: 'PDF',
    totalCharge: postage,
    currency: 'USD',
  };
}

// ─── Track Shipment ───────────────────────────────────────────────

export interface USPSTrackingEvent {
  status: string;
  description: string;
  location: string;
  date: string;
  time: string;
}

export interface USPSTrackingResult {
  trackingNumber: string;
  status: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  events: USPSTrackingEvent[];
}

export async function trackShipment(trackingNumber: string): Promise<USPSTrackingResult> {
  // Prefer EasyPost tracking unless the direct USPS Tracking API is explicitly
  // enabled (it 403s without the post-2026-04-01 IP Agreement). EasyPost holds
  // approved USPS access and already created a tracker when the label was bought.
  if (!isUSPSDirectTrackingReady()) {
    if (isEasyPostConfigured()) {
      const r = await trackByEasyPost(trackingNumber);
      if (r) {
        return {
          trackingNumber,
          status: r.status,
          estimatedDelivery: r.estimatedDelivery,
          actualDelivery: r.actualDelivery,
          events: r.events,
        };
      }
    }
    // No EasyPost (or it returned nothing) — return a benign mock instead of
    // calling the restricted USPS API and surfacing a 403 to the admin.
    assertCredsForProd('tracking lookup');
    return getMockTracking(trackingNumber);
  }

  if (!isUSPSConfigured()) {
    assertCredsForProd('tracking lookup');
    return getMockTracking(trackingNumber);
  }

  const token = await getAccessToken();

  const res = await fetch(
    `${USPS_BASE_URL}/tracking/v3/tracking/${encodeURIComponent(trackingNumber)}?expand=DETAIL`,
    { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS Tracking failed: ${res.status} — ${text}`);
  }

  const data = await res.json();
  const events: USPSTrackingEvent[] = ((data.trackingEvents || data.events || []) as Array<Record<string, unknown>>).map((evt) => {
    const loc = evt.eventLocation as Record<string, string> | string | undefined;
    const locationStr = typeof loc === 'string'
      ? loc
      : loc
        ? `${loc.city || ''}, ${loc.state || ''} ${loc.ZIPCode || ''}`.trim().replace(/^,\s*/, '')
        : '';
    return {
      status: (evt.eventCode as string) || '',
      description: (evt.eventType as string) || (evt.eventDescription as string) || '',
      location: locationStr,
      date: (evt.eventDate as string) || '',
      time: (evt.eventTime as string) || '',
    };
  });

  const summaryStatus = (data.statusCategory as string) || (data.status as string) || 'unknown';

  return {
    trackingNumber,
    status: summaryStatus,
    estimatedDelivery: (data.expectedDeliveryDate as string) || undefined,
    actualDelivery: (data.actualDeliveryDate as string) || undefined,
    events,
  };
}

// ─── Rate Quotes (Prices v3) ──────────────────────────────────────
// Uses RETAIL pricing — works for any account, no EPS required. Once EPS is
// approved and we want commercial rates, switch priceType to 'COMMERCIAL' and
// include the payment account in pricingOptions.

export interface USPSRate {
  serviceCode: string;
  serviceName: string;
  totalCharge: number;
  currency: string;
  estimatedDays?: number;
}

// Three mail classes we offer at checkout. Add more as needed (Parcel Select
// Lightweight, Media Mail, etc. require special eligibility).
const RATE_QUOTE_MAIL_CLASSES: Array<{ mailClass: USPSServiceCode; estimatedDays: number }> = [
  { mailClass: 'USPS_GROUND_ADVANTAGE', estimatedDays: 4 },
  { mailClass: 'PRIORITY_MAIL', estimatedDays: 2 },
  { mailClass: 'PRIORITY_MAIL_EXPRESS', estimatedDays: 1 },
];

export async function getRates(shipTo: ShipToAddress, pkg: PackageDetails): Promise<USPSRate[]> {
  if (!USPS_CLIENT_ID || !USPS_CLIENT_SECRET) {
    assertCredsForProd('rate quotes');
    return getMockRates();
  }

  const [token, shipper] = await Promise.all([getAccessToken(), getShipperAddress()]);
  const originZip = (shipper.zip || '').split('-')[0];
  const destZip = (shipTo.postalCode || '').split('-')[0];
  if (!originZip) throw new Error('USPS rate quote: shipper ZIP not configured (Settings → Shipping Origin)');
  if (!destZip) throw new Error('USPS rate quote: destination ZIP missing');

  const today = new Date().toISOString().split('T')[0];

  const settled = await Promise.allSettled(
    RATE_QUOTE_MAIL_CLASSES.map(async ({ mailClass, estimatedDays }): Promise<USPSRate | null> => {
      const body = {
        originZIPCode: originZip,
        destinationZIPCode: destZip,
        weight: pkg.weight,
        length: pkg.length,
        width: pkg.width,
        height: pkg.height,
        mailClass,
        processingCategory: 'MACHINABLE',
        rateIndicator: 'SP',
        destinationEntryFacilityType: 'NONE',
        mailingDate: today,
        priceType: 'RETAIL',
      };
      const res = await fetch(`${USPS_BASE_URL}/prices/v3/total-rates/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const opt = Array.isArray(data.rateOptions) ? data.rateOptions[0] : undefined;
      const rate = opt?.rates?.[0] as Record<string, unknown> | undefined;
      if (!rate || typeof rate.price !== 'number') return null;
      return {
        serviceCode: mailClass,
        serviceName: (rate.productName as string) || (rate.description as string) || USPS_SERVICES[mailClass] || mailClass,
        totalCharge: rate.price,
        currency: 'USD',
        estimatedDays,
      };
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<USPSRate> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
    .sort((a, b) => a.totalCharge - b.totalCharge);
}

function getMockRates(): USPSRate[] {
  return [
    { serviceCode: 'USPS_GROUND_ADVANTAGE', serviceName: 'USPS Ground Advantage', totalCharge: 9.50, currency: 'USD', estimatedDays: 4 },
    { serviceCode: 'PRIORITY_MAIL', serviceName: 'Priority Mail', totalCharge: 14.75, currency: 'USD', estimatedDays: 2 },
    { serviceCode: 'PRIORITY_MAIL_EXPRESS', serviceName: 'Priority Mail Express', totalCharge: 38.00, currency: 'USD', estimatedDays: 1 },
  ];
}

// ─── Address Validation (Addresses v3) ────────────────────────────

export interface USPSAddressValidationResult {
  isValid: boolean;
  standardized?: ShipToAddress;
  classification: 'residential' | 'business' | 'unknown';
  warnings: string[];
  corrections: Array<{ code: string; text: string }>;
  needsCorrection: boolean;
}

/**
 * Validate and standardize a US address against the USPS Addresses v3 API.
 * Returns the canonical street address, ZIP+4, residential/business classification,
 * and any correction codes (e.g. "missing apartment number").
 *
 * Falls back to a no-op success if USPS credentials are absent, so callers can
 * use this unconditionally without breaking dev environments.
 */
export async function validateAddress(address: ShipToAddress): Promise<USPSAddressValidationResult> {
  if (!USPS_CLIENT_ID || !USPS_CLIENT_SECRET) {
    assertCredsForProd('address validation');
    return { isValid: true, classification: 'unknown', warnings: [], corrections: [], needsCorrection: false };
  }

  const token = await getAccessToken();
  const params = new URLSearchParams();
  params.set('streetAddress', address.addressLine1 || '');
  if (address.addressLine2) params.set('secondaryAddress', address.addressLine2);
  if (address.city) params.set('city', address.city);
  if (address.state) params.set('state', address.state);
  const [zip5, zip4] = (address.postalCode || '').split('-');
  if (zip5) params.set('ZIPCode', zip5);
  if (zip4) params.set('ZIPPlus4', zip4);

  const res = await fetch(`${USPS_BASE_URL}/addresses/v3/address?${params.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });

  if (res.status === 404) {
    return { isValid: false, classification: 'unknown', warnings: ['Address not found'], corrections: [], needsCorrection: true };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS Address validation failed: ${res.status} — ${text}`);
  }

  const data = await res.json();
  const a = data.address as Record<string, string> | undefined;
  const info = data.additionalInfo as Record<string, string> | undefined;
  const dpv = info?.DPVConfirmation || 'N';
  // Per AddressAdditionalInfo: Y/D/S indicate USPS-known address; N means failed.
  const isValid = dpv === 'Y' || dpv === 'D' || dpv === 'S';

  const corrections = (Array.isArray(data.corrections) ? data.corrections : []) as Array<{ code: string; text: string }>;
  const warnings = (Array.isArray(data.warnings) ? data.warnings : []).map(String);

  const standardized: ShipToAddress | undefined = a ? {
    name: address.name,
    phone: address.phone,
    addressLine1: a.streetAddress || address.addressLine1,
    addressLine2: a.secondaryAddress || address.addressLine2,
    city: a.city || address.city,
    state: a.state || address.state,
    postalCode: a.ZIPPlus4 ? `${a.ZIPCode}-${a.ZIPPlus4}` : (a.ZIPCode || address.postalCode),
    country: 'US',
  } : undefined;

  return {
    isValid,
    standardized,
    classification: info?.business === 'Y' ? 'business' : (a ? 'residential' : 'unknown'),
    warnings,
    corrections,
    needsCorrection: corrections.length > 0 || !isValid,
  };
}

// ─── Mock Data (when USPS credentials not configured) ─────────────

function getMockShipment(): USPSShipmentResult {
  return {
    trackingNumber: `9400${String(Date.now()).slice(-18)}`,
    labelImageBase64: '',
    labelFormat: 'PDF',
    totalCharge: 6.95,
    currency: 'USD',
  };
}

function getMockTracking(trackingNumber: string): USPSTrackingResult {
  return {
    trackingNumber,
    status: 'in_transit',
    estimatedDelivery: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    events: [
      { status: 'IT', description: 'In Transit to Next Facility', location: 'Memphis, TN', date: new Date().toISOString().split('T')[0], time: '10:00' },
      { status: 'AC', description: 'Acceptance', location: 'Origin', date: new Date(Date.now() - 86400000).toISOString().split('T')[0], time: '14:30' },
    ],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

// Two-tier configuration check. Most USPS APIs (tracking, address validation,
// rate quotes, webhooks) need only the OAuth credentials. Label creation
// additionally needs CRID + MID + EPS payment account because the Labels v3
// endpoint requires a payment authorization JWT.
export function isUSPSConfigured(): boolean {
  return !!(USPS_CLIENT_ID && USPS_CLIENT_SECRET);
}

// True only when our OWN USPS app can buy labels directly (full cred set incl.
// EPS payment account AND the labels/payments scope approved on the account).
export function isUSPSDirectLabelsReady(): boolean {
  // The USPS Labels/Payments scope is approval-gated and is often pending long
  // after the USPS_* credentials are set in env. Presence of the vars does NOT
  // mean USPS will actually issue a label — so require an explicit opt-in flag.
  // Until USPS grants the scope and USPS_LABELS_ENABLED=true is set, we report
  // "not ready" so label-buying routes through EasyPost (which works) instead
  // of failing against the direct API.
  if (process.env.USPS_LABELS_ENABLED !== 'true') return false;
  return !!(USPS_CLIENT_ID && USPS_CLIENT_SECRET && USPS_CRID && USPS_MID && USPS_PAYMENT_ACCOUNT);
}

// True only when the direct USPS Tracking API may be used. USPS locked the
// Tracking API behind an IP Agreement on 2026-04-01, so MIDs without that
// agreement now get a 403. Require an explicit opt-in flag; until it's set,
// tracking routes through EasyPost (which rides their approved USPS access).
export function isUSPSDirectTrackingReady(): boolean {
  if (process.env.USPS_TRACKING_ENABLED !== 'true') return false;
  return isUSPSConfigured();
}

// True when a USPS label can be bought by ANY available path — directly through
// our USPS app, or via EasyPost. Callers (auto-shipping, admin status) use this
// to decide whether to attempt a label vs. leave the shipment pending.
export function isUSPSReadyForLabels(): boolean {
  return isUSPSDirectLabelsReady() || isEasyPostConfigured();
}

export type { ShipToAddress, PackageDetails };
