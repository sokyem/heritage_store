import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getSetting } from '@/lib/settings';
import { createDailyRoom } from '@/lib/daily';
import { sendConsultationConfirmationEmail } from '@/lib/email';
import { alertAdmins } from '@/lib/admin-alerts';

const CONSULTATION_TYPES: Record<string, { label: string; duration: number; slotType: string }> = {
  'virtual-studio':       { label: 'Virtual Studio',      duration: 45, slotType: 'virtual' },
  'in-person-fitting':    { label: 'In-Person Fitting',   duration: 60, slotType: 'in_person' },
  'design-consultation':  { label: 'Design Consultation', duration: 60, slotType: 'virtual' },
  'styling-session':      { label: 'Styling Session',     duration: 30, slotType: 'virtual' },
};

// Convert "10:00 AM" / "2:30 PM" / "14:30" into a 24h "HH:MM" string.
// Returns null when the input is unparseable so the caller can fall back.
function to24h(time: string): string | null {
  if (!time) return null;
  const trimmed = String(time).trim();
  // Already 24h ("HH:MM")
  const m24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Math.min(23, Math.max(0, parseInt(m24[1], 10)));
    return `${String(h).padStart(2, '0')}:${m24[2]}`;
  }
  // 12h with AM/PM
  const m12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (m12) {
    let h = parseInt(m12[1], 10) % 12;
    if (m12[3].toLowerCase() === 'pm') h += 12;
    return `${String(h).padStart(2, '0')}:${m12[2]}`;
  }
  return null;
}

function addMinutesHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * GET /api/consultations/book
 *
 * Public — returns the current consultation pricing so the checkout page
 * can display it before a booking is initialized.
 */
export async function GET() {
  try {
    const scheduling = await getSetting('scheduling');
    return NextResponse.json({
      price: scheduling.consultationPrice,
      firstConsultationFree: scheduling.firstConsultationFree,
    });
  } catch {
    return NextResponse.json({ price: 40, firstConsultationFree: false });
  }
}

/**
 * POST /api/consultations/book
 *
 * Creates a consultation booking and a Stripe Payment Intent.
 * First-time customers pay $0; returning customers pay $40.
 *
 * Body:
 *   date         — ISO date string for the consultation
 *   time         — time string, e.g. "10:00 AM"
 *   type         — consultation type key (e.g. "virtual-studio")
 *   guestEmail?  — required for unauthenticated users
 *   guestName?   — optional display name for guest
 *   notes?       — optional booking notes
 *
 * Returns:
 *   { consultationId, clientSecret | null, amount, isFirstConsultation, consultationType }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    const {
      date,
      time,
      type = 'virtual-studio',
      guestEmail,
      guestName,
      notes,
    } = body;

    if (!date || !time) {
      return NextResponse.json(
        { error: 'date and time are required' },
        { status: 400 }
      );
    }

    const consultationType = CONSULTATION_TYPES[type] ?? CONSULTATION_TYPES['virtual-studio'];

    // ── Resolve user ──────────────────────────────────────────────
    let user;

    if (session?.user?.email) {
      user = await prisma.user.findUnique({ where: { email: session.user.email } });
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    } else if (guestEmail) {
      const normalizedEmail = String(guestEmail).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
      }
      user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            name: guestName ? String(guestName).trim() : 'Guest',
            role: 'customer',
          },
        });
      }
    } else {
      return NextResponse.json(
        { error: 'Sign in or provide an email address to book a consultation' },
        { status: 401 }
      );
    }

    // ── Check if this is the user's first consultation ────────────
    const existingConsultationCount = await prisma.consultation.count({
      where: { userId: user.id },
    });

    // Pricing comes from admin Settings → Scheduling (editable, no redeploy).
    const scheduling = await getSetting('scheduling');
    const isFirstConsultation = existingConsultationCount === 0;
    const amount =
      isFirstConsultation && scheduling.firstConsultationFree
        ? 0
        : scheduling.consultationPrice;

    // ── Provision a video room ────────────────────────────────────
    // Every consultation gets a no-login Daily room link up front so the
    // customer can see it on their dashboard the moment the booking is
    // confirmed. Falls back to null if Daily is unconfigured/unreachable —
    // booking must never fail over video provisioning.
    const dailyRoom = await createDailyRoom({ expiresInDays: 60 });
    const meetingLink = dailyRoom?.url ?? null;

    // ── Create consultation record ────────────────────────────────
    const consultation = await prisma.consultation.create({
      data: {
        userId: user.id,
        date: new Date(date),
        notes: [
          `Type: ${consultationType.label}`,
          `Time: ${time}`,
          notes ? `Notes: ${notes}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        status: amount === 0 ? 'scheduled' : 'pending_payment',
        analysisStatus: 'pending',
        meetingLink,
      },
    });

    // ── Make the booking visible to the admin ─────────────────────
    // The admin consultations page reads ConsultationBooking + ConsultationSlot.
    // Paid checkout used to only write the Consultation row, so admins never
    // saw paid bookings. Provision a one-off slot + a booking that links to
    // the consultation so the admin's unified list picks it up immediately.
    try {
      const startTime = to24h(time) || '09:00';
      const endTime = addMinutesHHMM(startTime, consultationType.duration);
      const slot = await prisma.consultationSlot.create({
        data: {
          date: new Date(date),
          startTime,
          endTime,
          duration: consultationType.duration,
          type: consultationType.slotType,
          isAvailable: false, // one-off slot reserved for this booking
          maxBookings: 1,
          notes: `Auto-created for paid booking ${consultation.id}`,
        },
      });
      await prisma.consultationBooking.create({
        data: {
          slotId: slot.id,
          consultationId: consultation.id,
          userId: user.id,
          customerName: user.name || guestName || null,
          customerEmail: user.email || null,
          meetingLink,
          status: amount === 0 ? 'confirmed' : 'pending_payment',
        },
      });
    } catch (bookingErr) {
      // Booking-row creation is best-effort — failing here must not block
      // the customer's checkout. The admin endpoint already tolerates a
      // missing booking by reading Consultation directly via /admin/consultations.
      console.error('[CONSULTATION_BOOK] failed to create admin-visible booking row:', bookingErr);
    }

    // ── Alert the team (in-app + SMS + email) ─────────────────────
    // Mirrors new-order alerts so a booking is never missed. Best-effort.
    alertAdmins({
      type: 'new_consultation',
      title: 'New consultation booked',
      message: `${user.name || guestName || user.email || 'A client'} booked a ${consultationType.label} on ${date} at ${time}${amount > 0 ? ` ($${amount})` : ' — free'}.`,
      relatedId: consultation.id,
      path: '/admin/services/consultations',
    }).catch((err) => console.error('[CONSULTATION_BOOK] admin alert failed:', err));

    // ── Free consultation — no Stripe needed ──────────────────────
    if (amount === 0) {
      // Free bookings are confirmed immediately, so send the confirmation
      // email now. Paid bookings send theirs from the Stripe webhook once
      // payment succeeds. Best-effort — must never block the booking response.
      if (user.email) {
        try {
          await sendConsultationConfirmationEmail({
            to: user.email,
            name: user.name || guestName || null,
            date: new Date(date),
            time,
            type: consultationType.label,
            duration: consultationType.duration,
            bookingRef: `BK-${consultation.id.slice(-6).toUpperCase()}`,
            meetingLink,
          });
        } catch (err) {
          console.error('[CONSULTATION_BOOK] confirmation email failed:', err);
        }
      }
      return NextResponse.json({
        consultationId: consultation.id,
        clientSecret: null,
        amount: 0,
        isFirstConsultation: true,
        consultationType: consultationType.label,
        duration: consultationType.duration,
      });
    }

    // ── Paid consultation — create Stripe Payment Intent ──────────
    if (!isStripeConfigured()) {
      // Stripe not configured — still confirm the booking without payment
      return NextResponse.json({
        consultationId: consultation.id,
        clientSecret: null,
        amount,
        isFirstConsultation: false,
        consultationType: consultationType.label,
        duration: consultationType.duration,
        stripeUnavailable: true,
      });
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe expects cents
      currency: 'usd',
      metadata: {
        consultationId: consultation.id,
        userId: user.id,
        consultationType: consultationType.label,
        date,
        time,
      },
      description: `AWULA K — ${consultationType.label} Consultation`,
      automatic_payment_methods: { enabled: true },
    });

    // ── Persist payment record ────────────────────────────────────
    await prisma.payment.create({
      data: {
        userId: user.id,
        amount,
        currency: 'USD',
        status: 'pending',
        paymentMethod: 'stripe',
        stripePaymentIntentId: paymentIntent.id,
        stripeClientSecret: paymentIntent.client_secret,
        description: `Consultation: ${consultationType.label}`,
      },
    });

    return NextResponse.json({
      consultationId: consultation.id,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount,
      isFirstConsultation: false,
      consultationType: consultationType.label,
      duration: consultationType.duration,
    });
  } catch (error) {
    // Surface the real error so it's visible in Railway logs AND the UI.
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[CONSULTATION_BOOK_ERROR]', { message, stack });

    // Context-aware hints based on common failure shapes
    let hint = 'Failed to initialize consultation booking. Please try again.';
    if (/Invalid API Key|No such api key|Authentication/i.test(message)) {
      hint = 'Stripe key is invalid — check STRIPE_SECRET_KEY in Railway.';
    } else if (/connect ECONNREFUSED|database|Prisma|P10\d\d|P20\d\d/i.test(message)) {
      hint = 'Database connection issue. Please try again in a moment.';
    } else if (/relation .* does not exist|column .* does not exist/i.test(message)) {
      hint = 'Database schema is out of date — run a schema sync.';
    } else if (/Invalid time value|Invalid Date/i.test(message)) {
      hint = 'The selected date/time could not be read. Please pick the slot again.';
    }

    return NextResponse.json({ error: hint, detail: message }, { status: 500 });
  }
}
