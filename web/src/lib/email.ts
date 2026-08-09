import sgMail from '@sendgrid/mail';
import { renderEmailTemplate } from './email-templates';
import { getSetting } from './settings';
import { threadReplyTo } from './inbound';

// Initialize SendGrid client
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'AWULA K <info@awulak.com>';
// Reply-To = where customer replies go. Falls back to FROM if not set.
const REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL || '';
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY);
}

/**
 * Send an email rendered from the admin-editable template registry.
 * Honors the `notifications` settings: if the corresponding toggle is
 * off, the email is skipped (returns true so callers don't treat it
 * as an error).
 */
export async function sendTemplate(
  templateKey: string,
  to: string,
  variables: Record<string, string | number | undefined | null> = {},
  options: {
    notificationToggle?: 'emailOrderConfirm' | 'emailPaymentReceived' | 'emailConsultationReminder' | 'emailFittingReminder';
    // Per-thread Reply-To override (e.g. order_<id>@reply.awulak.com) so the
    // customer's reply routes back into this thread. Falls back to REPLY_TO_EMAIL.
    replyTo?: string;
  } = {},
): Promise<boolean> {
  // Respect admin notification toggles.
  if (options.notificationToggle) {
    try {
      const n = await getSetting('notifications');
      if (!n[options.notificationToggle]) return true;
    } catch {}
  }

  let siteName = 'AWULA K';
  try {
    const g = await getSetting('general');
    siteName = g.siteName || siteName;
  } catch {}

  const rendered = await renderEmailTemplate(templateKey, { siteName, appUrl: APP_URL, ...variables });
  if (!rendered) return true; // Disabled or unknown — silently skip.

  if (!process.env.SENDGRID_API_KEY) {
    console.log(`[EMAIL-MOCK] ${templateKey} -> ${to}: ${rendered.subject}`);
    return true;
  }

  try {
    await sgMail.send({
      from: FROM_EMAIL,
      to,
      subject: rendered.subject,
      html: rendered.html,
      // Per-thread Reply-To routes the reply back into this thread; otherwise
      // fall back to the staffed inbox even when FROM is a noreply alias.
      ...(options.replyTo || REPLY_TO_EMAIL ? { replyTo: options.replyTo || REPLY_TO_EMAIL } : {}),
      // Disable SendGrid click/open tracking: it rewrites links through a
      // branded redirect subdomain (url###.awulak.com) that has no valid SSL
      // cert, so password-reset and order links showed "connection not secure".
      // With tracking off, links point straight to awulak.com (valid cert).
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
        openTracking: { enable: false },
      },
    });
    return true;
  } catch (error) {
    console.error(`Failed to send ${templateKey} email:`, error);
    return false;
  }
}

const ADMIN_ALERT_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'awulak.ent@gmail.com';

/**
 * Send a plain (non-template) internal alert email — for admin notifications
 * that have no editable customer template (e.g. a new consultation booking).
 * Defaults to the configured admin address. No-ops (logs) when email isn't
 * configured, and never throws.
 */
export async function sendAdminEmail(subject: string, html: string, to: string = ADMIN_ALERT_EMAIL): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log(`[EMAIL-MOCK] admin-alert -> ${to}: ${subject}`);
    return true;
  }
  try {
    await sgMail.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      ...(REPLY_TO_EMAIL ? { replyTo: REPLY_TO_EMAIL } : {}),
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
        openTracking: { enable: false },
      },
    });
    return true;
  } catch (error) {
    console.error('Failed to send admin alert email:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, token: string, name?: string): Promise<boolean> {
  const resetUrl = `${APP_URL}/auth/reset-password?token=${token}`;
  return sendTemplate('password_reset', email, { name: name || 'there', resetUrl });
}

/**
 * Send the consultation booking confirmation. Used by both the free-booking
 * path (/api/consultations/book) and the Stripe webhook (after a paid
 * consultation's payment succeeds), so the customer always gets a confirmation
 * regardless of which flow created the booking.
 */
export async function sendConsultationConfirmationEmail(params: {
  to: string;
  name?: string | null;
  date: Date;
  time: string;
  type: string;
  duration: number;
  bookingRef: string;
  meetingLink?: string | null;
}): Promise<boolean> {
  const meetingUrl = params.meetingLink
    ? (params.meetingLink.startsWith('http') ? params.meetingLink : `${APP_URL}${params.meetingLink}`)
    : `${APP_URL}/dashboard`;
  return sendTemplate(
    'consultation_confirmation',
    params.to,
    {
      name: params.name || 'there',
      date: params.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      time: params.time,
      type: params.type,
      duration: params.duration,
      bookingRef: params.bookingRef,
      meetingUrl,
    },
    { notificationToggle: 'emailConsultationReminder' },
  );
}

export async function sendOrderConfirmationEmail(email: string, orderData: {
  orderId: string;
  productName: string;
  amount: number;
  name?: string;
  productImage?: string;
  selectedColor?: string;
  selectedSize?: string;
  quantity?: number;
}): Promise<boolean> {
  return sendTemplate(
    'order_confirmation',
    email,
    {
      name: orderData.name || 'there',
      orderId: orderData.orderId,
      productName: orderData.productName,
      amount: orderData.amount.toFixed(2),
      orderUrl: `${APP_URL}/orders`,
      productImage: orderData.productImage || '',
      selectedColor: orderData.selectedColor || '',
      selectedSize: orderData.selectedSize || '',
      quantity: orderData.quantity && orderData.quantity > 1 ? String(orderData.quantity) : '',
    },
    { notificationToggle: 'emailOrderConfirm' },
  );
}

/**
 * Send a freeform message from admin to a customer, scoped to an order.
 * `orderIdFull` (the DB id) drives the per-thread Reply-To so the customer's
 * reply routes back to this order; `orderId` is the short display code.
 */
export async function sendOrderMessage(email: string, data: {
  name: string;
  orderId: string;
  message: string;
  orderIdFull?: string;
}): Promise<boolean> {
  return sendTemplate(
    'order_message',
    email,
    {
      name: data.name,
      orderId: data.orderId,
      message: data.message,
      orderUrl: `${APP_URL}/customer/dashboard`,
    },
    { replyTo: data.orderIdFull ? threadReplyTo('order', data.orderIdFull) : undefined },
  );
}
