import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { sendSMS, buildConsultationSMS } from '@/lib/sms';
import { sendTemplate } from '@/lib/email';
import { createDailyRoom } from '@/lib/daily';
import { alertAdmins } from '@/lib/admin-alerts';

const APP_URL = process.env.NEXTAUTH_URL || 'https://www.awulak.com';

// GET /api/consultation-bookings - Get bookings for a user
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const bookings = await prisma.consultationBooking.findMany({
      where,
      include: {
        slot: true,
        consultation: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(bookings);
  } catch (error) {
    console.error('Failed to fetch bookings:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}

// POST /api/consultation-bookings - Book a consultation slot
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slotId, consultationId, customerName, customerEmail, customerPhone } = body;

    if (!slotId) {
      return NextResponse.json({ error: 'slotId is required' }, { status: 400 });
    }

    // Verify slot exists and is available
    const slot = await prisma.consultationSlot.findUnique({
      where: { id: slotId },
      include: {
        bookings: { where: { status: { not: 'cancelled' } } },
      },
    });

    if (!slot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
    }

    if (!slot.isAvailable) {
      return NextResponse.json({ error: 'This slot is no longer available' }, { status: 400 });
    }

    if (slot.bookings.length >= slot.maxBookings) {
      return NextResponse.json({ error: 'This slot is fully booked' }, { status: 400 });
    }

    // Resolve user
    let userId: string;
    if (consultationId) {
      const consultation = await prisma.consultation.findUnique({
        where: { id: consultationId },
      });
      if (!consultation) {
        return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
      }
      userId = consultation.userId;
    } else {
      // Find or create demo user
      let demoUser = await prisma.user.findUnique({
        where: { email: customerEmail || 'demo@awulak.com' },
      });
      if (!demoUser) {
        demoUser = await prisma.user.create({
          data: {
            email: customerEmail || 'demo@awulak.com',
            name: customerName || 'Guest',
            role: 'customer',
          },
        });
      }
      userId = demoUser.id;
    }

    // Create a real Daily.co video room — no login, no moderator wait.
    // Falls back to the legacy in-app /video-call room if Daily is down
    // or unconfigured, so a booking never fails over video provisioning.
    let meetingLink: string;
    const dailyRoom = await createDailyRoom({ expiresInDays: 30 });
    if (dailyRoom) {
      meetingLink = dailyRoom.url; // full https://awulak.daily.co/... URL
    } else {
      const meetingId = randomUUID().slice(0, 8);
      meetingLink = `/video-call?room=${meetingId}`;
    }

    // Create the booking
    const booking = await prisma.consultationBooking.create({
      data: {
        slotId,
        consultationId: consultationId || null,
        userId,
        customerName: customerName || null,
        customerEmail: customerEmail || null,
        customerPhone: customerPhone || null,
        meetingLink,
        status: 'confirmed',
        notifiedAt: new Date(),
      },
      include: { slot: true },
    });

    // Update consultation with meeting link if linked
    if (consultationId) {
      await prisma.consultation.update({
        where: { id: consultationId },
        data: { meetingLink, status: 'booked' },
      });
    }

    // Mark slot as unavailable if fully booked
    if (slot.bookings.length + 1 >= slot.maxBookings) {
      await prisma.consultationSlot.update({
        where: { id: slotId },
        data: { isAvailable: false },
      });
    }

    // ── Create notifications ──

    // 1. Notify the customer
    await prisma.notification.create({
      data: {
        userId,
        type: 'consultation_booked',
        title: 'Consultation Booked!',
        message: `Your consultation is confirmed for ${slot.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${slot.startTime}. Meeting link: ${meetingLink}`,
        relatedId: booking.id,
      },
    });

    // 2. Notify admin/founder
    const adminUsers = await prisma.user.findMany({
      where: { role: { in: ['founder', 'staff'] } },
    });

    for (const admin of adminUsers) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'new_booking',
          title: 'New Consultation Booking',
          message: `${customerName || 'A customer'} booked a ${slot.type} consultation for ${slot.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${slot.startTime}. Email: ${customerEmail || 'N/A'}, Phone: ${customerPhone || 'N/A'}`,
          relatedId: booking.id,
        },
      });
    }

    // 3. Send the confirmation text (Twilio — mocked & logged if unconfigured).
    let smsSent = false;
    let smsError: string | undefined;
    if (customerPhone) {
      const smsBody = buildConsultationSMS({
        customerName,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        type: slot.type,
        duration: slot.duration,
        meetingLink,
      });
      const smsResult = await sendSMS(customerPhone, smsBody);
      smsSent = smsResult.ok;
      if (!smsResult.ok) {
        smsError = smsResult.error;
        console.error('Consultation confirmation SMS failed:', smsResult.error);
      }
    }

    // 4. Send the confirmation EMAIL (was previously never sent — the old
    //    response just claimed emailSent:true if an address was present).
    let emailSent = false;
    if (customerEmail) {
      const typeLabel =
        slot.type === 'virtual' ? 'Virtual' : slot.type === 'phone' ? 'Phone' : 'In-Person';
      try {
        emailSent = await sendTemplate(
          'consultation_confirmation',
          customerEmail,
          {
            name: customerName || 'there',
            date: slot.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
            time: slot.startTime,
            type: typeLabel,
            duration: slot.duration,
            bookingRef: `BK-${booking.id.slice(-6).toUpperCase()}`,
            meetingUrl: meetingLink.startsWith('http') ? meetingLink : `${APP_URL}${meetingLink}`,
          },
          { notificationToggle: 'emailConsultationReminder' },
        );
      } catch (err) {
        console.error('Consultation confirmation email failed:', err);
      }
    }

    // Alert the studio (in-app + SMS + email), matching the checkout path so a
    // slot booking is never missed. Best-effort — never blocks the response.
    alertAdmins({
      type: 'new_consultation',
      title: 'New consultation booked',
      message: `${customerName || customerEmail || 'A client'} booked a ${slot.type} consultation on ${slot.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} at ${slot.startTime}.`,
      relatedId: booking.id,
      path: '/admin/services/consultations',
    }).catch((err) => console.error('[consultation-bookings] admin alert failed:', err));

    return NextResponse.json({
      ...booking,
      notification: {
        emailSent,
        smsSent,
        smsError,
      },
    });
  } catch (error) {
    console.error('Failed to create booking:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
