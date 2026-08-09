import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { autoCreateShipmentForOrder } from '@/lib/auto-shipping';
import { isUSPSReadyForLabels } from '@/lib/usps';

// POST /api/admin/orders/storefront/[id]/create-label
//
// Manually buy a shipping label (USPS via EasyPost) for one storefront order,
// reusing the same flow that runs automatically on payment. Idempotent — if a
// label already exists for the order it returns the existing one.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  if (!isUSPSReadyForLabels()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Label-buying is not configured in this environment. Set EASYPOST_API_KEY (or EASYPOST_API) — a funded live key (EZAK…) for real postage, or a test key (EZTK…) for sandbox labels — then redeploy.',
      },
      { status: 400 },
    );
  }

  const { id } = await params;

  // If the admin previewed a rate, buy that exact EasyPost rate so the charge
  // matches the quoted cost. Body is optional — without it we rate + buy the
  // cheapest USPS rate automatically.
  const body = await req.json().catch(() => ({}));
  const prebought =
    body && typeof body.shipmentId === 'string' && typeof body.rateId === 'string'
      ? { shipmentId: body.shipmentId, rateId: body.rateId }
      : undefined;

  const result = await autoCreateShipmentForOrder(id, prebought ? { prebought } : undefined);

  if (result.labelStatus === 'created') {
    return NextResponse.json({ ...result, ok: true });
  }
  if (result.labelStatus === 'skipped' && result.reason === 'already_exists') {
    return NextResponse.json({ ...result, ok: true, alreadyExists: true });
  }
  // pending / failed / skipped (missing address etc.)
  const reasonMsg: Record<string, string> = {
    missing_shipping_address: 'This order has no complete shipping address (street, city, state and ZIP are required). Add the address on the order before buying a label.',
    order_not_found: 'Order not found.',
    usps_not_configured: 'USPS/EasyPost label-buying is not configured. Set EASYPOST_API_KEY (or EASYPOST_API) and redeploy.',
    ups_not_configured: 'UPS is not configured.',
  };

  // Surface the carrier API error verbatim when the buy itself failed — it
  // usually pinpoints the blocker (e.g. EasyPost "insufficient funds", an
  // invalid origin/destination address, or no available USPS rates).
  const rawReason = result.reason || '';
  const friendly = reasonMsg[rawReason]
    || (rawReason.toLowerCase().includes('shipper') ? rawReason
      : rawReason.toLowerCase().includes('insufficient') || rawReason.toLowerCase().includes('payment')
        ? `Label payment failed — fund your EasyPost account. (${rawReason})`
        : rawReason)
    || 'Could not create a label.';

  return NextResponse.json(
    { ...result, ok: false, error: friendly },
    { status: result.labelStatus === 'failed' ? 502 : 400 },
  );
}
