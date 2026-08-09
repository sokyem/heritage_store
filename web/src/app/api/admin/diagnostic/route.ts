import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// GET /api/admin/diagnostic
//
// Admin-only diagnostic endpoint that reports row counts and a sample
// from every major admin-facing table. Use when the admin UI shows
// "empty data" so we can tell whether the database is genuinely empty
// or queries are being filtered/truncated by client code.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const safeCount = async (label: string, p: Promise<number>): Promise<number | string> => {
    try {
      return await p;
    } catch (err) {
      return `ERROR: ${(err as Error).message || 'unknown'}`;
    }
  };

  const safeOne = async <T,>(label: string, p: Promise<T | null>): Promise<unknown> => {
    try {
      return await p;
    } catch (err) {
      return `ERROR: ${(err as Error).message || 'unknown'}`;
    }
  };

  const [
    storefrontOrderCount,
    studioOrderCount,
    customOrderCount,
    rentalOrderCount,
    clientCount,
    userCount,
    paymentRecordCount,
    paymentCount,
    consultationCount,
    adminConsultationCount,
    consultationBookingCount,
    designerCount,
    inventoryCount,
    productCount,
    adminProductCount,
    shipmentCount,
    returnRequestCount,
    quoteCount,
    discountCount,
    notificationCount,
    conversationCount,
    messageCount,
    auditLogCount,
  ] = await Promise.all([
    safeCount('order', prisma.order.count()),
    safeCount('adminOrder', prisma.adminOrder.count()),
    safeCount('customOrder', prisma.customOrder.count()),
    safeCount('rentalOrder', prisma.rentalOrder.count()),
    safeCount('client', prisma.client.count()),
    safeCount('user', prisma.user.count()),
    safeCount('paymentRecord', prisma.paymentRecord.count()),
    safeCount('payment', prisma.payment.count()),
    safeCount('consultation', prisma.consultation.count()),
    safeCount('adminConsultation', prisma.adminConsultation.count()),
    safeCount('consultationBooking', prisma.consultationBooking.count()),
    safeCount('partnerDesigner', prisma.partnerDesigner.count()),
    safeCount('fabricInventory', prisma.fabricInventory.count()),
    safeCount('product', prisma.product.count()),
    safeCount('adminProduct', prisma.adminProduct.count()),
    safeCount('shipment', prisma.shipment.count()),
    safeCount('returnRequest', prisma.returnRequest.count()),
    safeCount('quote', prisma.quote.count()),
    safeCount('discount', prisma.discount.count()),
    safeCount('notification', prisma.notification.count()),
    safeCount('conversation', prisma.conversation.count()),
    safeCount('message', prisma.message.count()),
    safeCount('auditLog', prisma.auditLog.count()),
  ]);

  // Sample one row of the tables the user said are empty so we can see
  // what they actually look like.
  const [sampleStorefrontOrder, sampleStudioOrder, sampleClient, samplePaymentRecord] = await Promise.all([
    safeOne('storefront order', prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, amount: true, createdAt: true, userId: true },
    })),
    safeOne('studio order', prisma.adminOrder.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, orderId: true, status: true, totalPrice: true, createdAt: true },
    })),
    safeOne('client', prisma.client.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, clientId: true, name: true, createdAt: true },
    })),
    safeOne('payment record', prisma.paymentRecord.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, paymentId: true, amount: true, createdAt: true },
    })),
  ]);

  // Simulate exactly what the paginated list endpoints would return on
  // page 1. This lets us see whether the API and the page are out of sync.
  const probeClients = await prisma.client.findMany({
    orderBy: { clientId: 'asc' },
    skip: 0,
    take: 25,
    include: { _count: { select: { orders: true } } },
  }).catch((err) => ({ error: (err as Error).message } as unknown as never));

  const probeStorefront = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    skip: 0,
    take: 25,
    include: {
      user: { select: { id: true, email: true, name: true } },
      product: { select: { id: true, name: true, price: true, image: true } },
      payment: {
        select: { id: true, status: true, amount: true, paymentMethod: true, last4: true, brand: true, receipt_url: true },
      },
    },
  }).catch((err) => ({ error: (err as Error).message } as unknown as never));

  return NextResponse.json({
    asOf: new Date().toISOString(),
    requestedBy: auth.email,
    probe: {
      clientsPage1: {
        kind: Array.isArray(probeClients) ? 'array' : 'error',
        length: Array.isArray(probeClients) ? probeClients.length : null,
        first: Array.isArray(probeClients) ? probeClients[0] : probeClients,
      },
      storefrontPage1: {
        kind: Array.isArray(probeStorefront) ? 'array' : 'error',
        length: Array.isArray(probeStorefront) ? probeStorefront.length : null,
        firstId: Array.isArray(probeStorefront) && probeStorefront[0] ? probeStorefront[0].id : probeStorefront,
      },
    },
    counts: {
      // Tables backing each admin page
      storefrontOrders: storefrontOrderCount,
      studioOrders: studioOrderCount,
      customOrders: customOrderCount,
      rentalOrders: rentalOrderCount,
      clients: clientCount,
      users: userCount,
      paymentRecords: paymentRecordCount,
      payments: paymentCount,
      consultations: consultationCount,
      adminConsultations: adminConsultationCount,
      consultationBookings: consultationBookingCount,
      designers: designerCount,
      inventory: inventoryCount,
      products: productCount,
      adminProducts: adminProductCount,
      shipments: shipmentCount,
      returnRequests: returnRequestCount,
      quotes: quoteCount,
      discounts: discountCount,
      notifications: notificationCount,
      conversations: conversationCount,
      messages: messageCount,
      auditLogEntries: auditLogCount,
    },
    samples: {
      latestStorefrontOrder: sampleStorefrontOrder,
      latestStudioOrder: sampleStudioOrder,
      latestClient: sampleClient,
      latestPaymentRecord: samplePaymentRecord,
    },
    env: {
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
      databaseUrlHost: process.env.DATABASE_URL
        ? (process.env.DATABASE_URL.match(/@([^/:]+)/)?.[1] || 'unknown')
        : null,
      nodeEnv: process.env.NODE_ENV || null,
    },
  });
}
