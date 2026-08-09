import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { recordShipmentEvent, updateShipmentStatus } from '@/lib/shipping-notifications';

// UPS webhook secret for verifying payloads (set in env)
const UPS_WEBHOOK_SECRET = process.env.UPS_WEBHOOK_SECRET || '';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// UPS signs the raw request body with HMAC-SHA256(secret, body); the digest
// is sent in `x-ups-signature` as base64. Accept either base64 or hex to be lenient.
function verifyHmacSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const b64 = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const hex = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return safeEqual(b64, signature) || safeEqual(hex, signature.toLowerCase());
}

/**
 * POST /api/shipping/webhook
 * Receives UPS Tracking webhook push notifications
 * Docs: https://developer.ups.com/api/reference/tracking/webhooks
 *
 * UPS sends JSON with tracking status updates:
 * {
 *   "trackingNumber": "1Z...",
 *   "statusType": "D" | "I" | "P" | "M" | "X",
 *   "statusDescription": "...",
 *   "statusCode": "...",
 *   "localActivityDate": "20260408",
 *   "localActivityTime": "143022",
 *   "activityLocation": { "city": "...", "stateProvince": "...", ... },
 *   ...
 * }
 */
export async function POST(req: NextRequest) {
  // Read raw body once — required for HMAC verification before JSON parse.
  const rawBody = await req.text();

  if (UPS_WEBHOOK_SECRET) {
    const authHeader = req.headers.get('authorization') || '';
    const signature = req.headers.get('x-ups-signature') || '';
    const credential = req.headers.get('credential') || '';

    const bearerOk = authHeader === `Bearer ${UPS_WEBHOOK_SECRET}`;
    const credentialOk = credential !== '' && safeEqual(credential, UPS_WEBHOOK_SECRET);
    const signatureOk = verifyHmacSignature(rawBody, signature, UPS_WEBHOOK_SECRET);

    if (!bearerOk && !credentialOk && !signatureOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Fail closed in production when the secret isn't configured — otherwise
    // anyone could push fake delivery events and trigger customer notifications.
    console.error('UPS webhook rejected: UPS_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  try {
    const body = rawBody ? JSON.parse(rawBody) : {};

    // Handle UPS subscription verification (challenge-response)
    if (body.challenge) {
      return NextResponse.json({ challenge: body.challenge });
    }

    const trackingNumber = body.trackingNumber || body.TrackingNumber;
    const statusType = body.statusType || body.StatusType?.Code;
    const statusDescription = body.statusDescription || body.StatusType?.Description || '';
    const activityLocation = body.activityLocation || body.ActivityLocation;
    const locationStr = activityLocation
      ? `${activityLocation.city || ''}, ${activityLocation.stateProvince || ''} ${activityLocation.countryCode || ''}`.trim()
      : '';

    if (!trackingNumber) {
      return NextResponse.json({ error: 'No tracking number in payload' }, { status: 400 });
    }

    // Find our shipment by tracking number
    const shipment = await prisma.shipment.findFirst({
      where: { trackingNumber },
    });

    if (!shipment) {
      // Not our shipment — return 200 so UPS doesn't retry
      return NextResponse.json({ received: true, matched: false });
    }

    // Map UPS status codes to our status
    const statusMap: Record<string, string> = {
      D: 'delivered',
      I: 'in_transit',
      P: 'picked_up',
      M: 'label_created',
      X: 'exception',
      RS: 'returned',
      DO: 'out_for_delivery',
      DD: 'delivered',
      OT: 'in_transit',
    };

    const newStatus = statusMap[statusType] || shipment.status;

    // Update status + record event + notify customer
    await updateShipmentStatus(shipment.id, newStatus, {
      description: statusDescription,
      location: locationStr,
      source: 'ups_webhook',
    });

    // If delivered, update actual delivery date
    if (newStatus === 'delivered') {
      const deliveryDate = body.localActivityDate || body.GMTActivityDate;
      if (deliveryDate) {
        const year = deliveryDate.substring(0, 4);
        const month = deliveryDate.substring(4, 6);
        const day = deliveryDate.substring(6, 8);
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: { actualDelivery: new Date(`${year}-${month}-${day}`) },
        });
      }
    }

    return NextResponse.json({ received: true, matched: true, shipmentId: shipment.shipmentId, status: newStatus });
  } catch (error) {
    console.error('UPS webhook error:', error);
    // Return 200 to prevent UPS from retrying on parse errors
    return NextResponse.json({ received: true, error: 'Processing failed' });
  }
}

// GET /api/shipping/webhook — UPS subscription verification
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'AWULA K Shipping Webhook' });
}
