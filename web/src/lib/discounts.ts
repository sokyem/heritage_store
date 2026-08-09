/**
 * Discount / coupon engine.
 *
 * Discounts are stored in the `Discount` table and applied at checkout by
 * the public `/api/discounts/apply` endpoint. Each successful application
 * creates a `DiscountRedemption` row so we can enforce per-customer and
 * total usage limits.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const DISCOUNT_TYPES = ['percent', 'fixed', 'free_shipping'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percent: 'Percentage off',
  fixed: 'Fixed amount off',
  free_shipping: 'Free shipping',
};

export const DiscountInputSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/i, 'Use letters, numbers, dashes, underscores only')
    .transform((s) => s.toUpperCase()),
  type: z.enum(DISCOUNT_TYPES),
  value: z.number().min(0).max(100000),
  minSubtotal: z.number().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).nullable().optional(),
  enabled: z.boolean().default(true),
  appliesTo: z
    .object({
      kind: z.enum(['all', 'products', 'collections']),
      ids: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
  description: z.string().max(500).nullable().optional(),
});

export type DiscountInput = z.infer<typeof DiscountInputSchema>;

export interface DiscountApplicationResult {
  ok: boolean;
  error?: string;
  amountOff: number; // currency amount off the subtotal
  freeShipping: boolean;
  discountId?: string;
  code?: string;
}

/**
 * Validate a code against a cart subtotal and (optionally) customer email.
 * Does not record a redemption — callers should call `recordRedemption`
 * after a successful order capture.
 */
export async function evaluateDiscount(
  code: string,
  subtotal: number,
  customerEmail?: string | null,
): Promise<DiscountApplicationResult> {
  const upper = code.trim().toUpperCase();
  if (!upper) return fail('Enter a code');

  const d = await prisma.discount.findUnique({ where: { code: upper } });
  if (!d || !d.enabled) return fail('Code not found');

  const now = new Date();
  if (d.startsAt && d.startsAt > now) return fail('Code not active yet');
  if (d.endsAt && d.endsAt < now) return fail('Code has expired');

  if (d.minSubtotal && subtotal < d.minSubtotal) {
    return fail(`Minimum subtotal of $${d.minSubtotal.toFixed(2)} required`);
  }
  if (d.usageLimit && d.usageCount >= d.usageLimit) {
    return fail('Code usage limit reached');
  }
  if (d.perCustomerLimit && customerEmail) {
    const used = await prisma.discountRedemption.count({
      where: { discountId: d.id, customerEmail },
    });
    if (used >= d.perCustomerLimit) return fail('You have already used this code');
  }

  let amountOff = 0;
  let freeShipping = false;
  if (d.type === 'percent') {
    amountOff = +(subtotal * (d.value / 100)).toFixed(2);
  } else if (d.type === 'fixed') {
    amountOff = Math.min(d.value, subtotal);
  } else if (d.type === 'free_shipping') {
    freeShipping = true;
  }

  return {
    ok: true,
    amountOff,
    freeShipping,
    discountId: d.id,
    code: d.code,
  };
}

export async function recordRedemption(opts: {
  discountId: string;
  customerEmail?: string | null;
  orderId?: string | null;
  amountOff: number;
}) {
  await prisma.$transaction([
    prisma.discountRedemption.create({
      data: {
        discountId: opts.discountId,
        customerEmail: opts.customerEmail ?? null,
        orderId: opts.orderId ?? null,
        amountOff: opts.amountOff,
      },
    }),
    prisma.discount.update({
      where: { id: opts.discountId },
      data: { usageCount: { increment: 1 } },
    }),
  ]);
}

function fail(error: string): DiscountApplicationResult {
  return { ok: false, error, amountOff: 0, freeShipping: false };
}
