import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { sendTemplate, isEmailConfigured } from '@/lib/email';
import { absoluteUrl } from '@/lib/sms';

// POST /api/consultation-bookings/[id]/email
// Re-send the consultation confirmation email (with the video call link) to
// the client — used when they can't find the original or were booked
// before email was configured.
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

    // Allow overriding the destination address from the request body, so an
    // admin can correct a typo without editing the booking first.
    let toEmail = booking.customerEmail;
    try {
      const body = await req.json();
      if (body?.email && typeof body.email === 'string') toEmail = body.email.trim();
    } catch {
      // no body — use the address on the booking
    }

    if (!toEmail) {
      return NextResponse.json(
        { error: 'No email on this booking. Add one and try again.' },
        { status: 400 },
      );
    }

    if (!booking.meetingLink) {
      return NextResponse.json(
        { error: 'This booking has no video link yet. Reschedule to provision one.' },
        { status: 400 },
      );
    }

    const typeLabel =
      booking.slot.type === 'virtual'
        ? 'Virtual'
        : booking.slot.type === 'phone'
          ? 'Phone'
          : 'In-Person';

    const ok = await sendTemplate('consultation_confirmation', toEmail, {
      name: booking.customerName || 'there',
      date: booking.slot.date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
      time: booking.slot.startTime,
      type: typeLabel,
      duration: booking.slot.duration,
      bookingRef: `BK-${booking.id.slice(-6).toUpperCase()}`,
      meetingUrl: absoluteUrl(booking.meetingLink),
    });

    if (!ok) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      mocked: !isEmailConfigured(),
      sentTo: toEmail,
    });
  } catch (error) {
    console.error('Failed to resend consultation email:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
