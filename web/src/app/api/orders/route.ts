import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { abandonStalePendingOrders } from '@/lib/orders';

const ELEVATED_ROLES = new Set(['founder', 'staff', 'designer']);

// GET /api/orders - Get all orders (for authenticated user)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const role = (session.user as { role?: string } | undefined)?.role;

    const where = ELEVATED_ROLES.has(role || '')
      ? {}
      : { user: { email: session.user.email } };

    const orders = await prisma.order.findMany({
      where,
      include: {
        user: true,
        product: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Storefront Shipments don't FK to Order — auto-shipping links them by
    // writing `STOREFRONT_ORDER:<orderId>` into `Shipment.notes`. Pull the
    // matching shipments in one query and attach them so the customer
    // dashboard can show tracking without a second round-trip per order.
    const orderIds = orders.map((o) => o.id);
    const shipments = orderIds.length
      ? await prisma.shipment.findMany({
          where: {
            OR: orderIds.map((id) => ({ notes: { contains: `STOREFRONT_ORDER:${id}` } })),
          },
          select: {
            id: true,
            shipmentId: true,
            trackingNumber: true,
            carrier: true,
            status: true,
            shippedAt: true,
            notes: true,
          },
        })
      : [];

    const shipmentByOrder = new Map<string, (typeof shipments)[number]>();
    for (const s of shipments) {
      const match = s.notes?.match(/STOREFRONT_ORDER:([A-Za-z0-9_-]+)/);
      if (match) shipmentByOrder.set(match[1], s);
    }

    const enriched = orders.map((o) => {
      const s = shipmentByOrder.get(o.id) ?? null;
      return {
        ...o,
        shipment: s
          ? {
              id: s.id,
              shipmentId: s.shipmentId,
              trackingNumber: s.trackingNumber,
              carrier: s.carrier,
              status: s.status,
              shippedAt: s.shippedAt,
            }
          : null,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

// POST /api/orders - Create new order (supports signed-in users and guest checkout)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const { productId, productName, amount, customNotes, guestEmail, guestName, customizationFee } = body;

    let user;

    if (session?.user?.email) {
      // Signed-in user
      user = await prisma.user.findUnique({ where: { email: session.user.email } });
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    } else if (guestEmail) {
      // Guest checkout — find or create a guest user
      user = await prisma.user.findUnique({ where: { email: guestEmail } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: guestEmail,
            name: guestName || 'Guest',
            role: 'customer',
            // No password — guest account, can be claimed later via signup
          },
        });
      }
    } else {
      return NextResponse.json({ error: 'Sign in or provide an email to checkout' }, { status: 401 });
    }

    let product;
    // When we mint a fresh Product row, its price is set from the cart subtotal
    // which ALREADY includes the personalisation surcharge — so we must not add
    // the fee again below. For an existing Product (catalog unit price), we do.
    let createdNewProduct = false;

    if (productId) {
      // Use existing product
      product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
    } else if (productName && amount) {
      // Find or create product by name (for catalog items not yet in DB)
      product = await prisma.product.findFirst({
        where: { name: productName },
      });
      if (!product) {
        createdNewProduct = true;
        // The Product row is SHARED across every order of this item, so its
        // description must describe the product — never one order's cart
        // summary (that would freeze every order to the first buyer's
        // variant). Per-order details, incl. colour/size, live in customNotes.
        const adminProduct = await prisma.adminProduct.findFirst({
          where: { name: productName },
          orderBy: { updatedAt: 'desc' },
        });
        product = await prisma.product.create({
          data: {
            name: productName,
            price: parseFloat(amount),
            description: adminProduct?.description || productName,
          },
        });
      }
    } else {
      return NextResponse.json({ error: 'productId or productName + amount required' }, { status: 400 });
    }

    // Personalisation surcharge: add it only when the Product price is the bare
    // catalog price (existing row). Freshly-created rows already bake it in.
    const fee = Math.max(0, parseFloat(String(customizationFee ?? 0)) || 0);
    const orderAmount = createdNewProduct ? product.price : product.price + fee;

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        productId: product.id,
        customNotes: customNotes || null,
        amount: orderAmount,
        currency: 'USD',
      },
      include: {
        user: true,
        product: true,
        payment: true,
      },
    });

    // Keep at most one live pending order per customer (their current cart):
    // mark any earlier never-paid checkout attempts as abandoned.
    await abandonStalePendingOrders(user.id, order.id);

    return NextResponse.json(order);
  } catch (error) {
    console.error('Failed to create order:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
