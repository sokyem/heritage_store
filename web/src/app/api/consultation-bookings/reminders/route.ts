import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/consultation-bookings/reminders
//
// Scheduled job — sends consultation reminders 24h and 1h before each
// booking. Idempotent: each reminder window is recorded in
// ConsultationBooking.reminderSentAt so re-running the cron the same
// hour is a no-op.
//
// Schedule this hourly via Railway Cron or cron-job.org:
//   curl -X POST https://www.awulak.com/api/consultation-bookings/reminders \
//        -H "Authorization: Bearer ${CRON_SECRET}"
//
// Auth: if CRON_SECRET is set, the request must carry that bearer.
// (Same pattern as /api/cron/usps-pickup.)
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1h = new Date(now.getTime() + 1 * 60 * 60 * 1000);

    // Find confirmed bookings with upcoming slots
    const upcomingBookings = await prisma.consultationBooking.findMany({
      where: {
        status: 'confirmed',
      },
      include: {
        slot: true,
      },
    });

    const reminders: Array<{ bookingId: string; type: string; customerEmail: string | null }> = [];

    for (const booking of upcomingBookings) {
      const slotDate = new Date(booking.slot.date);
      const [hours, minutes] = booking.slot.startTime.split(':').map(Number);
      slotDate.setHours(hours, minutes, 0, 0);

      const timeDiff = slotDate.getTime() - now.getTime();
      const hoursUntil = timeDiff / (1000 * 60 * 60);

      // Parse previously sent reminders
      const sentReminders: string[] = booking.reminderSentAt
        ? JSON.parse(booking.reminderSentAt)
        : [];

      // 24-hour reminder (send when 23-25 hours away)
      if (hoursUntil > 23 && hoursUntil <= 25 && !sentReminders.includes('24h')) {
        await prisma.notification.create({
          data: {
            userId: booking.userId,
            type: 'consultation_reminder',
            title: 'Consultation Tomorrow',
            message: `Reminder: Your consultation is tomorrow at ${booking.slot.startTime}. Meeting link: ${booking.meetingLink}`,
            relatedId: booking.id,
          },
        });

        sentReminders.push('24h');
        await prisma.consultationBooking.update({
          where: { id: booking.id },
          data: { reminderSentAt: JSON.stringify(sentReminders) },
        });

        reminders.push({
          bookingId: booking.id,
          type: '24h',
          customerEmail: booking.customerEmail,
        });

        console.log(`📧 24h reminder sent for booking ${booking.id} to ${booking.customerEmail}`);
      }

      // 1-hour reminder (send when 0.75-1.25 hours away)
      if (hoursUntil > 0.75 && hoursUntil <= 1.25 && !sentReminders.includes('1h')) {
        await prisma.notification.create({
          data: {
            userId: booking.userId,
            type: 'consultation_reminder',
            title: 'Consultation in 1 Hour',
            message: `Your consultation starts in 1 hour at ${booking.slot.startTime}. Join here: ${booking.meetingLink}`,
            relatedId: booking.id,
          },
        });

        sentReminders.push('1h');
        await prisma.consultationBooking.update({
          where: { id: booking.id },
          data: { reminderSentAt: JSON.stringify(sentReminders) },
        });

        reminders.push({
          bookingId: booking.id,
          type: '1h',
          customerEmail: booking.customerEmail,
        });

        console.log(`📧 1h reminder sent for booking ${booking.id} to ${booking.customerEmail}`);
      }
    }

    return NextResponse.json({
      processed: upcomingBookings.length,
      remindersSent: reminders.length,
      reminders,
    });
  } catch (error) {
    console.error('Failed to process reminders:', error);
    return NextResponse.json({ error: 'Failed to process reminders' }, { status: 500 });
  }
}
