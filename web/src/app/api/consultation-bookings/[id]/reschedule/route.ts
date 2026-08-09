import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { sendSMS, buildConsultationSMS } from '@/lib/sms';
import { recordAudit } from '@/lib/audit';

function normalizeOptionalText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeCustomData(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.entries(data as Record<string, unknown>).reduce<Record<string, string>>((acc, [rawKey, rawValue]) => {
    const key = rawKey.trim();
    const value = String(rawValue ?? '').trim();
    if (!key || !value) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

// POST /api/consultation-bookings/[id]/reschedule
// Move a confirmed booking to a different open slot. Frees the old slot,
// claims the new one, and re-notifies the client by text + in-app message.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const newSlotId = body?.newSlotId as string | undefined;
    const customDate = body?.customDate as string | undefined;
    const customStartTime = body?.customStartTime as string | undefined;
    const customEndTime = body?.customEndTime as string | undefined;
    const customType = (body?.customType as string | undefined) || undefined;
    const rescheduleReason = normalizeOptionalText(body?.rescheduleReason);
    const rescheduleNote = normalizeOptionalText(body?.rescheduleNote);
    const customData = sanitizeCustomData(body?.customData);

    if (!newSlotId && !(customDate && customStartTime)) {
      return NextResponse.json(
        { error: 'newSlotId or customDate + customStartTime is required' },
        { status: 400 },
      );
    }

    const booking = await prisma.consultationBooking.findUnique({ where: { id } });
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'Cancelled bookings cannot be rescheduled' }, { status: 400 });
    }

    let targetSlotId = newSlotId;

    // Custom date/time path — create (or reuse) a one-off slot, then point
    // the booking at it. This lets the admin pick any time the client suggests
    // without having to first add it to the open-slots list.
    if (!targetSlotId) {
      const date = new Date(`${customDate}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: 'Invalid custom date' }, { status: 400 });
      }
      if (!/^\d{2}:\d{2}$/.test(customStartTime!)) {
        return NextResponse.json({ error: 'Invalid customStartTime (expected HH:MM)' }, { status: 400 });
      }

      // Derive end time from start + the current slot's duration if not given.
      const existingSlot = await prisma.consultationSlot.findUnique({ where: { id: booking.slotId } });
      const duration = existingSlot?.duration ?? 30;
      let endTime = customEndTime;
      if (!endTime) {
        const [sh, sm] = customStartTime!.split(':').map(Number);
        const totalEnd = sh * 60 + sm + duration;
        endTime = `${String(Math.floor(totalEnd / 60)).padStart(2, '0')}:${String(totalEnd % 60).padStart(2, '0')}`;
      }
      const type = customType || existingSlot?.type || 'virtual';

      // Reuse an identical slot if one already exists (avoids duplicates when
      // the admin happens to type the same time as an open slot).
      const reuse = await prisma.consultationSlot.findFirst({
        where: { date, startTime: customStartTime, isAvailable: true },
        include: { bookings: { where: { status: { not: 'cancelled' } } } },
      });
      if (reuse && reuse.bookings.length < reuse.maxBookings) {
        targetSlotId = reuse.id;
      } else {
        const created = await prisma.consultationSlot.create({
          data: {
            date,
            startTime: customStartTime!,
            endTime,
            duration,
            type,
            maxBookings: 1,
            isAvailable: true,
            notes: 'Created via reschedule (custom time)',
          },
        });
        targetSlotId = created.id;
      }
    }

    if (booking.slotId === targetSlotId) {
      return NextResponse.json({ error: 'Booking is already on this slot' }, { status: 400 });
    }

    const newSlot = await prisma.consultationSlot.findUnique({
      where: { id: targetSlotId },
      include: { bookings: { where: { status: { not: 'cancelled' } } } },
    });
    if (!newSlot) {
      return NextResponse.json({ error: 'Target slot not found' }, { status: 404 });
    }
    if (!newSlot.isAvailable) {
      return NextResponse.json({ error: 'That slot is not available' }, { status: 400 });
    }
    if (newSlot.bookings.length >= newSlot.maxBookings) {
      return NextResponse.json({ error: 'That slot is fully booked' }, { status: 400 });
    }

    const oldSlotId = booking.slotId;
    const rescheduleDetails = [
      rescheduleReason ? `Reason: ${rescheduleReason}` : null,
      rescheduleNote ? `Note: ${rescheduleNote}` : null,
      Object.keys(customData).length
        ? `Custom Data (JSON): ${JSON.stringify(customData)}`
        : null,
    ].filter(Boolean) as string[];

    const rescheduleRecord = rescheduleDetails.length
      ? `[Reschedule ${new Date().toISOString()}]\n${rescheduleDetails.join('\n')}`
      : '';
    const callNotes = rescheduleRecord
      ? [booking.callNotes?.trim(), rescheduleRecord].filter(Boolean).join('\n\n')
      : booking.callNotes;

    // Move the booking, free the old slot, and update the new slot's fill state.
    const [updated] = await prisma.$transaction([
      prisma.consultationBooking.update({
        where: { id },
        data: {
          slotId: targetSlotId!,
          ...(rescheduleRecord && { callNotes }),
        },
        include: { slot: true },
      }),
      prisma.consultationSlot.update({
        where: { id: oldSlotId },
        data: { isAvailable: true },
      }),
      prisma.consultationSlot.update({
        where: { id: targetSlotId! },
        data: { isAvailable: newSlot.bookings.length + 1 < newSlot.maxBookings },
      }),
    ]);

    // ── Notify the client ──
    const dateLabel = newSlot.date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    await prisma.notification.create({
      data: {
        userId: booking.userId,
        type: 'consultation_rescheduled',
        title: 'Consultation Rescheduled',
        message: `Your consultation has been moved to ${dateLabel} at ${newSlot.startTime}.` +
          (booking.meetingLink ? ` Meeting link: ${booking.meetingLink}` : ''),
        relatedId: booking.id,
      },
    });

    let smsSent = false;
    let smsError: string | undefined;
    if (booking.customerPhone) {
      const result = await sendSMS(
        booking.customerPhone,
        buildConsultationSMS({
          customerName: booking.customerName,
          date: newSlot.date,
          startTime: newSlot.startTime,
          endTime: newSlot.endTime,
          type: newSlot.type,
          duration: newSlot.duration,
          meetingLink: booking.meetingLink,
          rescheduled: true,
        }),
      );
      smsSent = result.ok;
      smsError = result.error;
    }

    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'ConsultationBooking',
      entityId: id,
      summary: `Rescheduled to ${dateLabel} ${newSlot.startTime}`,
      diff: {
        oldSlotId,
        newSlotId: targetSlotId,
        smsSent,
        ...(rescheduleReason && { rescheduleReason }),
        ...(rescheduleNote && { rescheduleNote }),
        ...(Object.keys(customData).length && { customData }),
      },
    });

    return NextResponse.json({ ...updated, notification: { smsSent, smsError } });
  } catch (error) {
    console.error('Failed to reschedule booking:', error);
    return NextResponse.json({ error: 'Failed to reschedule booking' }, { status: 500 });
  }
}
