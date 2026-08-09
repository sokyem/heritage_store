/**
 * Auto-shipping helper.
 *
 * When a storefront Order is paid, automatically:
 *   1. Create a Shipment record using the order's shipping address.
 *   2. If the default carrier is configured, generate a label and store the tracking number.
 *
 * The storefront `Order` model does not have a direct relation to `Shipment`
 * (Shipment only links to AdminOrder / CustomOrder / RentalOrder). To still
 * link them, we store the originating order id in `Shipment.notes` as
 * `STOREFRONT_ORDER:<orderId>` and fall back to looking up by that pattern.
 *
 * Failures are logged but never thrown — auto-shipping is a best-effort
 * background step that must not break the checkout flow.
 */
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { createShipment, isUPSConfigured, type ShipToAddress, type PackageDetails, type UPSServiceCode } from '@/lib/ups';
import { createShipment as createUspsShipment, isUSPSReadyForLabels, type USPSServiceCode } from '@/lib/usps';
import { getCheapestRate, buyRate as buyEasyPostRate, isEasyPostConfigured } from '@/lib/easypost';

export const STOREFRONT_ORDER_NOTE_PREFIX = 'STOREFRONT_ORDER:';

/**
 * Resolve the storefront order id a shipment belongs to. Auto-shipping links
 * via the note prefix; the admin Shipping & Labels flow links via the
 * storefrontOrderId FK. Check the FK first, then fall back to the note prefix
 * so both old and new shipments resolve uniformly.
 */
export function storefrontOrderIdFromShipment(shipment: {
  storefrontOrderId?: string | null;
  notes?: string | null;
}): string | null {
  if (shipment.storefrontOrderId) return shipment.storefrontOrderId;
  if (shipment.notes) {
    const m = shipment.notes.match(new RegExp(`${STOREFRONT_ORDER_NOTE_PREFIX}([A-Za-z0-9_-]+)`));
    if (m) return m[1];
  }
  return null;
}

/**
 * Advance a paid storefront order to "awaiting_collection" once a label exists
 * for its shipment — so a manually-bought label (Shipping & Labels section)
 * moves the order the same way an auto-generated one does.
 * Only moves scheduled/processing → awaiting_collection, so it never
 * downgrades an order that is already shipped/delivered/etc.
 */
export async function advanceStorefrontOrderForShipment(shipment: {
  storefrontOrderId?: string | null;
  notes?: string | null;
}): Promise<void> {
  const orderId = storefrontOrderIdFromShipment(shipment);
  if (!orderId) return;
  await prisma.order
    .updateMany({ where: { id: orderId, status: { in: ['scheduled', 'processing'] } }, data: { status: 'awaiting_collection' } })
    .catch((err) => console.error('[shipping] failed to advance order to awaiting_collection:', err));
}

type AutoCarrier = 'UPS' | 'USPS';

// USPS is the default carrier; admin can override per-deployment with
// DEFAULT_SHIPPING_CARRIER=UPS. Other carriers stay selectable manually.
function resolveDefaultCarrier(): AutoCarrier {
  const raw = String(process.env.DEFAULT_SHIPPING_CARRIER || 'USPS').toUpperCase();
  return raw === 'UPS' ? 'UPS' : 'USPS';
}

interface AutoShipmentResult {
  ok: boolean;
  shipmentId?: string;
  trackingNumber?: string | null;
  labelStatus: 'created' | 'pending' | 'skipped' | 'failed';
  reason?: string;
}

const DEFAULT_PACKAGE: PackageDetails = {
  // Default parcel weight for a typical AWULA K garment. Used only when the
  // product has no configured weightLb; heavier items should set a per-product
  // weight (AdminProduct.weightLb), which overrides this. Kept low (0.2 lb) so
  // a light garment doesn't get over-charged at the 2 lb Ground Advantage tier.
  weight: 0.2, // lbs
  length: 16,
  width: 12,
  height: 4,
};

/**
 * Preview the cheapest USPS postage for an order WITHOUT buying — so the admin
 * sees the cost before finalizing. Returns the EasyPost shipmentId/rateId so
 * the subsequent buy purchases the exact rate quoted (no price drift).
 */
export async function quoteShipmentForOrder(orderId: string): Promise<{
  ok: boolean;
  cost?: number;
  service?: string;
  currency?: string;
  shipmentId?: string;
  rateId?: string;
  weightLb?: number;
  reason?: string;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true, product: true },
  });
  if (!order) return { ok: false, reason: 'order_not_found' };
  if (!order.shippingAddress || !order.shippingCity || !order.shippingState || !order.shippingZip) {
    return { ok: false, reason: 'missing_shipping_address' };
  }
  if (resolveDefaultCarrier() !== 'USPS' || !isEasyPostConfigured()) {
    return { ok: false, reason: 'rate_preview_unavailable' };
  }

  let weightLb = DEFAULT_PACKAGE.weight;
  if (order.product?.name) {
    const ap = await prisma.adminProduct.findFirst({
      where: { name: order.product.name },
      select: { weightLb: true },
    });
    if (ap?.weightLb && ap.weightLb > 0) weightLb = ap.weightLb;
  }

  const address: ShipToAddress = {
    name: order.shippingName || order.user?.name || 'Customer',
    phone: order.shippingPhone || undefined,
    addressLine1: order.shippingAddress,
    addressLine2: order.shippingAddress2 || undefined,
    city: order.shippingCity,
    state: order.shippingState,
    postalCode: order.shippingZip,
    country: order.shippingCountry || 'US',
  };
  const pkg: PackageDetails = { ...DEFAULT_PACKAGE, weight: weightLb, declaredValue: order.amount || undefined };

  try {
    const rate = await getCheapestRate(address, pkg, 'USPS_GROUND_ADVANTAGE' as USPSServiceCode);
    return {
      ok: true,
      cost: rate.cost,
      service: rate.service,
      currency: rate.currency,
      shipmentId: rate.shipmentId,
      rateId: rate.rateId,
      weightLb,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'rate_failed' };
  }
}

export async function autoCreateShipmentForOrder(
  orderId: string,
  opts?: { prebought?: { shipmentId: string; rateId: string } },
): Promise<AutoShipmentResult> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true, product: true },
    });
    if (!order) return { ok: false, labelStatus: 'skipped', reason: 'order_not_found' };

    // Skip if a shipment is already linked via our note prefix
    const existing = await prisma.shipment.findFirst({
      where: { notes: { contains: `${STOREFRONT_ORDER_NOTE_PREFIX}${orderId}` } },
    });
    if (existing) {
      return {
        ok: true,
        shipmentId: existing.id,
        trackingNumber: existing.trackingNumber,
        labelStatus: existing.trackingNumber ? 'created' : 'pending',
        reason: 'already_exists',
      };
    }

    // Need a shipping address to create a label
    if (!order.shippingAddress || !order.shippingCity || !order.shippingState || !order.shippingZip) {
      return { ok: false, labelStatus: 'skipped', reason: 'missing_shipping_address' };
    }

    const recipientName = order.shippingName || order.user?.name || 'Customer';
    const recipientEmail = order.user?.email || null;
    const recipientPhone = order.shippingPhone || null;

    const carrier = resolveDefaultCarrier();
    const defaultService = carrier === 'USPS' ? 'USPS_GROUND_ADVANTAGE' : 'ups_ground';

    // Use the product's configured shipping weight when set (checkout mirrors
    // AdminProduct → Product by name), else the default parcel weight.
    let resolvedWeightLb = DEFAULT_PACKAGE.weight;
    if (order.product?.name) {
      const ap = await prisma.adminProduct.findFirst({
        where: { name: order.product.name },
        select: { weightLb: true },
      });
      if (ap?.weightLb && ap.weightLb > 0) resolvedWeightLb = ap.weightLb;
    }

    // Create the shipment row with a collision-proof id (advances past any
    // existing SHP-NNNN, retrying on a concurrent-insert collision).
    const shipment = await createShipmentRow({
      // Link via the FK too (not just the note prefix) so the Shipping &
      // Labels page shows the order and status logic resolves it directly.
      storefrontOrderId: orderId,
      recipientName,
      recipientPhone,
      recipientEmail,
      addressLine1: order.shippingAddress,
      addressLine2: order.shippingAddress2 || null,
      city: order.shippingCity,
      state: order.shippingState,
      postalCode: order.shippingZip,
      country: order.shippingCountry || 'US',
      carrier,
      serviceType: defaultService,
      packageWeight: resolvedWeightLb,
      packageLength: DEFAULT_PACKAGE.length,
      packageWidth: DEFAULT_PACKAGE.width,
      packageHeight: DEFAULT_PACKAGE.height,
      declaredValue: order.amount || null,
      status: 'pending',
      notes: `${STOREFRONT_ORDER_NOTE_PREFIX}${orderId}`,
    });

    // If the selected carrier isn't configured yet, leave shipment as pending so admin can finish manually
    const carrierConfigured = carrier === 'USPS' ? isUSPSReadyForLabels() : isUPSConfigured();
    if (!carrierConfigured) {
      return {
        ok: true,
        shipmentId: shipment.id,
        labelStatus: 'pending',
        reason: carrier === 'USPS' ? 'usps_not_configured' : 'ups_not_configured',
      };
    }

    // Try to generate a label with the selected carrier
    try {
      const address: ShipToAddress = {
        name: recipientName,
        phone: recipientPhone || undefined,
        addressLine1: order.shippingAddress,
        addressLine2: order.shippingAddress2 || undefined,
        city: order.shippingCity,
        state: order.shippingState,
        postalCode: order.shippingZip,
        country: order.shippingCountry || 'US',
      };
      const pkg = { ...DEFAULT_PACKAGE, weight: resolvedWeightLb, declaredValue: order.amount || undefined };
      const description = `AWULA K Order ${shipment.shipmentId}`;

      // If the admin already previewed a rate, buy that exact EasyPost rate so
      // the charge matches the quoted cost; otherwise rate + buy the cheapest.
      const label = carrier === 'USPS'
        ? (opts?.prebought
            ? await buyEasyPostRate(opts.prebought.shipmentId, opts.prebought.rateId, order.amount || undefined)
            : await createUspsShipment(address, pkg, 'USPS_GROUND_ADVANTAGE' as USPSServiceCode, description))
        : await createShipment(address, pkg, '03' as UPSServiceCode, description);

      const updated = await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          trackingNumber: label.trackingNumber,
          labelData: label.labelImageBase64 || null,
          shippingCost: label.totalCharge || null,
          status: 'label_created',
          shippedAt: new Date(),
        },
      });

      // Only advance to awaiting_collection when we actually have a real
      // tracking number — i.e. the label was genuinely purchased. If the
      // carrier returned empty data the shipment row is saved but the order
      // stays at its current status so the admin knows to investigate.
      if (label.trackingNumber) {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'awaiting_collection' },
        }).catch((err) => console.error('[auto-shipping] failed to advance order status:', err));
      }

      return {
        ok: true,
        shipmentId: updated.id,
        trackingNumber: updated.trackingNumber,
        labelStatus: 'created',
      };
    } catch (labelError) {
      const reason = labelError instanceof Error ? labelError.message : `${carrier.toLowerCase()}_error`;
      console.error(`[auto-shipping] ${carrier} label creation failed:`, reason);
      return { ok: true, shipmentId: shipment.id, labelStatus: 'failed', reason };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    console.error('[auto-shipping] Failed to create shipment:', reason);
    return { ok: false, labelStatus: 'failed', reason };
  }
}

/**
 * Highest existing SHP-NNNN as a number (0 if none). A NUMERIC cast is
 * required: string ordering puts "SHP-10000" *below* "SHP-9999", so the old
 * `orderBy: { shipmentId: 'desc' }` returned a stale (lower) max once the table
 * passed 9,999 rows and handed back a colliding id. This also folds in the
 * legacy 3-digit ids ("SHP-001") the admin route used to mint.
 */
async function maxShipmentNumber(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(SUBSTRING("shipmentId" FROM 5) AS INTEGER))::int AS max
    FROM "Shipment"
    WHERE "shipmentId" ~ '^SHP-[0-9]+$'
  `;
  return rows[0]?.max ?? 0;
}

/** Canonical zero-padded shipment id, e.g. 43 -> "SHP-0043". */
export function formatShipmentId(n: number): string {
  return `SHP-${String(n).padStart(4, '0')}`;
}

/**
 * Create a Shipment row with a collision-proof SHP-NNNN id — the single source
 * of truth for both auto-shipping and the admin Shipping & Labels routes.
 *
 * Starts at the numeric max + 1 and, on a unique-constraint collision (a
 * concurrent insert, a numbering gap, or a legacy id from the old `count()+1`
 * scheme), ADVANCES to the next number and retries. The previous code
 * regenerated the *same* id on every retry, so any genuine collision was
 * unrecoverable and threw "Unique constraint failed on (shipmentId)" — which is
 * exactly what broke label creation in production.
 */
export async function createShipmentRow(
  data: Omit<Prisma.ShipmentUncheckedCreateInput, 'shipmentId'>,
): Promise<Awaited<ReturnType<typeof prisma.shipment.create>>> {
  const base = (await maxShipmentNumber()) + 1;
  const MAX_ATTEMPTS = 25;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.shipment.create({
        data: { ...data, shipmentId: formatShipmentId(base + attempt) },
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const isUnique = code === 'P2002' || (err instanceof Error && err.message.includes('Unique constraint'));
      if (isUnique && attempt < MAX_ATTEMPTS - 1) continue;
      throw err;
    }
  }
  // Loop always returns or throws; this satisfies the type checker.
  throw new Error('Could not allocate a unique shipmentId');
}
