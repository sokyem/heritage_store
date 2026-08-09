/**
 * One-shot reconciliation: align storefront Order.status with linked
 * Shipment.status.
 *
 * Background: prior to the fix shipped alongside this script,
 *   - `updateShipmentStatus` only resolved storefront orders via the
 *     `STOREFRONT_ORDER:<id>` note prefix and ignored the `storefrontOrderId`
 *     FK that the admin "Buy Label" flow uses, so manually-bought labels
 *     never propagated to Order.status.
 *   - The admin Live Tracking lookup wrote `shipment.status` directly,
 *     bypassing `updateShipmentStatus` entirely.
 *   - `notifyOrderShipped` had no order-status side effect (only the doc
 *     claimed it did).
 * The net effect: many paid orders sit on `processing` even when the
 * shipment is out_for_delivery / delivered.
 *
 * What this script does (idempotent, dry-run by default):
 *   For every Shipment linked to a storefront Order (via FK or note prefix),
 *   if the shipment is delivered → set order.status = 'delivered'
 *   else if the shipment is in transit (picked_up / in_transit /
 *     out_for_delivery) → set order.status = 'shipped'
 *   Skips orders already in a terminal state (delivered / cancelled /
 *   refunded) and never downgrades.
 *
 * Usage:
 *   cd web && npx tsx prisma/reconcile-storefront-order-status.ts          # dry run
 *   cd web && npx tsx prisma/reconcile-storefront-order-status.ts --apply  # write changes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STOREFRONT_ORDER_NOTE_PREFIX = 'STOREFRONT_ORDER:';

function extractStorefrontOrderIds(shipment: {
  storefrontOrderId?: string | null;
  notes?: string | null;
}): string[] {
  const ids = new Set<string>();
  if (shipment.storefrontOrderId) ids.add(shipment.storefrontOrderId);
  if (shipment.notes) {
    const re = new RegExp(`${STOREFRONT_ORDER_NOTE_PREFIX}([A-Za-z0-9_-]+)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(shipment.notes)) !== null) ids.add(m[1]);
  }
  return Array.from(ids);
}

const IN_TRANSIT_SHIPMENT = new Set(['picked_up', 'in_transit', 'out_for_delivery']);
const TERMINAL_ORDER = new Set(['delivered', 'cancelled', 'refunded']);

async function main() {
  const apply = process.argv.includes('--apply');

  const shipments = await prisma.shipment.findMany({
    where: {
      OR: [
        { storefrontOrderId: { not: null } },
        { notes: { contains: STOREFRONT_ORDER_NOTE_PREFIX } },
      ],
    },
    select: {
      id: true,
      shipmentId: true,
      status: true,
      storefrontOrderId: true,
      notes: true,
      actualDelivery: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Scanning ${shipments.length} storefront-linked shipments…\n`);

  const plan: Array<{ orderId: string; from: string; to: string; shipmentId: string; shipmentStatus: string }> = [];

  for (const sh of shipments) {
    let target: 'delivered' | 'shipped' | null = null;
    if (sh.status === 'delivered') target = 'delivered';
    else if (IN_TRANSIT_SHIPMENT.has(sh.status)) target = 'shipped';
    if (!target) continue;

    const orderIds = extractStorefrontOrderIds(sh);
    if (orderIds.length === 0) continue;

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, status: true },
    });

    for (const o of orders) {
      // Never downgrade — only advance from non-terminal states
      if (TERMINAL_ORDER.has(o.status)) continue;
      if (o.status === target) continue;
      // shipped → don't bounce back from shipped to shipped (no-op above) and
      // don't downgrade a shipped order if shipment somehow regressed.
      if (o.status === 'shipped' && target !== 'delivered') continue;

      plan.push({
        orderId: o.id,
        from: o.status,
        to: target,
        shipmentId: sh.shipmentId,
        shipmentStatus: sh.status,
      });
    }
  }

  if (plan.length === 0) {
    console.log('Nothing to reconcile — every linked order already matches its shipment.');
    return;
  }

  console.log(`Found ${plan.length} order(s) to advance:\n`);
  for (const p of plan) {
    console.log(`  Order ${p.orderId.slice(-8).toUpperCase()}  ${p.from} → ${p.to}   (shipment ${p.shipmentId} = ${p.shipmentStatus})`);
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write changes.');
    return;
  }

  console.log('\nApplying…');
  let written = 0;
  for (const p of plan) {
    await prisma.order.update({ where: { id: p.orderId }, data: { status: p.to } });
    written++;
  }
  console.log(`Updated ${written} order(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
