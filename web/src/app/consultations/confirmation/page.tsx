'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface ConsultationDetails {
  id: string;
  date: string;
  status: string;
  notes: string | null;
}

function ConsultationConfirmationContent() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const consultationId = searchParams.get('consultationId');
  const isFree = searchParams.get('free') === 'true';
  const paymentIntentId = searchParams.get('payment_intent'); // Stripe redirect param

  const [consultation, setConsultation] = useState<ConsultationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!consultationId) {
      setError('No consultation ID provided.');
      setLoading(false);
      return;
    }

    const fetchConsultation = async () => {
      try {
        // If Stripe redirected here with a payment_intent, update payment status
        if (paymentIntentId) {
          await fetch('/api/payments/checkout', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentIntentId,
              status: 'succeeded',
            }),
          }).catch(() => {
            // Non-fatal — webhook handles this as fallback
          });
        }

        const res = await fetch(`/api/consultations?id=${consultationId}`);
        if (!res.ok) throw new Error('Consultation not found');
        const data = await res.json();
        setConsultation(data);
      } catch {
        setError('Unable to load your booking details. Your consultation has been confirmed.');
      } finally {
        setLoading(false);
      }
    };

    void fetchConsultation();
  }, [consultationId, paymentIntentId]);

  // ── Loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-center">
          <svg className="animate-spin w-8 h-8 text-[#1B2A5B] mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-[#8B7569]">Loading your booking…</p>
        </div>
      </div>
    );
  }

  // Parse notes to extract type and time
  const notesLines = consultation?.notes?.split('\n') ?? [];
  const typeLine = notesLines.find(l => l.startsWith('Type:'))?.replace('Type: ', '') ?? 'Consultation';
  const timeLine = notesLines.find(l => l.startsWith('Time:'))?.replace('Time: ', '') ?? '';

  const bookingDate = consultation?.date
    ? new Date(consultation.date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Date to be confirmed';

  const bookingRef = consultationId
    ? `#${consultationId.slice(-8).toUpperCase()}`
    : '';

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header */}
      <header className="border-b border-[rgba(27,42,91,0.08)] bg-white">
        <div className="max-w-[720px] mx-auto px-6 flex items-center justify-between h-14">
          <Link
            href="/"
            className="text-sm font-medium tracking-[0.15em] uppercase text-[#1B2A5B]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            AWULA K
          </Link>
          <Link href="/consults" className="text-xs text-[#8B7569] hover:text-[#1B2A5B] transition-colors">
            Book Another →
          </Link>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-6 py-12">

        {/* ── Success banner ──────────────────────────────── */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-full bg-[#22C55E] flex items-center justify-center mx-auto mb-6 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1
            style={{ fontFamily: 'var(--font-heading)' }}
            className="text-3xl md:text-4xl font-normal text-[#1B2A5B] mb-3"
          >
            Consultation Confirmed!
          </h1>
          <p className="text-base text-[#8B7569] leading-relaxed max-w-[480px] mx-auto">
            {isFree
              ? "Your free consultation has been booked. We're looking forward to meeting you!"
              : "Your payment was successful and your consultation is confirmed. We'll be in touch shortly."}
          </p>
        </div>

        {/* ── Booking details card ────────────────────────── */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden mb-6">
          {/* Booking header */}
          <div className="bg-[#1B2A5B] px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase text-white/60 mb-1">
                  Booking Reference
                </p>
                <p className="text-lg font-bold text-white font-mono">{bookingRef}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold tracking-[0.12em] uppercase text-white/60 mb-1">
                  Status
                </p>
                <span className="inline-flex items-center gap-1.5 bg-[#22C55E] text-white text-xs font-bold px-3 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  Confirmed
                </span>
              </div>
            </div>
          </div>

          {/* Consultation details */}
          <div className="p-6 border-b border-[#F0EBE3]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-4">
              Consultation Details
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#8B7569]">Type</span>
                <span className="text-[#1B2A5B] font-medium">{typeLine}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#8B7569]">Date</span>
                <span className="text-[#1B2A5B] font-medium">{bookingDate}</span>
              </div>
              {timeLine && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#8B7569]">Time</span>
                  <span className="text-[#1B2A5B] font-medium">{timeLine}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-[#8B7569]">Amount charged</span>
                <span className={`font-semibold ${isFree ? 'text-[#22C55E]' : 'text-[#1B2A5B]'}`}>
                  {isFree ? 'FREE' : '$40.00'}
                </span>
              </div>
            </div>
          </div>

          {/* What happens next */}
          <div className="p-6 bg-[#FAF7F2]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-4">
              What Happens Next
            </h3>
            <div className="space-y-3">
              {[
                {
                  step: '1',
                  title: 'Confirmation email',
                  desc: "You'll receive a booking confirmation with all the details at your email address.",
                },
                {
                  step: '2',
                  title: 'Calendar invite',
                  desc: "We'll send a calendar invite with a Zoom link (or atelier address for in-person sessions).",
                },
                {
                  step: '3',
                  title: 'Pre-consultation prep',
                  desc: "Our team will review your style profile and prepare personalized recommendations before your session.",
                },
                {
                  step: '4',
                  title: 'Your consultation',
                  desc: "Join at the scheduled time for a focused, personalized session with our founder.",
                },
              ].map(item => (
                <div key={item.step} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#1B2A5B] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {item.step}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#1B2A5B]">{item.title}</p>
                    <p className="text-xs text-[#8B7569] mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Error fallback */}
        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-6">
            <p className="text-sm font-semibold text-yellow-800 mb-1">Note</p>
            <p className="text-sm text-yellow-700">{error}</p>
          </div>
        )}

        {/* ── Action buttons ──────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/consults"
            className="flex-1 py-3.5 rounded-lg border-2 border-[#1B2A5B] text-[#1B2A5B] text-sm font-semibold text-center hover:bg-[#FAF7F2] transition-colors"
          >
            Book Another Consultation
          </Link>
          {session?.user ? (
            <Link
              href="/customer/dashboard"
              className="flex-1 py-3.5 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold text-center hover:bg-[#2D4A8C] transition-colors"
            >
              Go to My Dashboard
            </Link>
          ) : (
            <Link
              href="/auth/signup"
              className="flex-1 py-3.5 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold text-center hover:bg-[#2D4A8C] transition-colors"
            >
              Create an Account
            </Link>
          )}
        </div>

        {/* Brand message */}
        <div className="mt-10 text-center">
          <p className="text-sm text-[#8B7569] leading-relaxed">
            Thank you for choosing AWULA K. We look forward to crafting something extraordinary with you.
          </p>
          <div className="flex justify-center gap-4 mt-4">
            <a
              href="https://www.instagram.com/awula_k_/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#8B7569] hover:text-[#1B2A5B] transition-colors"
            >
              Follow us on Instagram →
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ConsultationConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
          <div className="text-center">
            <svg className="animate-spin w-8 h-8 text-[#1B2A5B] mx-auto mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-[#8B7569]">Loading confirmation…</p>
          </div>
        </div>
      }
    >
      <ConsultationConfirmationContent />
    </Suspense>
  );
}
