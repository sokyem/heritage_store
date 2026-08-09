import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { getShipperAddress } from '@/lib/shipper-address';
import { isUSPSReadyForLabels, isUSPSDirectLabelsReady } from '@/lib/usps';
import { isEasyPostConfigured } from '@/lib/easypost';

// GET /api/admin/shipping/origin
//
// Diagnostic: shows the shipper (origin) address the label code actually
// resolves, plus label-provider readiness. Open it in the browser while
// signed in as admin to confirm the saved origin is being read.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const s = await getShipperAddress();
  const complete = !!(s.addressLine1 && s.city && s.state && s.zip);

  return NextResponse.json({
    origin: {
      name: s.name,
      firstName: s.firstName,
      lastName: s.lastName,
      addressLine1: s.addressLine1,
      addressLine2: s.addressLine2,
      city: s.city,
      state: s.state,
      zip: s.zip,
      country: s.country,
      phone: s.phone,
    },
    originComplete: complete,
    missing: complete ? [] : ['addressLine1', 'city', 'state', 'zip'].filter((k) => !(s as Record<string, unknown>)[k]),
    labelProvider: isUSPSDirectLabelsReady() ? 'USPS (direct)' : isEasyPostConfigured() ? 'EasyPost' : 'none',
    easyPostConfigured: isEasyPostConfigured(),
    labelsReady: isUSPSReadyForLabels(),
  });
}
