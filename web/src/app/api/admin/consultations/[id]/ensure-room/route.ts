import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { createDailyRoom } from '@/lib/daily';

// POST /api/admin/consultations/[id]/ensure-room
//
// Guarantees a virtual consultation has a video room link the admin can join.
// Provider preference:
//   1. Keep any existing link that isn't the free public-Jitsi scheme (a Daily
//      room, etc.) so admin + customer stay in the same room.
//   2. Otherwise provision a Daily.co room (un-capped, branded) when
//      DAILY_CO_API_KEY is set — this also UPGRADES old free-Jitsi links, which
//      meet.jit.si now caps at ~5 min ("demo").
//   3. Fallback: mint a free Jitsi link (/video-call?room=<id>) when Daily
//      isn't configured.
// The chosen link is persisted to the booking + its linked consultation so the
// customer resolves to the same room.

const isFreeJitsi = (link?: string | null) => !!link && link.includes('/video-call?room=');

async function resolveLink(id: string, current: string | null): Promise<{ link: string; changed: boolean }> {
  // A good existing link (Daily/external) stays put.
  if (current && !isFreeJitsi(current)) return { link: current, changed: false };
  // Prefer an un-capped Daily room when configured (also upgrades free-Jitsi).
  const daily = await createDailyRoom({ expiresInDays: 60 }).catch(() => null);
  if (daily?.url) return { link: daily.url, changed: true };
  // No Daily key: keep the existing free-Jitsi link, or mint one.
  if (current) return { link: current, changed: false };
  return { link: `/video-call?room=${id}`, changed: true };
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  // A customer booking (most virtual consultations).
  const booking = await prisma.consultationBooking.findUnique({
    where: { id },
    select: { id: true, meetingLink: true, consultationId: true },
  });
  if (booking) {
    const { link, changed } = await resolveLink(booking.id, booking.meetingLink);
    if (changed) {
      await prisma.consultationBooking.update({ where: { id }, data: { meetingLink: link } });
      if (booking.consultationId) {
        await prisma.consultation.update({ where: { id: booking.consultationId }, data: { meetingLink: link } }).catch(() => {});
      }
    }
    return NextResponse.json({ meetingLink: link, created: changed });
  }

  // An admin-created consultation row.
  const consult = await prisma.consultation.findUnique({ where: { id }, select: { id: true, meetingLink: true } });
  if (consult) {
    const { link, changed } = await resolveLink(consult.id, consult.meetingLink);
    if (changed) await prisma.consultation.update({ where: { id }, data: { meetingLink: link } });
    return NextResponse.json({ meetingLink: link, created: changed });
  }

  return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
}
