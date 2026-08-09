import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { sendSMS, buildConsultationSMS } from '@/lib/sms';

// POST /api/consultation-bookings/[id]/sms
// Re-send the consultation confirmation text (with the video call link) to
// the client — used when they can't reach their email or lost the details.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;

    const booking = await prisma.consultationBooking.findUnique({
      where: { id },
      include: { slot: true },
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Allow overriding the destination number from the request body, so an
    // admin can correct a wrong number without editing the booking first.
    let toNumber = booking.customerPhone;
    try {
      const body = await req.json();
      if (body?.phone && typeof body.phone === 'string') toNumber = body.phone.trim();
    } catch {
      // no body — use the number on the booking
    }

    if (!toNumber) {
      return NextResponse.json(
        { error: 'No phone number on this booking. Add one and try again.' },
        { status: 400 },
      );
    }

    const message = buildConsultationSMS({
      customerName: booking.customerName,
      date: booking.slot.date,
      startTime: booking.slot.startTime,
      endTime: booking.slot.endTime,
      type: booking.slot.type,
      duration: booking.slot.duration,
      meetingLink: booking.meetingLink,
    });

    const result = await sendSMS(toNumber, message);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'Failed to send text message' },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, mocked: result.mocked === true, sentTo: toNumber });
  } catch (error) {
    console.error('Failed to resend consultation SMS:', error);
    return NextResponse.json({ error: 'Failed to send text message' }, { status: 500 });
  }
}
