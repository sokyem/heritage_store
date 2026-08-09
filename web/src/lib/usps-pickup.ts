// ═══════════════════════════════════════════════════════════════════
// USPS Carrier Pickup Integration — AWULA K
// Reference: carrier-pickup_6.yaml
//
// Schedules a USPS carrier to come collect packages at the shipper address.
// The pickup is FREE and runs Mon–Sat. Update/cancel require the ETag returned
// by the GET endpoint, so we persist it alongside the confirmation number.
// ═══════════════════════════════════════════════════════════════════

const USPS_BASE_URL = process.env.USPS_BASE_URL || 'https://apis.usps.com';
const USPS_CLIENT_ID = process.env.USPS_CLIENT_ID || process.env.USPS_CONSUMER_KEY || '';
const USPS_CLIENT_SECRET = process.env.USPS_CLIENT_SECRET || process.env.USPS_CONSUMER_SECRET || process.env.USPS_SECRET || '';

// Shipper now comes from DB-backed settings on every call (admin editable).
import { getShipperAddress } from '@/lib/shipper-address';

// ─── OAuth (separate cache from labels — different scope) ─────────

let cachedToken: { token: string; expiresAt: number } | null = null;

// Use the same shared scope list and fetcher as labels so both code paths
// negotiate identical scopes with USPS. Token cache is still per-file so we
// don't share state between the labels and pickup callers.
import { USPS_REQUESTED_SCOPES, fetchUSPSToken } from '@/lib/usps';

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  let data = await fetchUSPSToken(USPS_REQUESTED_SCOPES);
  if (!data) data = await fetchUSPSToken();
  if (!data) throw new Error('USPS OAuth failed — see logs');
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, (data.expires_in || 3600) - 60) * 1000,
  };
  return cachedToken.token;
}

// ─── Types matching the YAML schemas ──────────────────────────────

export type USPSPackageType =
  | 'USPS_GROUND_ADVANTAGE'
  | 'PRIORITY_MAIL'
  | 'PRIORITY_MAIL_EXPRESS'
  | 'RETURNS'
  | 'INTERNATIONAL'
  | 'OTHER';

export type USPSPickupLocation =
  | 'FRONT_DOOR' | 'BACK_DOOR' | 'SIDE_DOOR' | 'KNOCK_ON_DOOR'
  | 'MAIL_ROOM' | 'OFFICE' | 'PORCH' | 'RECEPTION' | 'MAILBOX' | 'OTHER';

export interface SchedulePickupRequest {
  pickupDate: string; // YYYY-MM-DD
  packages: Array<{ packageType: USPSPackageType; packageCount: number }>;
  estimatedWeight: number; // pounds, aggregate
  packageLocation: USPSPickupLocation;
  specialInstructions?: string;
  dogPresent?: boolean;
  notificationEmail?: string;
  notificationCellNumber?: string;
}

export interface PickupConfirmation {
  confirmationNumber: string;
  pickupDate: string;
  packageCount: number;
  estimatedWeight: number;
  packageType: USPSPackageType;
  packageLocation: USPSPickupLocation;
  notificationEmail?: string;
  etag: string;
  createdAt: string;
}

// ─── Eligibility ───────────────────────────────────────────────────

export async function checkPickupEligibility(): Promise<{ eligible: boolean; reason?: string }> {
  if (!isUSPSPickupConfigured()) return { eligible: false, reason: 'USPS not configured' };
  const [token, SHIPPER] = await Promise.all([getAccessToken(), getShipperAddress()]);
  if (!SHIPPER.addressLine1 || !SHIPPER.city || !SHIPPER.state || !SHIPPER.zip) {
    return { eligible: false, reason: 'Shipper address not set — configure it in admin Settings → Shipping Origin' };
  }
  const params = new URLSearchParams({
    streetAddress: SHIPPER.addressLine1,
    city: SHIPPER.city,
    state: SHIPPER.state,
    ZIPCode: (SHIPPER.zip || '').split('-')[0],
  });
  const res = await fetch(`${USPS_BASE_URL}/pickup/v3/carrier-pickup/eligibility?${params.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (res.status === 404 || res.status === 400) {
    return { eligible: false, reason: 'Address is not eligible for carrier pickup' };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS Pickup eligibility failed: ${res.status} — ${text}`);
  }
  return { eligible: true };
}

// ─── Schedule ──────────────────────────────────────────────────────

export async function schedulePickup(req: SchedulePickupRequest): Promise<PickupConfirmation> {
  if (!isUSPSPickupConfigured()) {
    throw new Error('USPS not configured — set USPS_CLIENT_ID and USPS_CLIENT_SECRET');
  }
  const [token, SHIPPER] = await Promise.all([getAccessToken(), getShipperAddress()]);
  if (!SHIPPER.addressLine1 || !SHIPPER.city || !SHIPPER.state || !SHIPPER.zip) {
    throw new Error('Shipper address not set — configure it in admin Settings → Shipping Origin');
  }

  const contact: Array<Record<string, string>> = [];
  if (req.notificationEmail) contact.push({ email: req.notificationEmail });
  if (req.notificationCellNumber) contact.push({ cellNumber: req.notificationCellNumber });
  if (contact.length === 0 && SHIPPER.phone) contact.push({ cellNumber: SHIPPER.phone.replace(/\D/g, '').slice(-10) });

  const body = {
    pickupDate: req.pickupDate,
    pickupAddress: {
      firstName: SHIPPER.firstName,
      lastName: SHIPPER.lastName,
      firm: SHIPPER.name,
      address: {
        streetAddress: SHIPPER.addressLine1,
        secondaryAddress: SHIPPER.addressLine2 || undefined,
        city: SHIPPER.city,
        state: SHIPPER.state,
        ZIPCode: (SHIPPER.zip || '').split('-')[0],
        ZIPPlus4: (SHIPPER.zip || '').split('-')[1] || undefined,
      },
      contact,
    },
    packages: req.packages,
    estimatedWeight: req.estimatedWeight,
    pickupLocation: {
      packageLocation: req.packageLocation,
      ...(req.specialInstructions && { specialInstructions: req.specialInstructions }),
      dogPresent: req.dogPresent ?? false,
    },
    nextAvailablePickup: true,
  };

  const res = await fetch(`${USPS_BASE_URL}/pickup/v3/carrier-pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS Pickup scheduling failed: ${res.status} — ${text}`);
  }
  const data = await res.json();
  const etag = res.headers.get('etag') || '';

  return {
    confirmationNumber: data.confirmationNumber || '',
    pickupDate: data.pickupDate || req.pickupDate,
    packageCount: req.packages.reduce((sum, p) => sum + p.packageCount, 0),
    estimatedWeight: req.estimatedWeight,
    packageType: req.packages[0]?.packageType || 'OTHER',
    packageLocation: req.packageLocation,
    notificationEmail: req.notificationEmail,
    etag,
    createdAt: new Date().toISOString(),
  };
}

// ─── Get (to refresh the ETag before updates/cancels) ─────────────

export async function getPickup(confirmationNumber: string): Promise<{ etag: string; data: unknown } | null> {
  if (!isUSPSPickupConfigured()) return null;
  const token = await getAccessToken();
  const res = await fetch(`${USPS_BASE_URL}/pickup/v3/carrier-pickup/${encodeURIComponent(confirmationNumber)}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS Pickup lookup failed: ${res.status} — ${text}`);
  }
  return { etag: res.headers.get('etag') || '', data: await res.json() };
}

// ─── Cancel ────────────────────────────────────────────────────────

export async function cancelPickup(confirmationNumber: string, etag: string): Promise<void> {
  if (!isUSPSPickupConfigured()) {
    throw new Error('USPS not configured');
  }
  const token = await getAccessToken();

  // The stored ETag may be stale (>1 hour old, per spec). Refresh it first.
  let activeEtag = etag;
  if (!activeEtag) {
    const fresh = await getPickup(confirmationNumber);
    if (!fresh) throw new Error('Pickup not found');
    activeEtag = fresh.etag;
  }

  const res = await fetch(`${USPS_BASE_URL}/pickup/v3/carrier-pickup/${encodeURIComponent(confirmationNumber)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}`, 'If-Match': activeEtag, 'Accept': 'application/json' },
  });
  if (res.status === 412 && etag) {
    // ETag mismatch — refresh and retry once.
    const fresh = await getPickup(confirmationNumber);
    if (!fresh) return; // already gone
    const retry = await fetch(`${USPS_BASE_URL}/pickup/v3/carrier-pickup/${encodeURIComponent(confirmationNumber)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'If-Match': fresh.etag, 'Accept': 'application/json' },
    });
    if (!retry.ok) {
      const text = await retry.text();
      throw new Error(`USPS Pickup cancel failed: ${retry.status} — ${text}`);
    }
    return;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS Pickup cancel failed: ${res.status} — ${text}`);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

// OAuth-only check: if creds are present the API can be called. Shipper
// address completeness is validated at call time and surfaces a clear error
// if the admin hasn't filled it in via Settings → Shipping Origin.
export function isUSPSPickupConfigured(): boolean {
  return !!(USPS_CLIENT_ID && USPS_CLIENT_SECRET);
}
