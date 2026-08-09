import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/cron/expire-consultation-slots
//
// Auto-delete consultation availability slots whose date has passed, so the
// admin's slot list only shows current/future availability (bulk-generated
// recurring slots otherwise pile up forever).
//
// Only deletes slots with NO bookings — a booked slot's ConsultationBooking
// rows cascade on delete and carry the call transcript/notes/recording, so
// past *booked* slots are kept as history. Empty, never-booked past slots are
// the clutter this removes.
//
// Schedule daily, e.g.:
//   15 4 * * *  POST https://www.awulak.com/api/cron/expire-consultation-slots
//               Header: Authorization: Bearer ${CRON_SECRET}

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Start of the current UTC day — slots dated strictly before today are past.
  // (Slots store `date` at UTC midnight; today's slots are kept until tomorrow.)
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const result = await prisma.consultationSlot.deleteMany({
    where: {
      date: { lt: todayUTC },
      bookings: { none: {} }, // never delete a slot that has booking history
    },
  });

  return NextResponse.json({ deleted: result.count, before: todayUTC.toISOString().slice(0, 10) });
}
