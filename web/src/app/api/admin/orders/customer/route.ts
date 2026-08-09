import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// GET /api/admin/orders/customer — list all customer (online) orders with shipping addresses
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
        product: { select: { id: true, name: true, price: true, image: true } },
        payment: { select: { id: true, status: true, amount: true, paymentMethod: true } },
      },
    });

    return NextResponse.json(
      orders.map((o) => ({
        id: o.id,
        status: o.status,
        amount: o.amount,
        currency: o.currency,
        customer: { email: o.user?.email, name: o.user?.name || o.shippingName },
        product: o.product,
        payment: o.payment,
        shipping: {
          name: o.shippingName,
          address: o.shippingAddress,
          address2: o.shippingAddress2,
          city: o.shippingCity,
          state: o.shippingState,
          zip: o.shippingZip,
          country: o.shippingCountry || 'US',
          phone: o.shippingPhone,
        },
        hasShippingAddress: Boolean(o.shippingAddress && o.shippingCity && o.shippingState),
        createdAt: o.createdAt,
      }))
    );
  } catch (error) {
    console.error('Failed to fetch customer orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
