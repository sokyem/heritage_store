import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getSetting } from '@/lib/settings';

async function enrichImage(product: { name: string; image?: string | null } | null) {
  if (!product || product.image) return product?.image ?? null;

  // Try several name-matching strategies to find a matching AdminProduct.
  // Order names sometimes use longer marketing phrases than the catalog,
  // so a single `contains` against `product.name` can miss the catalog row.
  const tryParse = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
      return null;
    } catch {
      return typeof raw === 'string' && raw.startsWith('/') ? raw : null;
    }
  };

  try {
    // 1. Exact (case-insensitive) name match.
    let ap = await prisma.adminProduct.findFirst({
      where: { name: { equals: product.name, mode: 'insensitive' } },
      select: { images: true },
    });

    // 2. AdminProduct.name contains the order's product name.
    if (!ap) {
      ap = await prisma.adminProduct.findFirst({
        where: { name: { contains: product.name, mode: 'insensitive' } },
        select: { images: true },
      });
    }

    // 3. Significant token from the order's product name appears in an AdminProduct.name.
    if (!ap) {
      const tokens = product.name
        .split(/\s+/)
        .filter((t) => t.length >= 4)
        .slice(0, 4);
      for (const token of tokens) {
        ap = await prisma.adminProduct.findFirst({
          where: { name: { contains: token, mode: 'insensitive' } },
          select: { images: true },
        });
        if (ap) break;
      }
    }

    return tryParse(ap?.images ?? null);
  } catch {
    return null;
  }
}

const ELEVATED_ROLES = new Set(['founder', 'staff', 'designer']);

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || '';
}


// GET /api/orders/[id] - Fetch a single order
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const actualParams = await params;
    const guestEmail = request.nextUrl.searchParams.get('guestEmail');
    const order = await prisma.order.findUnique({
      where: { id: actualParams.id },
      include: {
        user: true,
        product: true,
        payment: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const sessionEmail = normalizeEmail(session?.user?.email);
    const orderEmail = normalizeEmail(order.user?.email);
    const role = (session?.user as { role?: string } | undefined)?.role;
    const guestMatches = normalizeEmail(guestEmail) && normalizeEmail(guestEmail) === orderEmail;
    const sessionAllowed = Boolean(sessionEmail) && (sessionEmail === orderEmail || ELEVATED_ROLES.has(role || ''));

    if (!sessionAllowed && !guestMatches) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const business = await getSetting('business').catch(() => null);
    const taxRate = Math.max(0, Math.min(100, business?.taxRate || 0));

    return NextResponse.json({
      id: order.id,
      status: order.status,
      amount: order.amount,
      tax: order.tax,
      taxRate,
      currency: order.currency,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customNotes: order.customNotes,
      product: order.product ? { ...order.product, image: await enrichImage(order.product) } : null,
      payment: order.payment,
      shipping: {
        name: order.shippingName,
        address: order.shippingAddress,
        address2: order.shippingAddress2,
        city: order.shippingCity,
        state: order.shippingState,
        zip: order.shippingZip,
        country: order.shippingCountry,
        phone: order.shippingPhone,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }
}

// PUT /api/orders/[id] - Update order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const actualParams = await params;
    const body = await request.json();
    const { status, designer } = body;

    const existingOrder = await prisma.order.findUnique({
      where: { id: actualParams.id },
      include: { user: true },
    });

    if (!existingOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const sessionEmail = normalizeEmail(session.user.email);
    const orderEmail = normalizeEmail(existingOrder.user?.email);
    const role = (session.user as { role?: string } | undefined)?.role;
    const allowed = sessionEmail === orderEmail || ELEVATED_ROLES.has(role || '');

    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (designer) data.customNotes = designer;

    // Shipping address fields
    if (body.shippingName !== undefined) data.shippingName = body.shippingName;
    if (body.shippingAddress !== undefined) data.shippingAddress = body.shippingAddress;
    if (body.shippingAddress2 !== undefined) data.shippingAddress2 = body.shippingAddress2;
    if (body.shippingCity !== undefined) data.shippingCity = body.shippingCity;
    if (body.shippingState !== undefined) data.shippingState = body.shippingState;
    if (body.shippingZip !== undefined) data.shippingZip = body.shippingZip;
    if (body.shippingCountry !== undefined) data.shippingCountry = body.shippingCountry;
    if (body.shippingPhone !== undefined) data.shippingPhone = body.shippingPhone;

    // Selected shipping rate (carrier + service + cost) — chosen on the
    // checkout Payment step before payment is taken.
    if (body.shippingCost !== undefined) data.shippingCost = body.shippingCost;
    if (body.shippingService !== undefined) data.shippingService = body.shippingService;
    if (body.shippingCarrier !== undefined) data.shippingCarrier = body.shippingCarrier;

    const order = await prisma.order.update({
      where: { id: actualParams.id },
      data,
      include: {
        user: true,
        product: true,
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
