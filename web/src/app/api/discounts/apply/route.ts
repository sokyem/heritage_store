import { NextResponse } from 'next/server';
import { z } from 'zod';
import { evaluateDiscount } from '@/lib/discounts';

const Body = z.object({
  code: z.string().min(1).max(40),
  subtotal: z.number().nonnegative(),
  email: z.string().email().optional().nullable(),
});

export async function POST(req: Request) {
  let body;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 });
  }

  const result = await evaluateDiscount(body.code, body.subtotal, body.email);
  return NextResponse.json(result);
}
