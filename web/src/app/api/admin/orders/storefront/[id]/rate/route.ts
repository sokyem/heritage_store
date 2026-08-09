import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { quoteShipmentForOrder } from '@/lib/auto-shipping';

// POST /api/admin/orders/storefront/[id]/rate
//
// Preview the cheapest USPS postage cost for an order WITHOUT buying a label,
// so the admin can see the cost before finalizing. Returns the EasyPost
// shipmentId/rateId, which the client then posts to /create-label to purchase
// the exact rate that was quoted (no price drift between preview and buy).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const quote = await quoteShipmentForOrder(id);

  if (quote.ok) {
    return NextResponse.json({
      ok: true,
      cost: quote.cost,
      service: quote.service,
      currency: quote.currency,
      shipmentId: quote.shipmentId,
      rateId: quote.rateId,
      weightLb: quote.weightLb,
    });
  }

  const reasonMsg: Record<string, string> = {
    order_not_found: 'Order not found.',
    missing_shipping_address: 'Order has no shipping address — add one before getting a rate.',
    rate_preview_unavailable: 'Rate preview needs EasyPost (USPS). Set EASYPOST_API_KEY in Railway.',
  };
  return NextResponse.json(
    { ok: false, error: reasonMsg[quote.reason || ''] || quote.reason || 'Could not get a shipping rate.' },
    { status: 400 },
  );
}
