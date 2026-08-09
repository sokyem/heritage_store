import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { autoCreateShipmentForOrder, STOREFRONT_ORDER_NOTE_PREFIX } from '@/lib/auto-shipping';
import { refundLabel } from '@/lib/easypost';

// POST /api/admin/orders/storefront/[id]/recreate-label
//
// Void the existing label for a storefront order (submit a refund to USPS via
// EasyPost) and buy a fresh one — used when the wrong service was bought or the
// address changed. The replacement goes through the normal auto-shipping flow,
// so it lands on USPS Ground Advantage (the requested service). Refunds are
// best-effort: USPS processes them asynchronously, so we don't block recreating
// on the refund completing.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  // Resolve the order's existing shipment via the FK or the note prefix.
  const existing = await prisma.shipment.findFirst({
    where: {
      OR: [
        { storefrontOrderId: id },
        { notes: { contains: `${STOREFRONT_ORDER_NOTE_PREFIX}${id}` } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  // Don't void a parcel that's already moving — the carrier won't refund it and
  // the customer may already have tracking.
  if (existing && ['in_transit', 'out_for_delivery', 'delivered'].includes(existing.status)) {
    return NextResponse.json(
      { ok: false, error: `This shipment is already "${existing.status}" — it can't be voided. Create a return label instead.` },
      { status: 400 },
    );
  }

  // Capture the old tracking number before deleting the row, then remove the
  // shipment so auto-shipping (which is idempotent on the order) mints a fresh
  // label instead of returning the old one.
  const oldTracking = existing?.trackingNumber || null;
  const oldCarrier = existing?.carrier || 'USPS';
  if (existing) {
    await prisma.shipmentEvent.deleteMany({ where: { shipmentId: existing.id } });
    await prisma.shipment.delete({ where: { id: existing.id } });
  }

  // Roll the order back to "scheduled" so the new label advances it again.
  await prisma.order
    .updateMany({ where: { id, status: 'processing' }, data: { status: 'scheduled' } })
    .catch(() => {});

  // Submit the refund for the old label (best-effort — USPS is async).
  let refund: { ok: boolean; status?: string; message?: string } | null = null;
  if (oldTracking) {
    refund = await refundLabel(oldTracking, oldCarrier);
  }

  // Buy the replacement label (USPS Ground Advantage via the auto-shipping flow).
  const result = await autoCreateShipmentForOrder(id);

  if (result.labelStatus === 'created') {
    return NextResponse.json({ ...result, ok: true, voided: { trackingNumber: oldTracking, refund } });
  }

  // The new label didn't buy — surface the reason. The old label is already
  // voided + removed, so the admin can press "Buy label" again to retry.
  const reasonMsg: Record<string, string> = {
    missing_shipping_address: 'This order has no complete shipping address (street, city, state and ZIP). Add it before buying a label.',
    order_not_found: 'Order not found.',
    usps_not_configured: 'USPS/EasyPost label-buying is not configured.',
    ups_not_configured: 'UPS is not configured.',
  };
  const rawReason = result.reason || '';
  const friendly = reasonMsg[rawReason] || rawReason || 'Could not buy the replacement label.';

  return NextResponse.json(
    { ...result, ok: false, error: friendly, voided: { trackingNumber: oldTracking, refund } },
    { status: result.labelStatus === 'failed' ? 502 : 400 },
  );
}
