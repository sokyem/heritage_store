import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { updateShipmentStatus } from '@/lib/shipping-notifications';

const USPS_WEBHOOK_SECRET = process.env.USPS_WEBHOOK_SECRET || '';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyHmacSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const b64 = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const hex = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return safeEqual(b64, signature) || safeEqual(hex, signature.toLowerCase());
}

// USPS Subscriptions v3 event types → our internal shipment status.
const STATUS_MAP: Record<string, string> = {
  'ACCEPTED': 'picked_up',
  'OUT_FOR_DELIVERY': 'out_for_delivery',
  'IN_TRANSIT': 'in_transit',
  'DELIVERED': 'delivered',
  'AVAILABLE_FOR_PICKUP': 'in_transit',
  'RETURN_TO_SENDER': 'returned',
  'DELIVERY_EXCEPTION': 'exception',
  'PRE_SHIPMENT': 'label_created',
  'CANCELLED': 'cancelled',
};

/**
 * POST /api/shipping/webhook/usps
 * Receives USPS Subscriptions v3 push notifications.
 *
 * Example payload:
 * {
 *   "trackingNumber": "9400111...",
 *   "eventType": "DELIVERED",
 *   "eventTimeStamp": "2026-05-17T14:22:00Z",
 *   "eventLocation": { "city": "Atlanta", "state": "GA", "ZIPCode": "30303" }
 * }
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (USPS_WEBHOOK_SECRET) {
    const signature = req.headers.get('x-usps-signature') || req.headers.get('x-usps-event-signature') || '';
    const authHeader = req.headers.get('authorization') || '';
    const bearerOk = authHeader === `Bearer ${USPS_WEBHOOK_SECRET}`;
    const signatureOk = verifyHmacSignature(rawBody, signature, USPS_WEBHOOK_SECRET);
    if (!bearerOk && !signatureOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Fail closed in production — anyone could otherwise push fake events.
    console.error('USPS webhook rejected: USPS_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  try {
    const body = rawBody ? JSON.parse(rawBody) : {};

    // Subscription verification handshake (USPS sends a challenge on registration).
    if (body.challenge) {
      return NextResponse.json({ challenge: body.challenge });
    }

    // USPS may batch events in an array under "events" or send singletons.
    const events: Array<Record<string, unknown>> = Array.isArray(body.events)
      ? body.events
      : Array.isArray(body)
        ? body
        : [body];

    const results: Array<{ trackingNumber: string; matched: boolean; status?: string }> = [];

    for (const evt of events) {
      const trackingNumber = (evt.trackingNumber as string) || (evt.TrackingNumber as string) || '';
      const eventType = ((evt.eventType as string) || (evt.eventCode as string) || '').toUpperCase();
      const eventLocation = evt.eventLocation as Record<string, string> | undefined;
      const description = (evt.eventDescription as string) || eventType || '';
      const locationStr = eventLocation
        ? `${eventLocation.city || ''}, ${eventLocation.state || ''} ${eventLocation.ZIPCode || ''}`.trim().replace(/^,\s*/, '')
        : '';

      if (!trackingNumber) continue;

      const shipment = await prisma.shipment.findFirst({ where: { trackingNumber } });
      if (!shipment) {
        results.push({ trackingNumber, matched: false });
        continue;
      }

      const newStatus = STATUS_MAP[eventType] || shipment.status;

      await updateShipmentStatus(shipment.id, newStatus, {
        description,
        location: locationStr,
        source: 'usps_webhook',
      });

      if (newStatus === 'delivered') {
        const deliveredAt = (evt.eventTimeStamp as string) || (evt.actualDeliveryDate as string);
        if (deliveredAt) {
          const parsed = new Date(deliveredAt);
          if (!Number.isNaN(parsed.getTime())) {
            await prisma.shipment.update({
              where: { id: shipment.id },
              data: { actualDelivery: parsed },
            });
          }
        }
      }

      results.push({ trackingNumber, matched: true, status: newStatus });
    }

    return NextResponse.json({ received: true, processed: results.length, results });
  } catch (error) {
    console.error('USPS webhook error:', error);
    // Always 200 on parse errors so USPS doesn't retry endlessly.
    return NextResponse.json({ received: true, error: 'Processing failed' });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'AWULA K USPS Webhook' });
}
