/**
 * Inventory helpers — deduct stock when an order is paid.
 *
 * deductStockForOrder is intentionally idempotent: it checks the
 * `stockDeducted` flag on the Order before touching anything, so Stripe
 * webhook retries never double-decrement.
 */

import prisma from '@/lib/prisma';
import { cleanColorName } from '@/lib/colors';

/**
 * Decrement colorStock / sizeStock / totalStock on the linked AdminProduct
 * when an order is confirmed.  Does nothing when:
 *   - the order has no adminProductId (custom / legacy orders)
 *   - the product doesn't track inventory
 *   - stock was already deducted (idempotency)
 */
export async function deductStockForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      adminProductId: true,
      selectedSize: true,
      selectedColor: true,
      quantity: true,
      stockDeducted: true,
    },
  });

  if (!order) return;

  // Already processed — webhook retry guard.
  if (order.stockDeducted) {
    console.log(`[stock] order ${orderId} already deducted — skipping`);
    return;
  }

  if (!order.adminProductId) return; // no structured product link

  const product = await prisma.adminProduct.findUnique({
    where: { id: order.adminProductId },
    select: {
      trackInventory: true,
      totalStock: true,
      colorStock: true,
      sizeStock: true,
      variantStock: true,
    },
  });

  if (!product || !product.trackInventory) return;

  const qty = Math.max(1, order.quantity ?? 1);

  // ── variantStock path (preferred) ──────────────────────────────
  // When the product uses the color×size matrix, decrement the specific cell
  // and recompute colorStock + totalStock from the matrix.
  if (product.variantStock && order.selectedColor && order.selectedSize) {
    let updated = false;
    try {
      const matrix: Record<string, Record<string, number>> = JSON.parse(product.variantStock);
      const colorNeedle = cleanColorName(order.selectedColor).toLowerCase();
      const colorKey = Object.keys(matrix).find(
        (k) => cleanColorName(k).toLowerCase() === colorNeedle,
      );
      if (colorKey) {
        const sizeNeedle = order.selectedSize.trim().toUpperCase();
        const sizeKey = Object.keys(matrix[colorKey]).find(
          (k) => k.trim().toUpperCase() === sizeNeedle,
        );
        if (sizeKey !== undefined) {
          matrix[colorKey][sizeKey] = Math.max(0, (Number(matrix[colorKey][sizeKey]) || 0) - qty);
          updated = true;
        }
      }
      if (updated) {
        // Recompute colorStock from matrix.
        const colorMap: Record<string, number> = {};
        for (const [c, sizes] of Object.entries(matrix)) {
          colorMap[c] = Object.values(sizes).reduce((s, n) => s + (Number(n) || 0), 0);
        }
        // Recompute totalStock.
        const newTotal = Object.values(colorMap).reduce((s, n) => s + n, 0);

        await Promise.all([
          prisma.adminProduct.update({
            where: { id: order.adminProductId },
            data: {
              variantStock: JSON.stringify(matrix),
              colorStock: JSON.stringify(colorMap),
              totalStock: newTotal,
            },
          }),
          prisma.order.update({
            where: { id: orderId },
            data: { stockDeducted: true },
          }),
        ]);

        console.log(
          `[stock] variantStock deducted ${qty}× from product ${order.adminProductId}` +
            ` color=${order.selectedColor} size=${order.selectedSize}` +
            ` → totalStock=${newTotal}`,
        );
        return;
      }
    } catch {
      /* malformed JSON — fall through to legacy path */
    }
  }

  // ── Legacy path: separate colorStock / sizeStock ────────────────
  let newColorStock = product.colorStock;
  if (product.colorStock && order.selectedColor) {
    try {
      const map: Record<string, number> = JSON.parse(product.colorStock);
      const needle = cleanColorName(order.selectedColor).toLowerCase();
      const key = Object.keys(map).find(
        (k) => cleanColorName(k).toLowerCase() === needle,
      );
      if (key !== undefined) {
        map[key] = Math.max(0, (Number(map[key]) || 0) - qty);
        newColorStock = JSON.stringify(map);
      }
    } catch {
      /* malformed JSON — leave unchanged */
    }
  }

  // ── Decrement sizeStock ─────────────────────────────────────────
  let newSizeStock = product.sizeStock;
  if (product.sizeStock && order.selectedSize) {
    try {
      const map: Record<string, number> = JSON.parse(product.sizeStock);
      const needle = order.selectedSize.trim().toUpperCase();
      const key = Object.keys(map).find(
        (k) => k.trim().toUpperCase() === needle,
      );
      if (key !== undefined) {
        map[key] = Math.max(0, (Number(map[key]) || 0) - qty);
        newSizeStock = JSON.stringify(map);
      }
    } catch {
      /* malformed JSON — leave unchanged */
    }
  }

  // ── Recompute totalStock ────────────────────────────────────────
  // When colorStock drives the total, re-sum it.  When there's no colorStock
  // (e.g. product only has sizes), decrement totalStock directly.
  let newTotalStock = product.totalStock;
  if (newColorStock && newColorStock !== product.colorStock) {
    try {
      const map: Record<string, number> = JSON.parse(newColorStock);
      newTotalStock = Object.values(map).reduce(
        (s, n) => s + (Number(n) || 0),
        0,
      );
    } catch {
      /* ignore */
    }
  } else if (!product.colorStock) {
    newTotalStock = Math.max(0, product.totalStock - qty);
  }

  // ── Persist + mark order as deducted (atomic-ish) ──────────────
  await Promise.all([
    prisma.adminProduct.update({
      where: { id: order.adminProductId },
      data: {
        colorStock: newColorStock,
        sizeStock: newSizeStock,
        totalStock: newTotalStock,
      },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: { stockDeducted: true },
    }),
  ]);

  console.log(
    `[stock] deducted ${qty}× from product ${order.adminProductId}` +
      (order.selectedColor ? ` color=${order.selectedColor}` : '') +
      (order.selectedSize ? ` size=${order.selectedSize}` : '') +
      ` → totalStock=${newTotalStock}`,
  );
}
