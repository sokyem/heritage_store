import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { updateShipmentStatus } from '@/lib/shipping-notifications';
import { mapEasyPostStatus } from '@/lib/easypost';

// Secret you set when creating the EasyPost webhook (Dashboard → Webhooks).
// EasyPost signs the raw body with HMAC-SHA256 and sends it as
// `X-Hmac-Signature: hmac-sha256-hex=<hex>`.
const EASYPOST_WEBHOOK_SECRET = process.env.EASYPOST_WEBHOOK_SECRET || '';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifySignature(rawBody: string, header: string, secret: string): boolean {
  if (!header) return false;
  // Header is "hmac-sha256-hex=<hex>" — tolerate a bare hex/base64 too.
  const provided = header.includes('=') ? header.split('=').slice(1).join('=') : header;
  const hex = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const b64 = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return safeEqual(hex, provided.toLowerCase()) || safeEqual(b64, provided);
}

/**
 * POST /api/shipping/webhook/easypost
 *
 * Receives EasyPost `tracker.updated` events for labels bought through EasyPost
 * and advances the linked storefront order's status (shipped / delivered) via
 * the shared `updateShipmentStatus` helper — the same path the UPS/USPS
 * webhooks use, so customer emails + in-app notifications fire identically.
 *
 * EasyPost auto-creates a Tracker when a label is purchased, so no separate
 * tracker registration is needed; just point an EasyPost webhook at this URL
 * and set EASYPOST_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (EASYPOST_WEBHOOK_SECRET) {
    const sig = req.headers.get('x-hmac-signature') || '';
    if (!verifySignature(rawBody, sig, EASYPOST_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Fail closed in production — anyone could otherwise push fake events.
    console.error('EasyPost webhook rejected: EASYPOST_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  try {
    const body = rawBody ? JSON.parse(rawBody) : {};

    // We only act on tracker updates; ignore everything else (return 200 so
    // EasyPost doesn't retry).
    if (body.description !== 'tracker.updated') {
      return NextResponse.json({ received: true, ignored: body.description || 'unknown' });
    }

    const result = (body.result as Record<string, unknown>) || {};
    const trackingNumber = String(result.tracking_code || '');
    const epStatus = String(result.status || '');
    if (!trackingNumber) {
      return NextResponse.json({ received: true, matched: false, reason: 'no tracking_code' });
    }

    const shipment = await prisma.shipment.findFirst({ where: { trackingNumber } });
    if (!shipment) {
      return NextResponse.json({ received: true, matched: false });
    }

    const newStatus = mapEasyPostStatus(epStatus);
    if (!newStatus) {
      return NextResponse.json({ received: true, matched: true, status: shipment.status, note: `unmapped: ${epStatus}` });
    }

    const detail = (result.tracking_details as Array<Record<string, unknown>>) || [];
    const last = detail[detail.length - 1] || {};
    const trackingLoc = (last.tracking_location as Record<string, string>) || {};
    const locationStr = [trackingLoc.city, trackingLoc.state, trackingLoc.zip].filter(Boolean).join(', ');

    await updateShipmentStatus(shipment.id, newStatus, {
      description: String(last.message || epStatus),
      location: locationStr,
      source: 'easypost_webhook',
    });

    if (newStatus === 'delivered') {
      const deliveredAt = (last.datetime as string) || (result.est_delivery_date as string);
      if (deliveredAt) {
        const parsed = new Date(deliveredAt);
        if (!Number.isNaN(parsed.getTime())) {
          await prisma.shipment.update({ where: { id: shipment.id }, data: { actualDelivery: parsed } });
        }
      }
    }

    return NextResponse.json({ received: true, matched: true, status: newStatus });
  } catch (error) {
    console.error('EasyPost webhook error:', error);
    // Always 200 on parse errors so EasyPost doesn't retry endlessly.
    return NextResponse.json({ received: true, error: 'Processing failed' });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'AWULA K EasyPost Webhook' });
}
