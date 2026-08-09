import { NextRequest, NextResponse } from 'next/server';
import { validateAddress } from '@/lib/usps';
import type { ShipToAddress } from '@/lib/usps';

// POST /api/shipping/validate-address
// Public — used by the checkout form to standardize a shipping address before submit.
// Intentionally generous: rejects only requests with no street line, returns USPS
// suggestions on success. Callers should treat suggestions as advisory, not blocking.
export async function POST(req: NextRequest) {
  let body: Partial<ShipToAddress>;
  try {
    body = (await req.json()) as Partial<ShipToAddress>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || !body.addressLine1 || !body.state) {
    return NextResponse.json({ error: 'streetAddress and state are required' }, { status: 400 });
  }
  // Need either city or ZIP — matches USPS Addresses v3 requirement.
  if (!body.city && !body.postalCode) {
    return NextResponse.json({ error: 'city or postalCode is required' }, { status: 400 });
  }

  try {
    const result = await validateAddress({
      name: body.name || '',
      phone: body.phone,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city || '',
      state: body.state,
      postalCode: body.postalCode || '',
      country: body.country || 'US',
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[validate-address] failed', err);
    // Never block checkout — degrade to "unverified" rather than 500.
    return NextResponse.json({
      isValid: false,
      classification: 'unknown',
      warnings: ['Address verification temporarily unavailable'],
      corrections: [],
      needsCorrection: false,
    });
  }
}
