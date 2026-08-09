/**
 * GET /api/admin/orders/storefront
 *
 * Returns all storefront customer orders (the e-commerce `Order` table —
 * NOT the studio `AdminOrder` table). Supports filtering by status,
 * payment status, fulfillment status, and a free-text search across
 * order ID, customer email, customer name.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { STOREFRONT_ORDER_NOTE_PREFIX } from '@/lib/auto-shipping';

// Whitelist of orderable columns. We never trust the client to inject
// arbitrary fields into Prisma's `orderBy`.
const SORTABLE_COLUMNS: Record<string, 'createdAt' | 'updatedAt' | 'amount' | 'status'> = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  amount: 'amount',
  status: 'status',
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const paymentStatus = url.searchParams.get('paymentStatus');
  const search = url.searchParams.get('search')?.trim().toLowerCase();

  // Pagination: ?page=1&pageSize=25
  const rawPage = parseInt(url.searchParams.get('page') || '1', 10);
  const rawSize = parseInt(url.searchParams.get('pageSize') || '25', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 25));

  // Sorting: ?sortBy=createdAt&sortDir=desc
  const sortByParam = url.searchParams.get('sortBy') || 'createdAt';
  const sortBy = SORTABLE_COLUMNS[sortByParam] || 'createdAt';
  const sortDir = url.searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';

  try {
    const where = {
      // `abandoned` and `pending` (unpaid / payment-not-completed) orders are
      // checkout noise — hide them from the default/"all" view to keep the list
      // focused on real orders, but still allow filtering to either explicitly
      // via the status dropdown.
      ...(status && status !== 'all' ? { status } : { status: { notIn: ['abandoned', 'pending'] } }),
      ...(paymentStatus ? { payment: { status: paymentStatus } } : {}),
    };

    // When `search` is present we still need to filter in-memory because it
    // hits four nested string fields. Fetch a wider window to ensure the
    // page still fills. For non-search queries we paginate in the database.
    const useDbPagination = !search;

    const [orders, totalCount] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        ...(useDbPagination ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
        include: {
          user: { select: { id: true, email: true, name: true } },
          product: { select: { id: true, name: true, price: true, image: true } },
          payment: {
            select: {
              id: true,
              status: true,
              amount: true,
              paymentMethod: true,
              last4: true,
              brand: true,
              receipt_url: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const mapped = orders.map((o) => ({
      id: o.id,
      shortId: o.id.slice(-8).toUpperCase(),
      status: o.status,
      amount: o.amount,
      currency: o.currency,
      customNotes: o.customNotes,
      customer: {
        id: o.user?.id,
        email: o.user?.email,
        name: o.user?.name || o.shippingName,
      },
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
      updatedAt: o.updatedAt,
    }));

    let items = mapped;
    let total = totalCount;

    if (search) {
      const matches = mapped.filter((o) =>
        o.shortId.toLowerCase().includes(search) ||
        (o.customer.email || '').toLowerCase().includes(search) ||
        (o.customer.name || '').toLowerCase().includes(search) ||
        (o.product?.name || '').toLowerCase().includes(search),
      );
      total = matches.length;
      items = matches.slice((page - 1) * pageSize, page * pageSize);
    }

    // Attach a lightweight shipment summary to each order on this page so the
    // list can render quick actions (print label, track, mark shipped/delivered)
    // without a per-row fetch. Shipments link to a storefront order either via
    // the `storefrontOrderId` column (manual label buy) or the notes prefix
    // (auto-shipping / mark-shipped). We match on both.
    const pageOrderIds = items.map((o) => o.id);
    const itemsWithShipment = await attachShipments(items, pageOrderIds);

    return NextResponse.json({
      items: itemsWithShipment,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sortBy: sortByParam in SORTABLE_COLUMNS ? sortByParam : 'createdAt',
      sortDir,
    });
  } catch (error) {
    console.error('[admin/orders/storefront GET]', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

type ListItem = { id: string };

async function attachShipments<T extends ListItem>(items: T[], orderIds: string[]) {
  if (orderIds.length === 0) return items.map((o) => ({ ...o, shipment: null }));

  const shipments = await prisma.shipment.findMany({
    where: {
      OR: [
        { storefrontOrderId: { in: orderIds } },
        ...orderIds.map((oid) => ({ notes: { contains: `${STOREFRONT_ORDER_NOTE_PREFIX}${oid}` } })),
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      shipmentId: true,
      status: true,
      carrier: true,
      trackingNumber: true,
      labelData: true,
      labelUrl: true,
      shippedAt: true,
      actualDelivery: true,
      estimatedDelivery: true,
      storefrontOrderId: true,
      notes: true,
    },
  }).catch(() => []);

  // Map each shipment back to its order id. Prefer the most recent (already
  // sorted desc) so the first match per order wins.
  const byOrderId = new Map<string, (typeof shipments)[number]>();
  for (const s of shipments) {
    let oid = s.storefrontOrderId || null;
    if (!oid && s.notes) {
      const idx = s.notes.indexOf(STOREFRONT_ORDER_NOTE_PREFIX);
      if (idx >= 0) oid = s.notes.slice(idx + STOREFRONT_ORDER_NOTE_PREFIX.length).split(/\s/)[0];
    }
    if (oid && !byOrderId.has(oid)) byOrderId.set(oid, s);
  }

  return items.map((o) => {
    const s = byOrderId.get(o.id);
    return {
      ...o,
      shipment: s
        ? {
            id: s.id,
            shipmentId: s.shipmentId,
            status: s.status,
            carrier: s.carrier,
            trackingNumber: s.trackingNumber,
            hasLabel: Boolean(s.labelData) || Boolean(s.labelUrl),
            labelUrl: s.labelUrl,
            shippedAt: s.shippedAt,
            actualDelivery: s.actualDelivery,
            estimatedDelivery: s.estimatedDelivery,
          }
        : null,
    };
  });
}
