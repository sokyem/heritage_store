'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// ── Consultation type metadata ────────────────────────────────────

const CONSULTATION_TYPES: Record<string, { label: string; duration: number; description: string; icon: string }> = {
  'virtual-studio': {
    label: 'Virtual Studio',
    duration: 45,
    description: 'A live video session with our founder to discuss your vision, style goals, and custom design options.',
    icon: '🎥',
  },
  'in-person-fitting': {
    label: 'In-Person Fitting',
    duration: 60,
    description: 'Visit our atelier for a hands-on fitting experience with precise measurements and fabric selection.',
    icon: '📐',
  },
  'design-consultation': {
    label: 'Design Consultation',
    duration: 60,
    description: 'Deep-dive into your custom design concept — silhouettes, fabrics, embellishments, and timeline.',
    icon: '✏️',
  },
  'styling-session': {
    label: 'Styling Session',
    duration: 30,
    description: 'A focused session on styling, accessorizing, and putting together your complete look.',
    icon: '✨',
  },
};

// ── Stripe payment form ───────────────────────────────────────────

function StripePaymentForm({
  amount,
  consultationId,
  onSuccess,
}: {
  amount: number;
  consultationId: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'Please check your card details.');
      setLoading(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/consultations/confirmation?consultationId=${consultationId}`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed. Please try again.');
      setLoading(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      onSuccess();
    } else {
      setError('Payment could not be completed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement
        options={{
          layout: 'tabs',
          business: { name: 'AWULA K' },
        }}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full py-4 rounded-lg text-base font-semibold tracking-[0.04em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: loading ? '#9CA3AF' : '#1B2A5B',
          color: '#FAF7F2',
        }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Processing payment…
          </span>
        ) : (
          `Pay $${amount.toFixed(2)}`
        )}
      </button>

      <p className="text-xs text-[#8B7569] text-center flex items-center justify-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Secured by Stripe. Your card details never touch our servers.
      </p>
    </form>
  );
}

// ── Main checkout content ─────────────────────────────────────────

function ConsultationCheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Query params from /consults page
  const dateParam = searchParams.get('date') ?? '';
  const timeParam = searchParams.get('time') ?? '';
  const typeParam = searchParams.get('type') ?? 'virtual-studio';

  const consultationMeta = CONSULTATION_TYPES[typeParam] ?? CONSULTATION_TYPES['virtual-studio'];

  // Auth / guest state
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmailError, setGuestEmailError] = useState('');
  const [guestMode, setGuestMode] = useState(false);
  const [step, setStep] = useState<'account' | 'payment'>('account');

  // Booking state
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [isFirstConsultation, setIsFirstConsultation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current consultation pricing (admin-editable) for pre-booking display.
  const [standardPrice, setStandardPrice] = useState(40);
  const [firstFree, setFirstFree] = useState(false);

  useEffect(() => {
    fetch('/api/consultations/book')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.price === 'number') setStandardPrice(d.price);
        if (typeof d.firstConsultationFree === 'boolean') setFirstFree(d.firstConsultationFree);
      })
      .catch(() => {});
  }, []);

  const isSignedIn = authStatus === 'authenticated' && Boolean(session?.user);

  // Auto-advance signed-in users past the account step
  useEffect(() => {
    if (isSignedIn && step === 'account') {
      setStep('payment');
    }
  }, [isSignedIn, step]);

  // Initialize booking (create consultation + payment intent)
  const initializeBooking = async (email?: string, name?: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/consultations/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateParam,
          time: timeParam,
          type: typeParam,
          ...(email ? { guestEmail: email, guestName: name } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Include the server's detail (when present) so the real cause is visible
        const base = data.error || 'Failed to initialize booking';
        throw new Error(data.detail ? `${base} — ${data.detail}` : base);
      }

      setConsultationId(data.consultationId);
      setClientSecret(data.clientSecret ?? null);
      setAmount(data.amount);
      setIsFirstConsultation(data.isFirstConsultation);
      setStep('payment');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to initialize booking';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Trigger booking init when signed-in user reaches payment step
  useEffect(() => {
    if (isSignedIn && step === 'payment' && amount === null && !loading) {
      void initializeBooking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, step]);

  const validateGuestEmail = () => {
    if (!guestEmail.trim()) {
      setGuestEmailError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      setGuestEmailError('Please enter a valid email address');
      return false;
    }
    setGuestEmailError('');
    return true;
  };

  const handleGuestContinue = () => {
    if (!validateGuestEmail()) return;
    void initializeBooking(guestEmail.trim(), guestName.trim() || undefined);
  };

  const handleFreeBookingConfirm = () => {
    router.push(`/consultations/confirmation?consultationId=${consultationId}&free=true`);
  };

  const handlePaymentSuccess = () => {
    router.push(`/consultations/confirmation?consultationId=${consultationId}`);
  };

  // ── Stripe appearance ─────────────────────────────────────────
  const stripeAppearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#1B2A5B',
      colorBackground: '#FFFFFF',
      colorText: '#1B2A5B',
      colorDanger: '#C41E3A',
      fontFamily: 'DM Sans, system-ui, sans-serif',
      borderRadius: '8px',
      spacingUnit: '4px',
    },
    rules: {
      '.Input': {
        border: '1.5px solid #E5E7EB',
        boxShadow: 'none',
        padding: '12px',
      },
      '.Input:focus': {
        border: '1.5px solid #1B2A5B',
        boxShadow: '0 0 0 1px #1B2A5B',
      },
      '.Label': {
        fontWeight: '500',
        fontSize: '14px',
        marginBottom: '6px',
      },
    },
  };

  // Format date for display
  const displayDate = dateParam
    ? new Date(dateParam).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Date not specified';

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header */}
      <header className="border-b border-[rgba(27,42,91,0.08)] bg-white">
        <div className="max-w-[960px] mx-auto px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-sm font-medium tracking-[0.15em] uppercase text-[#1B2A5B]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              AWULA K
            </Link>
            <span className="text-xs text-[#8B7569]">/</span>
            <Link href="/consults" className="text-xs text-[#8B7569] hover:text-[#1B2A5B] transition-colors">
              Consultations
            </Link>
            <span className="text-xs text-[#8B7569]">/</span>
            <span className="text-sm text-[#1B2A5B]">Checkout</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#22C55E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-xs text-[#8B7569]">Secure checkout</span>
          </div>
        </div>
      </header>

      <main className="max-w-[960px] mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">

          {/* ── Left: checkout form ─────────────────────────── */}
          <div className="space-y-5">

            {/* Step 1: Account */}
            {step === 'account' && !isSignedIn && (
              <div className="space-y-4">
                {!guestMode ? (
                  <>
                    <div className="bg-white rounded-xl p-6 border-2 border-[#1B2A5B]">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-[#1B2A5B]">Sign in to your account</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-[#1B2A5B] text-white px-2 py-0.5 rounded">
                          Recommended
                        </span>
                      </div>
                      <p className="text-sm text-[#8B7569] mb-4">
                        Sign in to keep your consultation history and bookings in one place.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => signIn(undefined, { callbackUrl: '/consultations/checkout' })}
                          className="flex-1 py-2.5 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C] transition-colors"
                        >
                          Sign In
                        </button>
                        <Link
                          href="/auth/signup"
                          className="flex-1 py-2.5 rounded-lg border border-[#1B2A5B] text-[#1B2A5B] text-sm font-semibold text-center hover:bg-[#FAF7F2] transition-colors"
                        >
                          Create Account
                        </Link>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-px bg-[#E5E7EB]" />
                      <span className="text-xs text-[#8B7569]">or</span>
                      <div className="flex-1 h-px bg-[#E5E7EB]" />
                    </div>

                    <button
                      onClick={() => setGuestMode(true)}
                      className="w-full bg-white rounded-xl p-5 border border-[#E5E7EB] text-left hover:border-[#8B7569] transition-colors"
                    >
                      <h3 className="text-base font-semibold text-[#1B2A5B]">Continue as Guest</h3>
                      <p className="text-sm text-[#8B7569] mt-0.5">
                        No account needed — just enter your email to book your session.
                      </p>
                    </button>
                  </>
                ) : (
                  <div className="bg-white rounded-xl p-6 border border-[#E5E7EB]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-semibold text-[#1B2A5B]">Guest Checkout</h3>
                      <button
                        onClick={() => setGuestMode(false)}
                        className="text-xs text-[#8B7569] hover:text-[#1B2A5B] transition-colors"
                      >
                        ← Back
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-1.5">
                          Email Address <span className="text-[#C41E3A]">*</span>
                        </label>
                        <input
                          type="email"
                          value={guestEmail}
                          onChange={e => { setGuestEmail(e.target.value); setGuestEmailError(''); }}
                          placeholder="your@email.com"
                          className={`w-full text-sm border rounded-lg px-3 py-2.5 bg-white text-[#1B2A5B] focus:outline-none focus:ring-1 focus:ring-[#1B2A5B] transition-colors ${guestEmailError ? 'border-[#C41E3A]' : 'border-[#D1D5DB]'}`}
                        />
                        {guestEmailError && (
                          <p className="text-xs text-[#C41E3A] mt-0.5">{guestEmailError}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-1.5">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={guestName}
                          onChange={e => setGuestName(e.target.value)}
                          placeholder="Your full name (optional)"
                          className="w-full text-sm border border-[#D1D5DB] rounded-lg px-3 py-2.5 bg-white text-[#1B2A5B] focus:outline-none focus:ring-1 focus:ring-[#1B2A5B] transition-colors"
                        />
                      </div>
                      <button
                        onClick={handleGuestContinue}
                        disabled={loading}
                        className="w-full py-3 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Setting up booking…' : 'Continue to Booking'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Loading state */}
            {step === 'payment' && loading && (
              <div className="bg-white rounded-xl p-8 border border-[#E5E7EB] flex items-center justify-center gap-3">
                <svg className="animate-spin w-5 h-5 text-[#1B2A5B]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-[#8B7569]">Checking your consultation history…</p>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                <p className="text-sm font-semibold text-red-800 mb-1">Something went wrong</p>
                <p className="text-sm text-red-700">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-3 text-xs font-semibold text-red-700 underline hover:no-underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Step 2: Payment / Free confirmation */}
            {step === 'payment' && !loading && !error && amount !== null && (
              <div className="space-y-4">
                {/* Account confirmation bar */}
                {(isSignedIn || guestEmail) && (
                  <div className="bg-white rounded-xl p-4 border border-[#E5E7EB] flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#22C55E] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      ✓
                    </span>
                    <div>
                      <p className="text-xs text-[#8B7569]">Booking as</p>
                      <p className="text-sm font-medium text-[#1B2A5B]">
                        {isSignedIn ? session?.user?.email : guestEmail}
                      </p>
                    </div>
                  </div>
                )}

                {/* Free consultation */}
                {amount === 0 && (
                  <div className="bg-white rounded-xl p-6 border border-[#E5E7EB]">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-[#22C55E]/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-[#22C55E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[#1B2A5B]">Your first consultation is free!</h3>
                        <p className="text-sm text-[#8B7569]">No payment required — confirm your booking below.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleFreeBookingConfirm}
                      className="w-full py-4 rounded-lg text-base font-semibold tracking-[0.04em] transition-colors"
                      style={{ background: '#22C55E', color: '#fff' }}
                    >
                      Confirm Free Booking
                    </button>
                  </div>
                )}

                {/* Paid consultation — Stripe form */}
                {amount > 0 && clientSecret && stripePromise && (
                  <div className="bg-white rounded-xl p-6 border border-[#E5E7EB]">
                    <h3 className="text-base font-semibold text-[#1B2A5B] mb-5">Payment Details</h3>
                    <Elements
                      stripe={stripePromise}
                      options={{
                        clientSecret,
                        appearance: stripeAppearance,
                      }}
                    >
                      <StripePaymentForm
                        amount={amount}
                        consultationId={consultationId!}
                        onSuccess={handlePaymentSuccess}
                      />
                    </Elements>
                  </div>
                )}

                {/* Paid but Stripe not configured */}
                {amount > 0 && !clientSecret && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
                    <p className="text-sm font-semibold text-yellow-800">Card payments unavailable</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Online card payments are not configured. Please contact us to arrange payment for your consultation.
                    </p>
                    <button
                      onClick={handleFreeBookingConfirm}
                      className="mt-3 w-full py-3 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C] transition-colors"
                    >
                      Confirm Booking (Pay Later)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right: booking summary ──────────────────────── */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              <div className="p-5 border-b border-[#F0EBE3]">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A5B]">
                  Booking Summary
                </h3>
              </div>

              <div className="p-5 space-y-4">
                {/* Consultation type */}
                <div className="flex gap-3 items-start">
                  <div className="w-12 h-12 rounded-lg bg-[#F0EBE3] flex items-center justify-center flex-shrink-0 text-xl">
                    {consultationMeta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1B2A5B] leading-snug">
                      {consultationMeta.label}
                    </p>
                    <p className="text-xs text-[#8B7569] mt-0.5">
                      {consultationMeta.duration} min session
                    </p>
                  </div>
                </div>

                {/* Date & time */}
                <div className="pt-3 border-t border-[#F0EBE3] space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8B7569]">Date</span>
                    <span className="text-[#1B2A5B] font-medium text-right max-w-[180px]">{displayDate}</span>
                  </div>
                  {timeParam && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#8B7569]">Time</span>
                      <span className="text-[#1B2A5B] font-medium">{timeParam}</span>
                    </div>
                  )}
                </div>

                {/* Pricing */}
                <div className="pt-3 border-t border-[#F0EBE3] space-y-2">
                  {amount === null ? (
                    // Before booking is initialized — show standard price
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#8B7569]">Consultation fee</span>
                        <span className="text-[#1B2A5B]">${standardPrice.toFixed(2)}</span>
                      </div>
                      {firstFree && (
                        <div className="flex justify-between text-xs text-[#8B7569]">
                          <span>First consultation</span>
                          <span className="text-[#22C55E] font-medium">FREE</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#8B7569]">Consultation fee</span>
                        {isFirstConsultation ? (
                          <span className="line-through text-[#8B7569]">${standardPrice.toFixed(2)}</span>
                        ) : (
                          <span className="text-[#1B2A5B]">${standardPrice.toFixed(2)}</span>
                        )}
                      </div>
                      {isFirstConsultation && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[#22C55E] font-medium">First consultation discount</span>
                          <span className="text-[#22C55E] font-medium">−${standardPrice.toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Total */}
                <div className="pt-3 border-t border-[#1B2A5B]/10 flex justify-between">
                  <span className="text-base font-semibold text-[#1B2A5B]">Total</span>
                  <span className="text-lg font-bold text-[#1B2A5B]">
                    {amount === null
                      ? '—'
                      : amount === 0
                      ? 'FREE'
                      : `$${amount.toFixed(2)}`}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="bg-[#FAF7F2] p-4">
                <p className="text-xs text-[#8B7569] leading-relaxed">
                  {consultationMeta.description}
                </p>
              </div>
            </div>

            {/* First consultation callout */}
            {firstFree && (
            <div className="mt-4 bg-[#1B2A5B] rounded-xl p-4">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">
                New Customer Offer
              </p>
              <p className="text-sm text-white leading-relaxed">
                Your first consultation is completely free. Subsequent sessions are ${standardPrice.toFixed(2)} each.
              </p>
            </div>
            )}

            {/* Back link */}
            <div className="mt-4 text-center">
              <Link
                href="/consults"
                className="text-xs text-[#8B7569] hover:text-[#1B2A5B] transition-colors"
              >
                ← Back to consultations
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Page wrapper with Suspense ────────────────────────────────────

export default function ConsultationCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
          <div className="text-center">
            <svg className="animate-spin w-8 h-8 text-[#1B2A5B] mx-auto mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-[#8B7569]">Loading checkout…</p>
          </div>
        </div>
      }
    >
      <ConsultationCheckoutContent />
    </Suspense>
  );
}
