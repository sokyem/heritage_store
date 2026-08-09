import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

/**
 * GET /api/admin/consultations
 *
 * Returns a UNIFIED consultation list merging two previously-disconnected
 * sources so the admin sees everything in one place:
 *
 *   source: 'admin'   — AdminConsultation rows (walk-ins, admin-scheduled)
 *   source: 'booking' — ConsultationBooking rows (customers booking slots
 *                       on the storefront). These used to be invisible to
 *                       the admin entirely.
 *
 * Both are normalized to the same shape the admin page consumes. Booking
 * rows also carry meetingLink / customerEmail / customerPhone so the admin
 * can join the video call and contact the customer.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    // ── Source 1: admin-created consultations ──────────────────────
    const adminRows = await prisma.adminConsultation.findMany({
      where: status ? { status } : {},
      orderBy: { scheduledDate: 'desc' },
      include: { client: true },
    });

    const adminNormalized = adminRows.map((c) => ({
      source: 'admin' as const,
      id: c.id,
      consultId: c.consultId,
      clientId: c.clientId,
      clientName: c.clientName || c.client?.name || 'Walk-in',
      type: c.type || 'in_person',
      purpose: c.purpose || 'custom_design',
      scheduledDate: c.scheduledDate ? c.scheduledDate.toISOString().slice(0, 10) : '',
      scheduledTime: c.scheduledTime || '',
      duration: c.duration ?? 30,
      assignedTo: c.assignedTo || '',
      status: c.status || 'scheduled',
      preNotes: c.preNotes || '',
      sessionNotes: c.sessionNotes || '',
      outcome: c.outcome || '',
      followUpDate: c.followUpDate || '',
      aiSummary: c.aiSummary || '',
      meetingLink: '',
      customerEmail: c.client?.email || '',
      customerPhone: c.client?.phone || '',
      createdAt: c.createdAt,
    }));

    // ── Source 2: customer-initiated slot bookings ─────────────────
    // Explicit `select` (no include) so we only read columns guaranteed to
    // exist. callTranscript / callNotes were added to the schema later and
    // may not be in every deployed database yet — selecting them would 500
    // the whole endpoint. Wrapped in try/catch as a final safety net so a
    // booking-side failure never takes down the admin consultations page.
    let bookingRows: Array<{
      id: string;
      status: string;
      meetingLink: string | null;
      customerName: string | null;
      customerEmail: string | null;
      customerPhone: string | null;
      createdAt: Date;
      callTranscript: string | null;
      transcriptStatus: string | null;
      callSummary: string | null;
      callNotes: string | null;
      callRecordingUrl: string | null;
      callRecordingAt: Date | null;
      slot: { date: Date; startTime: string; type: string; duration: number } | null;
      consultation: { notes: string | null; user: { name: string | null; email: string | null } | null } | null;
    }> = [];
    try {
      bookingRows = await prisma.consultationBooking.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          meetingLink: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          createdAt: true,
          callTranscript: true,
          transcriptStatus: true,
          callSummary: true,
          callNotes: true,
          callRecordingUrl: true,
          callRecordingAt: true,
          slot: { select: { date: true, startTime: true, type: true, duration: true } },
          consultation: {
            select: {
              notes: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      });
    } catch (bookingErr) {
      console.error('[admin/consultations] booking query failed (continuing with admin rows only):', bookingErr);
    }

    const bookingNormalized = bookingRows.map((b) => {
      const slotDate = b.slot?.date ? b.slot.date.toISOString().slice(0, 10) : '';
      // Map booking status → the admin status vocabulary
      const statusMap: Record<string, string> = {
        confirmed: 'confirmed',
        cancelled: 'cancelled',
        completed: 'completed',
        no_show: 'no_show',
      };
      return {
        source: 'booking' as const,
        id: b.id,
        consultId: `BK-${b.id.slice(-6).toUpperCase()}`,
        clientId: null,
        clientName: b.customerName || b.consultation?.user?.name || 'Customer',
        type: b.slot?.type || 'virtual',
        purpose: 'custom_design',
        scheduledDate: slotDate,
        scheduledTime: b.slot?.startTime || '',
        duration: b.slot?.duration ?? 30,
        assignedTo: '',
        status: statusMap[b.status] || 'scheduled',
        preNotes: b.consultation?.notes || '',
        sessionNotes: b.callNotes || '',
        outcome: '',
        followUpDate: '',
        aiSummary: '',
        callTranscript: b.callTranscript || '',
        transcriptStatus: b.transcriptStatus || '',
        callSummary: b.callSummary || '',
        callRecordingUrl: b.callRecordingUrl || '',
        callRecordingAt: b.callRecordingAt ? b.callRecordingAt.toISOString() : '',
        meetingLink: b.meetingLink || '',
        customerEmail: b.customerEmail || b.consultation?.user?.email || '',
        customerPhone: b.customerPhone || '',
        createdAt: b.createdAt,
      };
    });

    // Merge + sort by scheduled date (newest first), then by created
    const merged = [...adminNormalized, ...bookingNormalized]
      .filter((c) => !status || c.status === status)
      .sort((a, b) => {
        const d = (b.scheduledDate || '').localeCompare(a.scheduledDate || '');
        if (d !== 0) return d;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    return NextResponse.json(merged);
  } catch (error) {
    console.error('Failed to fetch consultations:', error);
    return NextResponse.json({ error: 'Failed to fetch consultations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    // ── Validate required fields up front — clean 400, not a Prisma 500 ──
    if (!body.clientName?.trim()) {
      return NextResponse.json({ error: 'Client name is required.' }, { status: 400 });
    }
    if (!body.scheduledDate) {
      return NextResponse.json({ error: 'A consultation date is required.' }, { status: 400 });
    }
    const scheduledDate = new Date(body.scheduledDate);
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { error: `Invalid date: "${body.scheduledDate}". Use YYYY-MM-DD.` },
        { status: 400 }
      );
    }

    // Auto-generate consultId (tolerate non-numeric legacy IDs)
    const lastConsult = await prisma.adminConsultation.findFirst({
      orderBy: { consultId: 'desc' },
    });
    const lastNum = lastConsult ? parseInt(lastConsult.consultId.replace(/\D/g, ''), 10) : 0;
    const nextNum = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
    const consultId = `CON-${String(nextNum).padStart(3, '0')}`;

    const consultation = await prisma.adminConsultation.create({
      data: {
        consultId,
        clientId: body.clientId || null,
        clientName: body.clientName.trim(),
        type: body.type || 'virtual',
        purpose: body.purpose || null,
        scheduledDate,
        scheduledTime: body.scheduledTime || null,
        duration: Number(body.duration) || 30,
        status: body.status || 'scheduled',
        assignedTo: body.assignedTo || null,
        preNotes: body.preNotes || null,
        sessionNotes: body.sessionNotes || null,
        outcome: body.outcome || null,
        followUpDate: body.followUpDate || null,
        aiSummary: body.aiSummary || null,
      },
      include: { client: true },
    });

    return NextResponse.json(consultation, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to create consultation:', message);
    return NextResponse.json({ error: 'Failed to create consultation', detail: message }, { status: 500 });
  }
}
