import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createDailyRoom, isDailyConfigured } from '@/lib/daily';

/**
 * GET /api/consultations/mine
 *
 * Returns the signed-in customer's consultations — the unified view used
 * by the customer dashboard. Reads the `Consultation` table, which BOTH
 * booking flows write to (the AI-intake slot picker and the paid checkout
 * flow), so every consultation shows up regardless of how it was booked.
 *
 * The optional `booking` relation carries slot times and the video room
 * link for consultations booked through the slot picker; the checkout
 * flow stores its own video link directly on `Consultation.meetingLink`.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) return NextResponse.json([]);

    // Explicit select — never reference columns that may not exist in an
    // out-of-sync prod DB, and avoid shipping the heavy analysis blobs.
    const consultations = await prisma.consultation.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        status: true,
        notes: true,
        meetingLink: true,
        eventType: true,
        createdAt: true,
        booking: {
          select: {
            id: true,
            meetingLink: true,
            status: true,
            // Post-call recap shown to the customer on their dashboard.
            // callSummary is the polished, admin-editable share-ready
            // version; callRecordingUrl lets them rewatch the call they
            // were on. Raw callNotes / callTranscript stay admin-only.
            callSummary: true,
            callRecordingUrl: true,
            slot: {
              select: {
                date: true,
                startTime: true,
                endTime: true,
                duration: true,
                type: true,
              },
            },
          },
        },
      },
    });

    // Backfill a video link for any consultation that never got one — older
    // bookings predate Daily room provisioning. This self-heals them the
    // first time the customer opens their dashboard, so the "Join" button
    // shows up instead of the "link will appear here" placeholder.
    if (isDailyConfigured()) {
      const linkless = consultations.filter(
        (c) => !c.meetingLink && !c.booking?.meetingLink && c.status !== 'cancelled',
      );
      for (const c of linkless) {
        const room = await createDailyRoom({ expiresInDays: 60 });
        if (room?.url) {
          c.meetingLink = room.url;
          await prisma.consultation.update({
            where: { id: c.id },
            data: { meetingLink: room.url },
          });
        }
      }
    }

    return NextResponse.json(consultations);
  } catch (error) {
    console.error('Failed to fetch user consultations:', error);
    return NextResponse.json({ error: 'Failed to fetch consultations' }, { status: 500 });
  }
}
