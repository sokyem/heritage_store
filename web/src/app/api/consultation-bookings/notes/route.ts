import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/consultation-bookings/notes
// Persist the post-call transcript and notes for a video consultation.
// Keyed by the room id embedded in the booking's meeting link, so the
// in-call page can save without needing the booking id directly.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { room, callNotes, callTranscript } = body as {
      room?: string;
      callNotes?: string;
      callTranscript?: string;
    };

    if (!room || typeof room !== 'string') {
      return NextResponse.json({ error: 'room is required' }, { status: 400 });
    }

    // Meeting links are stored as "/video-call?room=<room>", so the link
    // ends with the room id — match exactly to avoid prefix collisions.
    const booking = await prisma.consultationBooking.findFirst({
      where: { meetingLink: { endsWith: `room=${room}` } },
      orderBy: { createdAt: 'desc' },
    });

    if (!booking) {
      // Instant/ad-hoc consultations have no booking — nothing to save to.
      return NextResponse.json({
        saved: false,
        reason: 'This call is not linked to a booking, so notes were not stored.',
      });
    }

    await prisma.consultationBooking.update({
      where: { id: booking.id },
      data: {
        ...(callNotes !== undefined ? { callNotes } : {}),
        ...(callTranscript !== undefined ? { callTranscript } : {}),
      },
    });

    return NextResponse.json({ saved: true, bookingId: booking.id });
  } catch (error) {
    console.error('Failed to save consultation notes:', error);
    return NextResponse.json({ error: 'Failed to save notes' }, { status: 500 });
  }
}
