import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createDailyRoom, isDailyConfigured } from '@/lib/daily';

// POST /api/admin/instant-consult
//
// Provisions an ad-hoc Daily.co room so an admin can jump into a video
// consultation with a client without going through the slot-picker /
// paid booking flow. Returns the URL the admin should open + a URL
// they can text/email to the client.
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  if (!isDailyConfigured()) {
    return NextResponse.json(
      { error: 'Daily.co not configured — set DAILY_CO_API_KEY in Railway Variables' },
      { status: 503 },
    );
  }

  // Short-lived room (24h) — instant consults aren't long-term resources.
  const room = await createDailyRoom({ expiresInDays: 1 });
  if (!room) {
    return NextResponse.json(
      { error: 'Could not create video room — check Daily.co configuration' },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: room.url, name: room.name });
}
