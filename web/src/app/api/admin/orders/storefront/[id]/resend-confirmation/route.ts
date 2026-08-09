/**
 * POST /api/admin/orders/storefront/[id]/resend-confirmation
 *
 * Re-sends the order confirmation email to the customer. Useful when a
 * customer says they didn't receive their receipt.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { sendTemplate } from '@/lib/email';

const APP_URL = process.env.NEXTAUTH_URL || 'https://www.awulak.com';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, name: true } },
        product: { select: { name: true, price: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (!order.user?.email) {
      return NextResponse.json({ error: 'No customer email on file' }, { status: 400 });
    }

    const amount = (order.amount || order.product?.price || 0).toFixed(2);

    const ok = await sendTemplate('order_confirmation', order.user.email, {
      name: order.user.name || 'Customer',
      orderId: order.id.slice(-8).toUpperCase(),
      productName: order.product?.name || 'Your order',
      amount,
      orderUrl: `${APP_URL}/customer/dashboard`,
    });

    return NextResponse.json({ ok, sentTo: order.user.email });
  } catch (error) {
    console.error('[resend-confirmation]', error);
    return NextResponse.json({ error: 'Failed to resend confirmation' }, { status: 500 });
  }
}
