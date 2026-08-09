/**
 * GET /api/admin/orders/storefront/export
 *
 * Streams all storefront orders as a CSV download. Respects the same
 * filter params as the list endpoint (?status, ?paymentStatus, ?search)
 * so you can export exactly what you see in the table.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const paymentStatus = url.searchParams.get('paymentStatus');
  const search = url.searchParams.get('search')?.trim().toLowerCase();

  try {
    const orders = await prisma.order.findMany({
      where: {
        ...(status && status !== 'all' ? { status } : {}),
        ...(paymentStatus ? { payment: { status: paymentStatus } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, name: true } },
        product: { select: { name: true, price: true } },
        payment: { select: { status: true, amount: true, paymentMethod: true, last4: true, brand: true } },
      },
    });

    const filtered = search
      ? orders.filter((o) =>
          o.id.toLowerCase().includes(search) ||
          (o.user?.email || '').toLowerCase().includes(search) ||
          (o.user?.name || '').toLowerCase().includes(search) ||
          (o.product?.name || '').toLowerCase().includes(search),
        )
      : orders;

    const header = [
      'Order ID', 'Date', 'Status', 'Customer Name', 'Customer Email',
      'Product', 'Amount', 'Currency', 'Payment Status', 'Payment Method', 'Card',
      'Shipping Name', 'Shipping Address', 'Shipping Address 2',
      'Shipping City', 'Shipping State', 'Shipping ZIP', 'Shipping Country', 'Shipping Phone',
      'Notes',
    ];

    const rows = filtered.map((o) => [
      o.id.slice(-8).toUpperCase(),
      o.createdAt.toISOString(),
      o.status,
      o.user?.name || o.shippingName || '',
      o.user?.email || '',
      o.product?.name || '',
      (o.amount || 0).toFixed(2),
      o.currency || 'USD',
      o.payment?.status || '',
      o.payment?.paymentMethod || '',
      o.payment?.brand && o.payment?.last4 ? `${o.payment.brand} ****${o.payment.last4}` : '',
      o.shippingName || '',
      o.shippingAddress || '',
      o.shippingAddress2 || '',
      o.shippingCity || '',
      o.shippingState || '',
      o.shippingZip || '',
      o.shippingCountry || 'US',
      o.shippingPhone || '',
      o.customNotes || '',
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\r\n');

    const filename = `awulak-orders-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[storefront/export]', error);
    return NextResponse.json({ error: 'Failed to export orders' }, { status: 500 });
  }
}
