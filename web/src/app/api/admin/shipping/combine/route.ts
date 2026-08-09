import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { createShipment as createUspsShipment, isUSPSReadyForLabels, type USPSServiceCode } from '@/lib/usps';
import type { ShipToAddress, PackageDetails } from '@/lib/ups';
import { STOREFRONT_ORDER_NOTE_PREFIX, createShipmentRow } from '@/lib/auto-shipping';

// POST /api/admin/shipping/combine  { orderIds: string[] }
//
// Combines several storefront orders that ship to the SAME address into one
// shipment + one USPS label (summed weight, single tracking number). All the
// orders are linked to that shipment and marked shipped.

const DEFAULT_DIMS = { length: 16, width: 12, height: 4 };
const DEFAULT_WEIGHT = 2;

function addrKey(o: {
  shippingName: string | null; shippingAddress: string | null; shippingAddress2: string | null;
  shippingCity: string | null; shippingState: string | null; shippingZip: string | null;
}): string {
  return [o.shippingName, o.shippingAddress, o.shippingAddress2, o.shippingCity, o.shippingState, o.shippingZip]
    .map((x) => (x || '').trim().toLowerCase())
    .join('|');
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const body = await req.json().catch(() => null);
  const orderIds: string[] = Array.isArray(body?.orderIds) ? body.orderIds.filter((x: unknown) => typeof x === 'string') : [];
  if (orderIds.length < 2) {
    return NextResponse.json({ error: 'Select at least two orders to combine.' }, { status: 400 });
  }

  if (!isUSPSReadyForLabels()) {
    return NextResponse.json({ error: 'Label-buying is not configured (set EASYPOST_API_KEY or USPS credentials).' }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    include: { user: true, product: true },
  });
  if (orders.length < 2) {
    return NextResponse.json({ error: 'Could not find the selected orders.' }, { status: 404 });
  }

  // All orders must ship to the same address.
  if (new Set(orders.map(addrKey)).size !== 1) {
    return NextResponse.json({ error: 'Orders must all ship to the same address.' }, { status: 400 });
  }

  const first = orders[0];
  if (!first.shippingAddress || !first.shippingCity || !first.shippingState || !first.shippingZip) {
    return NextResponse.json({ error: 'The shared address is incomplete.' }, { status: 400 });
  }

  // Sum each order's product weight (resolved by name; default 2 lb each).
  let totalWeight = 0;
  for (const o of orders) {
    let w = DEFAULT_WEIGHT;
    if (o.product?.name) {
      const ap = await prisma.adminProduct.findFirst({ where: { name: o.product.name }, select: { weightLb: true } });
      if (ap?.weightLb && ap.weightLb > 0) w = ap.weightLb;
    }
    totalWeight += w;
  }

  const address: ShipToAddress = {
    name: first.shippingName || first.user?.name || 'Customer',
    phone: first.shippingPhone || undefined,
    addressLine1: first.shippingAddress,
    addressLine2: first.shippingAddress2 || undefined,
    city: first.shippingCity,
    state: first.shippingState,
    postalCode: first.shippingZip,
    country: first.shippingCountry || 'US',
  };
  const declaredValue = orders.reduce((s, o) => s + (o.amount || 0), 0) || undefined;
  const pkg: PackageDetails = { weight: totalWeight, ...DEFAULT_DIMS, declaredValue };

  let label;
  try {
    label = await createUspsShipment(address, pkg, 'USPS_GROUND_ADVANTAGE' as USPSServiceCode, `AWULA K combined ${orders.length} orders`);
  } catch (err) {
    console.error('[combine] label buy failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to buy the combined label.' }, { status: 502 });
  }

  // notes carry every order id so each order resolves to this one shipment.
  const notes = orders.map((o) => `${STOREFRONT_ORDER_NOTE_PREFIX}${o.id}`).join(' ') + ` | combined ${orders.length} orders`;

  const shipment = await createShipmentRow({
      storefrontOrderId: first.id,
      recipientName: address.name,
      recipientPhone: address.phone || null,
      recipientEmail: first.user?.email || null,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || null,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      carrier: 'USPS',
      serviceType: 'USPS_GROUND_ADVANTAGE',
      packageWeight: totalWeight,
      packageLength: DEFAULT_DIMS.length,
      packageWidth: DEFAULT_DIMS.width,
      packageHeight: DEFAULT_DIMS.height,
      declaredValue: declaredValue || null,
      trackingNumber: label.trackingNumber,
      labelData: label.labelImageBase64 || null,
      shippingCost: label.totalCharge || null,
      status: 'label_created',
      shippedAt: new Date(),
      notes,
  });

  await prisma.order.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { status: 'shipped' } });

  return NextResponse.json({
    ok: true,
    shipmentId: shipment.shipmentId,
    trackingNumber: label.trackingNumber,
    combinedOrders: orders.length,
    totalWeightLb: totalWeight,
  });
}
