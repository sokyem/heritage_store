import { NextRequest, NextResponse } from 'next/server';
import { expireStaleOffers } from '@/lib/assignment-engine';

// POST /api/cron/expire-offers
//
// Sweeps AssignmentOffer rows whose `expiresAt` has passed but are still
// marked `offered`, transitions them to `expired`, and bumps the engine
// forward to the next candidate. Offers expire after 60s so this needs
// to run at minute granularity to be useful.
//
// Schedule every minute (cron-job.org or similar):
//   * * * * *  POST https://www.awulak.com/api/cron/expire-offers
//              Header: Authorization: Bearer ${CRON_SECRET}

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const expired = await expireStaleOffers();
    return NextResponse.json({ expired });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron/expire-offers]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
