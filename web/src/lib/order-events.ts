/**
 * Order lifecycle event handlers.
 *
 * Centralized so that every place an order changes status (Stripe webhook,
 * admin mark-shipped, manual admin update) emits the same notifications +
 * emails. No more "the founder didn't know an order was placed".
 */

import prisma from '@/lib/prisma';
import { sendTemplate } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { carrierTrackingUrl } from '@/lib/carrier-tracking';

const APP_URL = process.env.NEXTAUTH_URL || 'https://www.awulak.com';
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'awulak.ent@gmail.com';
const ADMIN_ALERT_PHONE = process.env.ADMIN_ALERT_PHONE || '';

interface NotifyOrderPlacedInput {
  orderId: string;
}

/**
 * Fire when a storefront Order is paid (Stripe webhook).
 *
 * Side effects:
 *   1. Customer gets "order_confirmation" email
 *   2. Every admin user (role: founder, staff) gets an in-app notification
 *   3. The configured admin email gets a "new order" alert
 *
 * Idempotency: We tag the notification with the orderId so a re-run won't
 * create duplicate alerts. (Stripe retries can fire this multiple times.)
 */
export async function notifyOrderPlaced({ orderId }: NotifyOrderPlacedInput) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      product: { select: { name: true, price: true, image: true } },
      payment: { select: { amount: true, status: true } },
    },
  });

  // Fetch AdminProduct image if not on the legacy product record.
  let adminProductImage: string | null = null;
  if (order?.adminProductId) {
    const ap = await prisma.adminProduct.findUnique({
      where: { id: order.adminProductId },
      select: { images: true },
    });
    if (ap) {
      adminProductImage = (() => { try { const a = JSON.parse(ap.images || '[]'); return Array.isArray(a) && a[0] ? a[0] : null; } catch { return null; } })();
    }
  }

  if (!order) {
    console.warn(`[order-events] notifyOrderPlaced: order ${orderId} not found`);
    return;
  }

  const customerEmail = order.user?.email || order.shippingName || 'guest@unknown';
  const customerName = order.user?.name || order.shippingName || 'Customer';
  // Fall back through every place the order total can live so the
  // confirmation email never shows $0.00 (e.g. an admin-created order with
  // no `amount` column will still surface the actual Stripe charge).
  const amount = (order.amount ?? order.payment?.amount ?? order.product?.price ?? 0).toFixed(2);
  // Public, no-login-required order page so guests can open the email link
  // without bouncing off the customer dashboard sign-in screen.
  const customerOrderUrl = `${APP_URL}/checkout/confirmation?orderId=${order.id}`;

  // ─── 1. Customer confirmation email ─────────────────────────
  if (order.user?.email) {
    try {
      await sendTemplate(
        'order_confirmation',
        order.user.email,
        {
          name: customerName,
          orderId: order.id.slice(-8).toUpperCase(),
          productName: order.product?.name || 'Your order',
          amount,
          orderUrl: customerOrderUrl,
          productImage: adminProductImage || order.product?.image || '',
          selectedColor: order.selectedColor || '',
          selectedSize: order.selectedSize || '',
          quantity: order.quantity > 1 ? String(order.quantity) : '',
        },
        { notificationToggle: 'emailOrderConfirm' },
      );
    } catch (err) {
      console.error('[order-events] failed to send customer confirmation:', err);
    }
  }

  // ─── 2. In-app notifications for every admin ────────────────
  const admins = await prisma.user.findMany({
    where: { role: { in: ['founder', 'staff'] } },
    select: { id: true },
  });

  // Dedupe: if any admin already has a notification for this order, skip all.
  const existing = await prisma.notification.findFirst({
    where: { type: 'new_storefront_order', relatedId: orderId },
    select: { id: true },
  });

  if (!existing && admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: 'new_storefront_order',
        title: `New order — $${amount}`,
        message: `${customerName} (${customerEmail}) just placed an order for ${order.product?.name || 'a product'}.`,
        relatedId: orderId,
      })),
    });
    console.log(`[order-events] created ${admins.length} admin notifications for order ${orderId}`);
  }

  // ─── 3. Founder email alert ─────────────────────────────────
  // Send a single alert email to the configured admin address.
  try {
    await sendTemplate(
      'new_order_admin',
      ADMIN_NOTIFICATION_EMAIL,
      {
        name: 'Founder',
        orderId: order.id.slice(-8).toUpperCase(),
        productName: order.product?.name || 'A product',
        amount,
        customerName,
        customerEmail,
        orderUrl: `${APP_URL}/admin/orders/storefront/${orderId}`,
      },
    );
  } catch (err) {
    console.error('[order-events] failed to send admin alert:', err);
  }

  // ─── 4. Founder SMS alert ───────────────────────────────────
  // In-app + email already fired above; add a text so a new order is noticed
  // off-screen too. No-op if ADMIN_ALERT_PHONE / Twilio aren't set.
  if (ADMIN_ALERT_PHONE) {
    try {
      await sendSMS(
        ADMIN_ALERT_PHONE,
        `New AWULA K order ${order.id.slice(-8).toUpperCase()} — ${order.product?.name || 'product'} ($${amount}) from ${customerName}. ${APP_URL}/admin/orders/storefront/${orderId}`,
      );
    } catch (err) {
      console.error('[order-events] failed to send admin SMS:', err);
    }
  }
}

/**
 * Fire when an order is marked shipped by an admin (or auto-advanced from a
 * carrier webhook / tracking poll).
 *
 * Side effects:
 *   1. Order.status → 'shipped' (idempotent: skips if already shipped/delivered/cancelled/refunded)
 *   2. Customer gets "shipping_update" email with tracking info
 *   3. In-app notification created
 *
 * The idempotency guard is what keeps repeated tracker events (picked_up →
 * in_transit → out_for_delivery, all firing this helper) from spamming the
 * customer or downgrading a delivered order.
 */
export async function notifyOrderShipped(
  orderId: string,
  { trackingNumber, carrier }: { trackingNumber?: string | null; carrier?: string | null } = {},
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { email: true, name: true } },
      product: { select: { name: true } },
    },
  });

  if (!order) {
    console.warn(`[order-events] notifyOrderShipped: order ${orderId} not found`);
    return;
  }

  // Idempotency — don't downgrade a delivered order or re-spam shipped customers
  if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status)) {
    return;
  }

  // Advance order status so the admin Storefront Orders table reflects reality
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'shipped' },
  });

  if (order.user?.email) {
    try {
      const trackingUrl = carrierTrackingUrl(carrier || 'UPS', trackingNumber) || '';
      await sendTemplate(
        'shipping_update',
        order.user.email,
        {
          name: order.user.name || 'Customer',
          orderId: order.id.slice(-8).toUpperCase(),
          productName: order.product?.name || 'Your order',
          trackingNumber: trackingNumber || 'Pending',
          trackingUrl,
          carrier: carrier || 'UPS',
          orderUrl: `${APP_URL}/checkout/confirmation?orderId=${order.id}`,
        },
      );
    } catch (err) {
      console.error('[order-events] failed to send shipping email:', err);
    }
  }

  // Also notify the customer in-app if they have an account
  if (order.userId) {
    await prisma.notification.create({
      data: {
        userId: order.userId,
        type: 'shipment_status_changed',
        title: 'Your order has shipped',
        message: `Your order for ${order.product?.name || 'your purchase'} is on the way.${trackingNumber ? ` Tracking: ${trackingNumber}` : ''}`,
        relatedId: orderId,
      },
    }).catch((err) => console.error('[order-events] customer notification failed:', err));
  }
}

/**
 * Fire when a carrier (UPS/USPS) webhook confirms the order arrived at
 * the customer's address. Called from updateShipmentStatus() when status
 * flips to 'delivered'.
 *
 * Idempotent: if order.status is already 'delivered' we skip everything,
 * so re-fired webhook events don't spam the customer.
 */
export async function notifyOrderDelivered(
  orderId: string,
  { trackingNumber, carrier, deliveredAt }: { trackingNumber?: string | null; carrier?: string | null; deliveredAt?: Date | null } = {},
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      product: { select: { name: true } },
    },
  });

  if (!order) {
    console.warn(`[order-events] notifyOrderDelivered: order ${orderId} not found`);
    return;
  }

  // Idempotency — don't re-process or re-email if already marked delivered
  if (order.status === 'delivered') {
    console.log(`[order-events] order ${orderId} already delivered — skipping`);
    return;
  }

  // Advance order status
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'delivered' },
  });

  // Build a friendly "delivered today at 3:42 PM" phrase, or just empty
  let deliveredAtPhrase = '';
  if (deliveredAt) {
    const now = new Date();
    const sameDay = deliveredAt.toDateString() === now.toDateString();
    deliveredAtPhrase = sameDay
      ? ` today at ${deliveredAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : ` on ${deliveredAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
  }

  // Customer email
  if (order.user?.email) {
    try {
      await sendTemplate('order_delivered', order.user.email, {
        name: order.user.name || 'Customer',
        orderId: order.id.slice(-8).toUpperCase(),
        productName: order.product?.name || 'Your order',
        carrier: carrier || 'UPS',
        trackingNumber: trackingNumber || '—',
        deliveredAtPhrase,
        orderUrl: `${APP_URL}/checkout/confirmation?orderId=${order.id}`,
      });
    } catch (err) {
      console.error('[order-events] failed to send delivery email:', err);
    }
  }

  // Customer in-app notification
  if (order.userId) {
    await prisma.notification.create({
      data: {
        userId: order.userId,
        type: 'shipment_delivered',
        title: 'Your order has been delivered',
        message: `${order.product?.name || 'Your purchase'} arrived${deliveredAtPhrase}. We hope you love it.`,
        relatedId: orderId,
      },
    }).catch((err) => console.error('[order-events] customer notification failed:', err));
  }

  console.log(`[order-events] order ${orderId} → delivered, customer notified`);
}
