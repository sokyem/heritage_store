import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { USPS_REQUESTED_SCOPES, fetchUSPSToken } from '@/lib/usps';

// GET /api/admin/shipping/usps-debug
//
// Shows exactly which OAuth scopes USPS is currently issuing for app
// awulak-shipping — the unambiguous answer to "is USPS approval done?".
// Returns the granted scope list (NEVER the access token itself).
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const baseUrl = process.env.USPS_BASE_URL || 'https://apis.usps.com';
  const clientId = process.env.USPS_CLIENT_ID || process.env.USPS_CONSUMER_KEY || '';
  const clientSecret =
    process.env.USPS_CLIENT_SECRET || process.env.USPS_CONSUMER_SECRET || process.env.USPS_SECRET || '';

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      ok: false,
      error: 'USPS_CLIENT_ID / USPS_CLIENT_SECRET not configured',
    }, { status: 400 });
  }

  const explicit = await fetchUSPSToken(USPS_REQUESTED_SCOPES);
  const fallback = explicit ? null : await fetchUSPSToken();

  const source = explicit ?? fallback;
  const grantedRaw = (source?.scope || '').trim();
  const granted = grantedRaw.split(/\s+/).filter(Boolean).sort();

  const REQUIRED_FOR_LABELS = ['labels', 'payments'];
  const REQUIRED_FOR_PICKUP = ['pickup', 'carrier-pickup']; // either name granted means "yes"

  const labelMissing = REQUIRED_FOR_LABELS.filter((s) => !granted.includes(s));
  const pickupGranted = REQUIRED_FOR_PICKUP.some((s) => granted.includes(s));

  let diagnosis: string;
  if (!source) {
    diagnosis = '❌ USPS OAuth refused both explicit and unscoped token requests. Check that USPS_CLIENT_ID/USPS_CLIENT_SECRET match a live developer.usps.com app, and that USPS_BASE_URL is correct.';
  } else if (labelMissing.length === 0 && pickupGranted) {
    diagnosis = '✅ All required scopes are granted. Label-buying and carrier pickup should work — try them now.';
  } else {
    const missing = [...labelMissing, ...(pickupGranted ? [] : ['pickup'])];
    diagnosis = `❌ USPS app is NOT approved for: ${missing.join(', ')}. Email USPS support quoting CRID 46441244 and app "awulak-shipping" to request these scopes — it's a manual approval on their side, no code can grant them.`;
  }

  return NextResponse.json({
    baseUrl,
    explicitScopeRequestSucceeded: Boolean(explicit),
    fallbackUsed: Boolean(fallback),
    grantedScopes: granted,
    requestedScopes: USPS_REQUESTED_SCOPES.split(' ').sort(),
    requiredForLabels: REQUIRED_FOR_LABELS,
    requiredForPickup: REQUIRED_FOR_PICKUP,
    labelScopesMissing: labelMissing,
    pickupScopeGranted: pickupGranted,
    diagnosis,
  });
}
