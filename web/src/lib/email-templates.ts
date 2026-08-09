/**
 * Email template registry.
 *
 * Each template has built-in defaults (the fallback HTML) and an optional
 * admin override stored in the `EmailTemplate` table. Templates support
 * simple `{{variable}}` substitution — no expressions, no logic.
 *
 * To add a new template: add an entry to `BUILTIN_TEMPLATES` below. The
 * admin UI will pick it up automatically once seeded.
 */

import { prisma } from '@/lib/prisma';

export interface BuiltinTemplate {
  key: string;
  name: string;
  description: string;
  subject: string;
  html: string;
  variables: string[];
}

const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

const baseFrame = (body: string) => `
<div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #FAF7F2;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 24px; letter-spacing: 0.15em; color: #1B2A5B; margin: 0;">{{siteName}}</h1>
  </div>
  <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #E5E7EB;">
    ${body}
  </div>
  <p style="font-size: 11px; color: #9CA3AF; text-align: center; margin-top: 24px;">
    {{siteName}} — Luxury African Fashion
  </p>
</div>`;

// Marketing frame: identical look, but the footer carries the unsubscribe
// link required for promotional email (CAN-SPAM / GDPR). Transactional
// templates use baseFrame and must NOT include this.
const marketingFrame = (body: string) => `
<div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #FAF7F2;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 24px; letter-spacing: 0.15em; color: #1B2A5B; margin: 0;">{{siteName}}</h1>
  </div>
  <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #E5E7EB;">
    ${body}
  </div>
  <p style="font-size: 11px; color: #9CA3AF; text-align: center; margin-top: 24px; line-height: 1.6;">
    {{siteName}} — Luxury African Fashion<br/>
    You're receiving this because you signed up or ordered from us.<br/>
    <a href="{{unsubscribeUrl}}" style="color: #9CA3AF; text-decoration: underline;">Unsubscribe</a>
  </p>
</div>`;

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    key: 'test_email',
    name: 'Test email (admin diagnostic)',
    description: 'One-click diagnostic sent from the admin Notifications tab to verify SendGrid is delivering. Never sent to customers.',
    subject: '[{{siteName}}] Test email — {{sentAt}}',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">SendGrid is working ✓</h2>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6; margin: 0 0 16px;">
        If you're reading this, your AWULA K → SendGrid → inbox chain is operational. New-order emails will use the same path.
      </p>
      <div style="background: #FAF7F2; border-radius: 8px; padding: 16px; font-size: 13px; color: #5C3D2E; font-family: monospace;">
        <p style="margin: 0 0 4px;">Sent: {{sentAt}}</p>
        <p style="margin: 0 0 4px;">From: {{fromAddress}}</p>
        <p style="margin: 0;">By: {{triggeredBy}}</p>
      </div>
      <p style="font-size: 12px; color: #9CA3AF; margin-top: 20px; line-height: 1.5;">
        If this email landed in spam, mark it "Not spam" once so future order alerts arrive in the inbox.
      </p>
    `),
    variables: ['siteName', 'sentAt', 'fromAddress', 'triggeredBy'],
  },
  {
    key: 'password_reset',
    name: 'Password reset',
    description: 'Sent when a user clicks "Forgot password" on sign-in.',
    subject: 'Reset your {{siteName}} password',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">Reset your password</h2>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6; margin: 0 0 24px;">
        Hi {{name}}, we received a request to reset your password. Click below to choose a new one. This link expires in 1 hour.
      </p>
      <a href="{{resetUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Reset password
      </a>
      <p style="font-size: 12px; color: #9CA3AF; margin-top: 24px; line-height: 1.5;">
        If you didn't request this, you can safely ignore this email.
      </p>
    `),
    variables: ['siteName', 'name', 'resetUrl'],
  },
  {
    key: 'order_confirmation',
    name: 'Order confirmation',
    description: 'Sent after an order is successfully placed.',
    subject: 'Order confirmed — {{productName}}',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">Thank you for your order</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 20px;">Hi {{name}}, your order is confirmed and we&rsquo;re getting it ready.</p>

      <div style="background: #FAF7F2; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <p style="font-size: 11px; color: #8B7569; margin: 0 0 2px; text-transform: uppercase; letter-spacing: 0.08em;">Order</p>
        <p style="font-size: 14px; color: #1B2A5B; font-weight: 600; margin: 0;">{{orderId}}</p>
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #F0EBE3; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
        <tr>
          {{#if productImage}}<td style="width: 80px; vertical-align: top; padding: 12px;">
            <img src="{{productImage}}" alt="{{productName}}" width="72" height="72" style="width:72px;height:72px;object-fit:cover;border-radius:6px;display:block;" />
          </td>{{/if}}
          <td style="vertical-align: top; padding: 12px;">
            <p style="font-size: 14px; font-weight: 600; color: #1B2A5B; margin: 0 0 6px;">{{productName}}</p>
            {{#if selectedColor}}<p style="font-size: 13px; color: #5C3D2E; margin: 0 0 3px;">Color: <strong>{{selectedColor}}</strong></p>{{/if}}
            {{#if selectedSize}}<p style="font-size: 13px; color: #5C3D2E; margin: 0 0 3px;">Size: <strong>{{selectedSize}}</strong></p>{{/if}}
            {{#if quantity}}<p style="font-size: 13px; color: #5C3D2E; margin: 0;">Qty: <strong>{{quantity}}</strong></p>{{/if}}
          </td>
          <td align="right" style="vertical-align: top; padding: 12px; white-space: nowrap;">
            <p style="font-size: 15px; font-weight: 700; color: #1B2A5B; margin: 0;">\${{amount}}</p>
          </td>
        </tr>
      </table>

      <a href="{{orderUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        View your order
      </a>
    `),
    variables: ['siteName', 'name', 'orderId', 'productName', 'amount', 'orderUrl', 'productImage', 'selectedColor', 'selectedSize', 'quantity'],
  },
  {
    key: 'order_message',
    name: 'Message to customer (order)',
    description: 'Sent when an admin sends a custom message about an order.',
    subject: 'Message about your order {{orderId}} — AWULA K',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">A message from AWULA K</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 4px;">Hi {{name}},</p>
      <p style="font-size: 12px; color: #8B7569; margin: 0 0 16px;">Regarding your order <strong style="color:#1B2A5B;">{{orderId}}</strong></p>
      <div style="background: #FAF7F2; border-left: 3px solid #1B2A5B; border-radius: 0 8px 8px 0; padding: 16px 20px; margin-bottom: 24px;">
        <p style="font-size: 15px; color: #1B2A5B; line-height: 1.7; margin: 0; white-space: pre-wrap;">{{message}}</p>
      </div>
      <a href="{{orderUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        View your order
      </a>
      <p style="font-size: 12px; color: #9CA3AF; margin-top: 20px;">You can reply directly to this email and we'll get back to you.</p>
    `),
    variables: ['siteName', 'name', 'orderId', 'message', 'orderUrl'],
  },
  {
    key: 'customer_message',
    name: 'Message to customer (general)',
    description: 'Sent when an admin starts a new conversation with a customer from the inbox.',
    subject: 'A message from AWULA K',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">A message from AWULA K</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px;">Hi {{name}},</p>
      <div style="background: #FAF7F2; border-left: 3px solid #1B2A5B; border-radius: 0 8px 8px 0; padding: 16px 20px; margin-bottom: 24px;">
        <p style="font-size: 15px; color: #1B2A5B; line-height: 1.7; margin: 0; white-space: pre-wrap;">{{message}}</p>
      </div>
      <p style="font-size: 12px; color: #9CA3AF; margin-top: 20px;">You can reply directly to this email and we'll get back to you.</p>
    `),
    variables: ['siteName', 'name', 'message'],
  },
  {
    key: 'payment_received',
    name: 'Payment received',
    description: 'Sent when payment for an order/deposit is captured.',
    subject: 'Payment received — {{orderId}}',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">Payment received</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px;">
        Hi {{name}}, we've received your payment of <strong>\${{amount}}</strong> for order <strong>{{orderId}}</strong>.
      </p>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6;">
        We'll keep you updated as production progresses.
      </p>
    `),
    variables: ['siteName', 'name', 'orderId', 'amount'],
  },
  {
    key: 'consultation_confirmation',
    name: 'Consultation confirmation',
    description: 'Sent immediately when a customer books a consultation slot.',
    subject: 'Consultation confirmed — {{date}} at {{time}}',
    html: baseFrame(`
      <div style="text-align: center; margin-bottom: 8px;">
        <span style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 50%; background: #2D8E5A; color: white; font-size: 24px;">✓</span>
      </div>
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px; text-align: center;">Your consultation is booked</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px; text-align: center;">
        Hi {{name}}, we've reserved your spot. Here are the details:
      </p>
      <div style="background: #FAF7F2; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">DATE &amp; TIME</p>
        <p style="font-size: 15px; color: #1B2A5B; font-weight: 600; margin: 0 0 12px;">{{date}} at {{time}}</p>
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">TYPE</p>
        <p style="font-size: 14px; color: #1B2A5B; margin: 0 0 12px;">{{type}} &middot; {{duration}} min</p>
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">BOOKING REFERENCE</p>
        <p style="font-size: 14px; color: #1B2A5B; margin: 0;">{{bookingRef}}</p>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{{meetingUrl}}" style="display: inline-block; background: #C41E3A; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Join your video consultation
        </a>
      </div>
      <p style="font-size: 12px; color: #9CA3AF; text-align: center; line-height: 1.5;">
        Save this email — the button above is your link to the video room. We'll also send you a reminder before the session.
      </p>
    `),
    variables: ['siteName', 'name', 'date', 'time', 'type', 'duration', 'bookingRef', 'meetingUrl'],
  },
  {
    key: 'consultation_reminder',
    name: 'Consultation reminder',
    description: 'Sent 24h before a scheduled consultation.',
    subject: 'Reminder: your consultation on {{date}}',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">Looking forward to seeing you</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px;">
        Hi {{name}}, this is a reminder of your consultation with {{designer}} on <strong>{{date}}</strong> at <strong>{{time}}</strong>.
      </p>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6;">
        Location / link: {{location}}
      </p>
      <a href="{{manageUrl}}" style="display: inline-block; margin-top: 20px; background: #1B2A5B; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Manage booking
      </a>
    `),
    variables: ['siteName', 'name', 'designer', 'date', 'time', 'location', 'manageUrl'],
  },
  {
    key: 'fitting_reminder',
    name: 'Fitting reminder',
    description: 'Sent 24h before a fitting appointment.',
    subject: 'Reminder: your fitting on {{date}}',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">Fitting reminder</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px;">
        Hi {{name}}, your fitting is scheduled for <strong>{{date}}</strong> at <strong>{{time}}</strong>.
      </p>
    `),
    variables: ['siteName', 'name', 'date', 'time'],
  },
  {
    key: 'shipping_update',
    name: 'Shipping update',
    description: 'Sent when an order ships or tracking updates.',
    subject: 'Shipping update for {{orderId}}',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">Your order is on its way</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px;">
        Hi {{name}}, order <strong>{{orderId}}</strong> shipped via {{carrier}}.
      </p>
      <p style="font-size: 14px; color: #8B7569;">
        Tracking:
        <a href="{{trackingUrl}}" style="color: #1B2A5B; font-weight: 600; text-decoration: underline;">{{trackingNumber}}</a>
      </p>
      <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; background: #1B2A5B; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Track shipment
      </a>
    `),
    variables: ['siteName', 'name', 'orderId', 'carrier', 'trackingNumber', 'trackingUrl'],
  },
  {
    key: 'welcome',
    name: 'Welcome',
    description: 'Sent after a new customer signs up.',
    subject: 'Welcome to {{siteName}}',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">Welcome, {{name}}</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px;">
        Thanks for joining {{siteName}}. Discover bespoke African couture, ready-to-wear, and luxury accessories crafted with heritage in mind.
      </p>
      <a href="{{shopUrl}}" style="display: inline-block; margin-top: 12px; background: #1B2A5B; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Start shopping
      </a>
    `),
    variables: ['siteName', 'name', 'shopUrl'],
  },
  {
    key: 'admin_invite',
    name: 'Team invitation',
    description: 'Sent when an admin invites a new staff member.',
    subject: "You're invited to join {{siteName}}",
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">You've been invited</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px;">
        Hi {{name}}, {{inviterName}} has invited you to join {{siteName}} as <strong>{{roleLabel}}</strong>. Click below to accept and set up your account. This link expires in 7 days.
      </p>
      <a href="{{acceptUrl}}" style="display: inline-block; margin-top: 12px; background: #1B2A5B; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Accept invitation
      </a>
    `),
    variables: ['siteName', 'name', 'inviterName', 'roleLabel', 'acceptUrl'],
  },
  {
    key: 'order_delivered',
    name: 'Order delivered',
    description: 'Sent when a shipment is confirmed delivered by the carrier.',
    subject: 'Your order has arrived — {{orderId}}',
    html: baseFrame(`
      <div style="text-align: center; margin-bottom: 8px;">
        <span style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 50%; background: #2D8E5A; color: white; font-size: 24px;">✓</span>
      </div>
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px; text-align: center;">Your order has arrived</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px; text-align: center;">
        Hi {{name}}, your order <strong>{{orderId}}</strong> was delivered{{deliveredAtPhrase}}.
      </p>
      <div style="background: #FAF7F2; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">PRODUCT</p>
        <p style="font-size: 14px; color: #1B2A5B; font-weight: 600; margin: 0 0 12px;">{{productName}}</p>
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">CARRIER · TRACKING</p>
        <p style="font-size: 14px; color: #1B2A5B; margin: 0;">{{carrier}} · {{trackingNumber}}</p>
      </div>
      <p style="font-size: 14px; color: #5C3D2E; text-align: center;">
        We hope you love it. If anything's not right, reply to this email and we'll make it right within 14 days.
      </p>
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{orderUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          View order
        </a>
      </div>
    `),
    variables: ['siteName', 'name', 'orderId', 'productName', 'carrier', 'trackingNumber', 'deliveredAtPhrase', 'orderUrl'],
  },
  {
    key: 'new_order_admin',
    name: 'New order — admin alert',
    description: 'Sent to the founder when a storefront order is paid.',
    subject: '🛍 New order — ${{amount}} from {{customerName}}',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">New order received</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px;">
        Hi {{name}}, a new order just landed and payment cleared.
      </p>
      <div style="background: #FAF7F2; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">ORDER</p>
        <p style="font-size: 16px; color: #1B2A5B; font-weight: 600; margin: 0 0 12px;">{{orderId}} — \${{amount}}</p>
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">PRODUCT</p>
        <p style="font-size: 14px; color: #1B2A5B; margin: 0 0 12px;">{{productName}}</p>
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">CUSTOMER</p>
        <p style="font-size: 14px; color: #1B2A5B; margin: 0;">{{customerName}} &middot; {{customerEmail}}</p>
      </div>
      <a href="{{orderUrl}}" style="display: inline-block; background: #C41E3A; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        View order
      </a>
    `),
    variables: ['siteName', 'name', 'orderId', 'productName', 'amount', 'customerName', 'customerEmail', 'orderUrl'],
  },
  {
    key: 'quote_sent',
    name: 'Quote sent to client',
    description: 'Sent to a client when the admin sends them a quote. Contains a secure link to view, accept, and pay the deposit.',
    subject: 'Your quote from {{siteName}} — {{quoteId}}',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">Your quote is ready</h2>
      <p style="font-size: 14px; color: #8B7569; margin: 0 0 16px;">
        Hi {{name}}, thank you for your interest in working with {{siteName}}. We've prepared your quote below.
      </p>
      <div style="background: #FAF7F2; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">QUOTE</p>
        <p style="font-size: 16px; color: #1B2A5B; font-weight: 600; margin: 0 0 12px;">{{quoteId}}</p>
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">TOTAL</p>
        <p style="font-size: 20px; color: #1B2A5B; font-weight: 700; margin: 0 0 12px;">\${{total}}</p>
        <p style="font-size: 12px; color: #8B7569; margin: 0 0 4px;">DEPOSIT TO START PRODUCTION ({{depositPercent}}%)</p>
        <p style="font-size: 14px; color: #C41E3A; font-weight: 600; margin: 0 0 12px;">\${{depositAmount}}</p>
        {{validUntilBlock}}
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{{quoteUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          View &amp; accept your quote
        </a>
      </div>
      <p style="font-size: 12px; color: #9CA3AF; text-align: center; line-height: 1.5;">
        Have questions? Just reply to this email — we read every message.
      </p>
    `),
    variables: ['siteName', 'name', 'quoteId', 'total', 'depositPercent', 'depositAmount', 'validUntilBlock', 'quoteUrl'],
  },
  {
    key: 'designer_application_received',
    name: 'Designer application received',
    description: 'Sent to someone right after they submit the "Become a Designer" application.',
    subject: 'We received your {{siteName}} designer application',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">Application received</h2>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6; margin: 0 0 16px;">
        Hi {{name}}, thank you for applying to join the {{siteName}} designer network.
      </p>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6; margin: 0 0 16px;">
        Our team will review your portfolio and complete identity and background
        verification. This usually takes a few business days. We'll email you as
        soon as a decision is made.
      </p>
      <p style="font-size: 12px; color: #9CA3AF; line-height: 1.5;">
        Have questions? Just reply to this email.
      </p>
    `),
    variables: ['siteName', 'name'],
  },
  {
    key: 'designer_application_approved',
    name: 'Designer application approved',
    description: 'Sent when an admin approves a designer application. Contains a link to set up the designer account.',
    subject: 'You\'re approved — welcome to the {{siteName}} designer network',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">You're approved 🎉</h2>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6; margin: 0 0 16px;">
        Hi {{name}}, congratulations — your application to join the {{siteName}}
        designer network has been approved and verified.
      </p>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6; margin: 0 0 24px;">
        Create your designer account with this same email address ({{email}}) to
        access your workspace, order offers, and production board.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="{{signupUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Set up your designer account
        </a>
      </div>
      <p style="font-size: 12px; color: #9CA3AF; text-align: center; line-height: 1.5;">
        You must use {{email}} when signing up — that's how your designer profile is linked.
      </p>
    `),
    variables: ['siteName', 'name', 'email', 'signupUrl'],
  },
  {
    key: 'daily_digest',
    name: 'Daily digest (founder)',
    description: 'Sent every morning to the founder summarising the prior day\'s orders, revenue, consultations, and customers.',
    subject: '{{siteName}} — Daily Digest for {{periodLabel}}',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 4px;">Daily Digest</h2>
      <p style="font-size: 13px; color: #8B7569; margin: 0 0 20px;">{{periodLabel}}</p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
        <div style="background: #FAF7F2; border-radius: 8px; padding: 14px;">
          <p style="font-size: 11px; color: #8B7569; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 4px;">Revenue</p>
          <p style="font-size: 22px; color: #1B2A5B; font-weight: 700; margin: 0;">{{revenue}}</p>
        </div>
        <div style="background: #FAF7F2; border-radius: 8px; padding: 14px;">
          <p style="font-size: 11px; color: #8B7569; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 4px;">Orders</p>
          <p style="font-size: 22px; color: #1B2A5B; font-weight: 700; margin: 0;">{{orderCount}}</p>
        </div>
        <div style="background: #FAF7F2; border-radius: 8px; padding: 14px;">
          <p style="font-size: 11px; color: #8B7569; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 4px;">Consultations</p>
          <p style="font-size: 22px; color: #1B2A5B; font-weight: 700; margin: 0;">{{consultationCount}}</p>
        </div>
        <div style="background: #FAF7F2; border-radius: 8px; padding: 14px;">
          <p style="font-size: 11px; color: #8B7569; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 4px;">New Customers</p>
          <p style="font-size: 22px; color: #1B2A5B; font-weight: 700; margin: 0;">{{newCustomerCount}}</p>
        </div>
      </div>

      <div style="border-top: 1px solid #E7E1D8; padding-top: 16px; margin-bottom: 16px;">
        <p style="font-size: 12px; color: #8B7569; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 8px;">Snapshot</p>
        <p style="font-size: 14px; color: #1B2A5B; line-height: 1.7; margin: 0;">
          Refunds: <strong>{{refunds}}</strong> &nbsp;&middot;&nbsp;
          Returns opened: <strong>{{returnsOpened}}</strong> &nbsp;&middot;&nbsp;
          Pending shipments: <strong>{{pendingShipments}}</strong>
        </p>
      </div>

      <div style="text-align: center; margin-top: 20px;">
        <a href="{{adminUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 12px 26px; border-radius: 8px; font-size: 13px; font-weight: 600;">
          Open Admin Console
        </a>
      </div>
    `),
    variables: [
      'siteName', 'periodLabel', 'revenue', 'orderCount', 'consultationCount',
      'newCustomerCount', 'refunds', 'returnsOpened', 'pendingShipments', 'adminUrl',
    ],
  },
  {
    key: 'abandoned_cart',
    name: 'Abandoned cart reminder',
    description: 'Sent ~24h after a customer started checkout but never completed payment. Pulls them back to finish.',
    subject: 'Did you forget something?',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">Your order is waiting</h2>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6; margin: 0 0 20px;">
        Hi {{name}}, you started checking out {{productName}} but didn't finish. Your cart is saved — pick up where you left off whenever you're ready.
      </p>
      <div style="background: #FAF7F2; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="font-size: 14px; color: #5C3D2E;">{{productName}}</span>
          <span style="font-size: 14px; color: #1B2A5B; font-weight: 600;">\${{amount}}</span>
        </div>
      </div>
      <a href="{{checkoutUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Complete your order
      </a>
      <p style="font-size: 12px; color: #9CA3AF; margin-top: 24px; line-height: 1.5;">
        Questions? Just reply to this email — we're happy to help.
      </p>
    `),
    variables: ['siteName', 'name', 'productName', 'amount', 'checkoutUrl'],
  },
  {
    key: 'review_prompt',
    name: 'Post-delivery review prompt',
    description: 'Sent a few days after a delivery is confirmed, asking the customer to leave a review.',
    subject: 'How are you enjoying your {{productName}}?',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">We'd love your honest take</h2>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6; margin: 0 0 20px;">
        Hi {{name}}, your {{productName}} should be in your hands by now. We pour everything we have into each piece — would you spare a minute to tell us what you think?
      </p>
      <a href="{{reviewUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Leave a review
      </a>
      <p style="font-size: 12px; color: #9CA3AF; margin-top: 24px; line-height: 1.5;">
        Or reply to this email with any feedback — we read every one.
      </p>
    `),
    variables: ['siteName', 'name', 'productName', 'reviewUrl'],
  },
  {
    key: 'inbox_reply',
    name: 'New reply from AWULA K',
    description: 'Sent to the customer when an admin replies in /admin/inbox so they know to come back and read it.',
    subject: '{{senderName}} replied to your AWULA K conversation',
    html: baseFrame(`
      <h2 style="font-size: 20px; color: #1B2A5B; margin: 0 0 12px;">You have a new message</h2>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.6; margin: 0 0 16px;">
        Hi {{name}}, {{senderName}} at {{siteName}} just replied to your conversation.
      </p>
      <div style="background: #FAF7F2; border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 3px solid #1B2A5B;">
        <p style="font-size: 14px; color: #2D2D2D; line-height: 1.6; margin: 0; white-space: pre-wrap;">{{preview}}</p>
      </div>
      <a href="{{inboxUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Open conversation
      </a>
    `),
    variables: ['siteName', 'name', 'senderName', 'preview', 'inboxUrl'],
  },
  {
    key: 'newsletter_campaign',
    name: 'Newsletter / campaign broadcast',
    description: 'The wrapper used when an admin sends a manual broadcast from Marketing → Mailing List. {{body}} is the message typed in the composer.',
    subject: '{{subject}}',
    html: marketingFrame(`
      <div style="font-size: 15px; color: #5C3D2E; line-height: 1.7;">{{body}}</div>
      {{ctaBlock}}
    `),
    variables: ['siteName', 'subject', 'body', 'ctaBlock', 'unsubscribeUrl'],
  },
  {
    key: 'new_product_announcement',
    name: 'New arrival announcement',
    description: 'Sent to the mailing list when a new product is published — manually or by the daily new-product cron.',
    subject: 'New arrival: {{productName}}',
    html: marketingFrame(`
      <p style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #C41E3A; margin: 0 0 8px; text-align: center;">Just dropped</p>
      <h2 style="font-size: 22px; color: #1B2A5B; margin: 0 0 16px; text-align: center;">{{productName}}</h2>
      <a href="{{productUrl}}" style="display: block; text-decoration: none;">
        <img src="{{productImage}}" alt="{{productName}}" style="width: 100%; border-radius: 10px; margin-bottom: 16px;" />
      </a>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.7; margin: 0 0 12px; text-align: center;">{{blurb}}</p>
      <p style="font-size: 18px; color: #1B2A5B; font-weight: 700; text-align: center; margin: 0 0 20px;">\${{price}}</p>
      <div style="text-align: center;">
        <a href="{{productUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Shop now
        </a>
      </div>
    `),
    variables: ['siteName', 'productName', 'productImage', 'blurb', 'price', 'productUrl', 'unsubscribeUrl'],
  },
  {
    key: 'back_in_stock',
    name: 'Back in stock notification',
    description: 'Sent to a customer who asked to be notified when a sold-out product is restocked.',
    subject: 'Back in stock: {{productName}}',
    html: marketingFrame(`
      <p style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #2D8E5A; margin: 0 0 8px; text-align: center;">Back in stock</p>
      <h2 style="font-size: 22px; color: #1B2A5B; margin: 0 0 16px; text-align: center;">{{productName}}</h2>
      <a href="{{productUrl}}" style="display: block; text-decoration: none;">
        <img src="{{productImage}}" alt="{{productName}}" style="width: 100%; border-radius: 10px; margin-bottom: 16px;" />
      </a>
      <p style="font-size: 14px; color: #8B7569; line-height: 1.7; margin: 0 0 20px; text-align: center;">
        The piece you wanted is available again — but it may not last. Grab yours before it's gone.
      </p>
      <div style="text-align: center;">
        <a href="{{productUrl}}" style="display: inline-block; background: #1B2A5B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Shop now
        </a>
      </div>
    `),
    variables: ['siteName', 'productName', 'productImage', 'productUrl', 'unsubscribeUrl'],
  },
];

const BUILTIN_BY_KEY = new Map(BUILTIN_TEMPLATES.map((t) => [t.key, t]));

function substitute(template: string, vars: Record<string, string | number | undefined | null>): string {
  // Strip {{#if key}}...{{/if}} blocks when the variable is empty/falsy.
  let result = template.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, key, content) => {
    const v = vars[key];
    return (v !== undefined && v !== null && v !== '') ? content : '';
  });
  // Replace remaining {{varName}} placeholders.
  return result.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name) => {
    const v = vars[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

/**
 * Render an email template. Looks for an admin-edited row in the
 * `EmailTemplate` table first; falls back to the built-in default.
 * Returns null when the template is disabled by the admin.
 */
export async function renderEmailTemplate(
  key: string,
  variables: Record<string, string | number | undefined | null> = {},
): Promise<RenderedEmail | null> {
  let row: { subject: string; html: string; enabled: boolean } | null = null;
  try {
    row = await prisma.emailTemplate.findUnique({
      where: { key },
      select: { subject: true, html: true, enabled: true },
    });
  } catch {
    // Table may not exist yet (migration not deployed).
  }

  if (row && !row.enabled) return null;

  const builtin = BUILTIN_BY_KEY.get(key);
  if (!row && !builtin) return null;

  const subject = row?.subject ?? builtin?.subject ?? '';
  const html = row?.html ?? builtin?.html ?? '';

  // Ensure siteName falls back to a sensible default.
  const merged = { siteName: 'AWULA K', appUrl: APP_URL, ...variables };

  return {
    subject: substitute(subject, merged),
    html: substitute(html, merged),
  };
}

/**
 * Returns every template the admin can edit. Built-ins that haven't been
 * customized are surfaced with their default subject/html so the editor
 * is never empty.
 */
export async function listEmailTemplatesForAdmin() {
  let rows: { key: string; name: string; subject: string; html: string; variables: unknown; enabled: boolean; description: string | null; updatedAt: Date | null; updatedBy: string | null }[] = [];
  try {
    rows = (await prisma.emailTemplate.findMany()) as typeof rows;
  } catch {
    // No table yet.
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return BUILTIN_TEMPLATES.map((b) => {
    const row = byKey.get(b.key);
    return {
      key: b.key,
      name: b.name,
      description: b.description,
      subject: row?.subject ?? b.subject,
      html: row?.html ?? b.html,
      variables: b.variables,
      enabled: row?.enabled ?? true,
      customized: Boolean(row),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}

export function getBuiltinTemplate(key: string): BuiltinTemplate | undefined {
  return BUILTIN_BY_KEY.get(key);
}
