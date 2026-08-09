import { NextRequest, NextResponse } from 'next/server';
import { getRates as getUpsRates } from '@/lib/ups';
import { getRates as getUspsRates } from '@/lib/usps';
import { getInternationalSurcharge } from '@/lib/easypost';
import { getSetting } from '@/lib/settings';

type CarrierCode = 'UPS' | 'USPS';

function resolveCarrier(): CarrierCode {
  const raw = String(process.env.DEFAULT_SHIPPING_CARRIER || 'UPS').toUpperCase();
  return raw === 'USPS' ? 'USPS' : 'UPS';
}

// POST /api/shipping/rates
//
// Public — checkout (incl. guest) calls this to price the cart before payment.
// Dispatches to the carrier from DEFAULT_SHIPPING_CARRIER and also returns
// absorbShipping so the checkout knows whether to add the cost to the customer's
// charge or leave the customer at subtotal-only.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.addressLine1 || !body.state || !body.postalCode) {
    return NextResponse.json({ error: 'addressLine1, state, postalCode required' }, { status: 400 });
  }

  const carrier = resolveCarrier();
  const shipperSettings = await getSetting('shipper').catch(() => null);
  const absorbShipping = shipperSettings?.absorbShippingCost ?? true;

  try {
    const shipTo = {
      name: String(body.recipientName || 'Customer'),
      addressLine1: String(body.addressLine1),
      addressLine2: body.addressLine2 ? String(body.addressLine2) : undefined,
      city: String(body.city || ''),
      state: String(body.state),
      postalCode: String(body.postalCode),
      country: String(body.country || 'US'),
    };
    const pkg = {
      weight: Number(body.weight) || 0.2,
      length: Number(body.length) || 16,
      width: Number(body.width) || 12,
      height: Number(body.height) || 4,
    };

    // International surcharge the customer absorbs while AWULA K covers the
    // domestic-equivalent (only meaningful when absorbing; 0 for US addresses).
    const internationalSurcharge = absorbShipping
      ? await getInternationalSurcharge(shipTo, pkg)
      : 0;

    const rates = carrier === 'USPS'
      ? await getUspsRates(shipTo, pkg)
      : await getUpsRates(shipTo, pkg);

    rates.sort((a, b) => a.totalCharge - b.totalCharge);
    return NextResponse.json({ rates, carrier, absorbShipping, internationalSurcharge });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get rates';
    // Still return the absorbShipping flag (and any computed surcharge) so
    // checkout renders the right copy even when the rate quote itself fails.
    const fallbackSurcharge = absorbShipping
      ? await getInternationalSurcharge(
          {
            name: String(body.recipientName || 'Customer'),
            addressLine1: String(body.addressLine1),
            addressLine2: body.addressLine2 ? String(body.addressLine2) : undefined,
            city: String(body.city || ''),
            state: String(body.state),
            postalCode: String(body.postalCode),
            country: String(body.country || 'US'),
          },
          { weight: Number(body.weight) || 0.2, length: Number(body.length) || 16, width: Number(body.width) || 12, height: Number(body.height) || 4 },
        ).catch(() => 0)
      : 0;
    return NextResponse.json({ error: message, absorbShipping, internationalSurcharge: fallbackSurcharge }, { status: 500 });
  }
}
