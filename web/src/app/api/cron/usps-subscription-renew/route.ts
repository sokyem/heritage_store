import { NextRequest, NextResponse } from 'next/server';
import { renewTrackingSubscription } from '@/lib/usps-subscriptions';

// POST /api/cron/usps-subscription-renew
//
// Keepalive for the USPS Subscriptions-Tracking webhook. USPS deletes a
// subscription after ~25 days with no delivered events; because we ship via
// EasyPost (not our own MID) the subscription is fed nothing and would be
// pruned. This re-creates it on a schedule so its inactivity clock never
// reaches 25 days. Re-creation also makes USPS fire a verification handshake at
// /api/shipping/webhook/usps, which that route already answers.
//
// Schedule weekly (huge margin under the 25-day window), e.g.:
//   0 6 * * 1   POST https://www.awulak.com/api/cron/usps-subscription-renew
//               Header: Authorization: Bearer ${CRON_SECRET}
//
// Auth matches the other cron-* routes: if CRON_SECRET is set it's required,
// otherwise the endpoint runs unauthed (the GitHub workflows send an empty
// bearer). The renew helper never returns the webhook secret.

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await renewTrackingSubscription();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/usps-subscription-renew] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'AWULA K USPS subscription renew cron' });
}
