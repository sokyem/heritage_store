/**
 * GET    /api/consultation-bookings/[id]  — single booking detail
 * PUT    /api/consultation-bookings/[id]  — update status / call notes
 * DELETE /api/consultation-bookings/[id]  — cancel (frees the slot)
 *
 * The admin consultations page uses PUT to update the status + session
 * notes of customer-initiated bookings (source: 'booking'), since those
 * live in ConsultationBooking rather than AdminConsultation.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { recordAudit } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  try {
    const booking = await prisma.consultationBooking.findUnique({
      where: { id },
      include: {
        slot: true,
        consultation: { include: { user: { select: { name: true, email: true } } } },
      },
    });
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    return NextResponse.json(booking);
  } catch (error) {
    console.error('[consultation-booking GET]', error);
    return NextResponse.json({ error: 'Failed to fetch booking' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const existing = await prisma.consultationBooking.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

    const updated = await prisma.consultationBooking.update({
      where: { id },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.callNotes !== undefined && { callNotes: body.callNotes }),
        ...(body.sessionNotes !== undefined && { callNotes: body.sessionNotes }),
        ...(body.callSummary !== undefined && { callSummary: body.callSummary }),
        ...(body.meetingLink !== undefined && { meetingLink: body.meetingLink }),
      },
      include: { slot: true },
    });

    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'ConsultationBooking',
      entityId: id,
      summary: body.status && body.status !== existing.status
        ? `Status: ${existing.status} → ${body.status}`
        : 'Updated consultation booking',
      diff: { changed: Object.keys(body) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[consultation-booking PUT]', error);
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  try {
    const booking = await prisma.consultationBooking.findUnique({ where: { id } });
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

    // Cancel rather than hard-delete (preserve history). Free the slot back up.
    await prisma.consultationBooking.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await prisma.consultationSlot.update({
      where: { id: booking.slotId },
      data: { isAvailable: true },
    }).catch(() => null);

    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'ConsultationBooking',
      entityId: id,
      summary: 'Cancelled consultation booking',
    });

    return NextResponse.json({ ok: true, cancelled: id });
  } catch (error) {
    console.error('[consultation-booking DELETE]', error);
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
  }
}
