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
import { trackInitiateCheckout } from '@/lib/analytics';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// ── Types ─────────────────────────────────────────────────────────

interface CheckoutState {
  orderId: string | null;
  clientSecret: string | null;
  amount: number;
  subtotal: number;
  tax: number;
  taxRate: number;
  shipping: number;
  productName: string;
  productImage: string | null;
  error: string | null;
  loading: boolean;
}

// ── Inner payment form (must be inside <Elements>) ────────────────

function StripePaymentForm({
  amount,
  productName,
  orderId,
  onSuccess,
}: {
  amount: number;
  productName: string;
  orderId: string;
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

    // Validate the form fields first
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'Please check your card details.');
      setLoading(false);
      return;
    }

    // Confirm the payment
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/confirmation?orderId=${orderId}`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed. Please try again.');
      setLoading(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      // Notify our backend that payment succeeded
      try {
        await fetch('/api/payments/checkout', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: paymentIntent.id,
            status: 'succeeded',
          }),
        });
      } catch {
        // Non-fatal — webhook will handle this as a fallback
        console.warn('Failed to notify backend of payment success');
      }
      onSuccess();
    } else if (paymentIntent?.status === 'processing') {
      // Payment is processing — treat as success and let webhook confirm
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

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Query params
  const productId = searchParams.get('productId');
  const productName = searchParams.get('productName');
  const productImageParam = searchParams.get('productImage');
  const amountParam = searchParams.get('amount');
  const quantityParam = searchParams.get('quantity');
  // Per-item breakdown (qty / color / size / price) the cart builds for
  // multi-item orders. Must be forwarded so the admin can see what to pack.
  const notesParam = searchParams.get('notes');
  const customizationFeeParam = searchParams.get('customizationFee');

  // Guest info
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmailError, setGuestEmailError] = useState('');
  const [guestSubscribe, setGuestSubscribe] = useState(true);
  const [guestMode, setGuestMode] = useState(false);
  const [step, setStep] = useState<'account' | 'shipping' | 'payment'>('account');

  // Shipping address — collected BEFORE payment for every order so we
  // can always print a label and the customer always sees their address
  // on the Stripe receipt.
  const [shipping, setShipping] = useState({
    name: '',
    address: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    phone: '',
  });
  const [shippingErrors, setShippingErrors] = useState<Record<string, string>>({});

  // Checkout state
  const [checkout, setCheckout] = useState<CheckoutState>({
    orderId: null,
    clientSecret: null,
    amount: amountParam ? parseFloat(amountParam) : 0,
    subtotal: amountParam ? parseFloat(amountParam) : 0,
    tax: 0,
    taxRate: 0,
    shipping: 0,
    productName: productName || 'Your Order',
    productImage: null,
    error: null,
    loading: false,
  });

  // Seed image from URL param so it shows immediately (before API responds)
  useEffect(() => {
    if (productImageParam) {
      setCheckout((prev) => ({ ...prev, productImage: prev.productImage || productImageParam }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productImageParam]);

  // Fire the InitiateCheckout / begin_checkout ad event once we know what's
  // being bought (one product per checkout, driven by the URL params).
  useEffect(() => {
    if (!productId) return;
    const value = amountParam ? parseFloat(amountParam) : 0;
    trackInitiateCheckout(value, [
      {
        id: productId,
        name: productName || 'Your Order',
        price: value,
        quantity: quantityParam ? Math.max(1, parseInt(quantityParam, 10) || 1) : 1,
      },
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const isSignedIn = authStatus === 'authenticated' && Boolean(session?.user);

  // Auto-advance signed-in users past the account step to shipping
  useEffect(() => {
    if (isSignedIn && step === 'account') {
      // Prefill name from the session so they don't retype it
      setShipping((s) => ({ ...s, name: s.name || session?.user?.name || '' }));
      setStep('shipping');
    }
  }, [isSignedIn, step, session?.user?.name]);

  // Initialize checkout (create order + payment intent)
  // Now requires a complete shipping address — collected in the shipping step.
  const initializeCheckout = async (email?: string, name?: string) => {
    if (!productId && !productName) {
      setCheckout(prev => ({
        ...prev,
        error: 'No product specified. Please return to the shop and try again.',
      }));
      return;
    }

    setCheckout(prev => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(productId ? { productId } : {}),
          ...(productName ? { productName, amount: amountParam ? parseFloat(amountParam) : undefined } : {}),
          ...(notesParam ? { customNotes: notesParam } : {}),
          ...(customizationFeeParam ? { customizationFee: parseFloat(customizationFeeParam) } : {}),
          quantity: quantityParam ? parseInt(quantityParam, 10) : 1,
          ...(email ? { guestEmail: email, guestName: name } : {}),
          // Shipping address goes in EVERY request — server enforces required fields
          shippingName: shipping.name,
          shippingAddress: shipping.address,
          shippingAddress2: shipping.address2,
          shippingCity: shipping.city,
          shippingState: shipping.state,
          shippingZip: shipping.zip,
          shippingCountry: shipping.country,
          shippingPhone: shipping.phone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Price-changed shows the cleanest possible message — server already
        // formatted "Current price is $X" — so don't append the detail glob.
        if (res.status === 409 && data.code === 'price_changed') {
          throw new Error(data.error || 'The price has changed since you added this to your cart. Please refresh and try again.');
        }
        // Surface the underlying error detail (when the server provides it) so the user can act on it.
        const baseMessage = data.error || 'Failed to initialize checkout';
        const fullMessage = data.detail ? `${baseMessage} (${data.detail})` : baseMessage;
        throw new Error(fullMessage);
      }

      setCheckout({
        orderId: data.orderId,
        clientSecret: data.clientSecret,
        amount: data.amount,
        subtotal: typeof data.subtotal === 'number' ? data.subtotal : data.amount,
        shipping: typeof data.shipping === 'number' ? data.shipping : 0,
        tax: typeof data.tax === 'number' ? data.tax : 0,
        taxRate: typeof data.taxRate === 'number' ? data.taxRate : 0,
        productName: data.productName,
        productImage: data.productImage || null,
        error: null,
        loading: false,
      });
      setStep('payment');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to initialize checkout';
      setCheckout(prev => ({ ...prev, error: message, loading: false }));
    }
  };

  // Trigger checkout init when user reaches payment step (both signed-in
  // and guest paths land here only after submitting the shipping form).
  useEffect(() => {
    if (step === 'payment' && !checkout.clientSecret && !checkout.loading) {
      void initializeCheckout(
        !isSignedIn ? guestEmail : undefined,
        !isSignedIn ? guestName : undefined,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
    // Opt the guest into the mailing list (fire-and-forget — never block checkout).
    if (guestSubscribe) {
      void fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: guestEmail.trim(), name: guestName.trim() || undefined, source: 'checkout' }),
      }).catch(() => {});
    }
    // Prefill the shipping name with the guest's name so they don't retype it
    if (!shipping.name && guestName.trim()) {
      setShipping((s) => ({ ...s, name: guestName.trim() }));
    }
    setStep('shipping');
  };

  // Validate + advance from shipping step to payment
  const handleShippingSubmit = () => {
    const errs: Record<string, string> = {};
    if (!shipping.name.trim()) errs.name = 'Full name is required';
    if (!shipping.address.trim()) errs.address = 'Street address is required';
    if (!shipping.city.trim()) errs.city = 'City is required';
    if (!shipping.state.trim()) errs.state = 'State is required';
    if (!shipping.zip.trim()) errs.zip = 'ZIP code is required';
    if (!shipping.country.trim()) errs.country = 'Country is required';
    setShippingErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setStep('payment');
  };

  const handlePaymentSuccess = () => {
    router.push(`/checkout/confirmation?orderId=${checkout.orderId}`);
  };

  // ── Stripe appearance ─────────────────────────────────────────
  const stripeAppearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#1B2A5B',
      colorBackground: '#FFFFFF',
      colorText: '#1B2A5B',
      colorDanger: '#EF4444',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      borderRadius: '8px',
      spacingUnit: '4px',
    },
    rules: {
      '.Input': {
        border: '1px solid #D1D5DB',
        boxShadow: 'none',
        padding: '12px 16px',
      },
      '.Input:focus': {
        border: '2px solid #1B2A5B',
        boxShadow: 'none',
      },
      '.Label': {
        fontWeight: '500',
        fontSize: '13px',
        marginBottom: '8px',
      },
    },
  };

  const quantity = quantityParam ? parseInt(quantityParam, 10) : 1;
  const displayAmount = checkout.amount || (amountParam ? parseFloat(amountParam) : 0);
  const displayName = checkout.productName || productName || 'Your Order';

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-[#E5E7EB] bg-white sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-xl font-semibold tracking-[0.08em] uppercase text-[#1B2A5B]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            AWULA K
          </Link>
          <div className="flex items-center gap-2 text-xs text-[#8B7569]">
            <svg className="w-4 h-4 text-[#22C55E]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 111.414 1.414L7.414 9l3.293 3.293a1 1 0 01-1.414 1.414l-4-4z" clipRule="evenodd" />
            </svg>
            Secure checkout
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-12">

          {/* ── Left: Main content (2 cols) ─────────────────────────── */}
          <div className="lg:col-span-2 space-y-8">

            {/* No product error */}
            {!productId && !productName && (
              <div className="bg-[#FEF3E2] border border-[#FCD34D] rounded-lg p-8 text-center">
                <p className="text-lg font-semibold text-[#78350F] mb-2">No product selected</p>
                <p className="text-sm text-[#92400E] mb-6">
                  Please browse our collections and select a product to purchase.
                </p>
                <Link href="/collections" className="inline-block bg-[#1B2A5B] text-white px-8 py-3 rounded-lg text-sm font-semibold hover:bg-[#2D4A8C] transition-colors">
                  Browse Collections
                </Link>
              </div>
            )}

            {/* Step 1: Account */}
            {(productId || productName) && step === 'account' && !isSignedIn && (
              <div className="space-y-5 animate-fade-in">
                {!guestMode ? (
                  <>
                    {/* Sign in option */}
                    <div className="bg-white border-2 border-[#1B2A5B] rounded-lg p-8">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-[#1B2A5B]">Sign in to your account</h3>
                        <span className="text-[11px] font-bold uppercase tracking-wide bg-[#1B2A5B] text-white px-2.5 py-1 rounded-full">
                          Recommended
                        </span>
                      </div>
                      <p className="text-sm text-[#6B7280] mb-6">
                        Track your order, save your details, and get personalized recommendations.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => signIn(undefined, { callbackUrl: '/checkout' })}
                          className="flex-1 py-3 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C] transition-colors"
                        >
                          Sign In
                        </button>
                        <Link
                          href="/auth/signup"
                          className="flex-1 py-3 rounded-lg border border-[#1B2A5B] text-[#1B2A5B] text-sm font-semibold text-center hover:bg-[#FAF7F2] transition-colors"
                        >
                          Create Account
                        </Link>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-px bg-[#E5E7EB]" />
                      <span className="text-xs text-[#9CA3AF]">or</span>
                      <div className="flex-1 h-px bg-[#E5E7EB]" />
                    </div>

                    {/* Guest option */}
                    <button
                      onClick={() => setGuestMode(true)}
                      className="w-full bg-white rounded-lg p-6 border border-[#E5E7EB] text-left hover:border-[#D1D5DB] transition-all hover:shadow-sm"
                    >
                      <h3 className="text-base font-semibold text-[#1B2A5B]">Continue as Guest</h3>
                      <p className="text-sm text-[#6B7280] mt-1">
                        No account needed. We&apos;ll email your receipt.
                      </p>
                    </button>
                  </>
                ) : (
                  /* Guest email form */
                  <div className="bg-white rounded-lg p-8 border border-[#E5E7EB]">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-[#1B2A5B]">Guest Checkout</h3>
                      <button
                        onClick={() => setGuestMode(false)}
                        className="text-sm text-[#6B7280] hover:text-[#1B2A5B] transition-colors"
                      >
                        ← Back
                      </button>
                    </div>
                    <div className="space-y-5">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">
                          Email Address <span className="text-[#EF4444]">*</span>
                        </label>
                        <input
                          type="email"
                          value={guestEmail}
                          onChange={e => { setGuestEmail(e.target.value); setGuestEmailError(''); }}
                          placeholder="your@email.com"
                          className={`w-full text-sm border rounded-lg px-4 py-3 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B] focus:ring-offset-0 transition-all ${guestEmailError ? 'border-[#EF4444]' : 'border-[#D1D5DB]'}`}
                        />
                        {guestEmailError && (
                          <p className="text-xs text-[#EF4444] mt-1.5">{guestEmailError}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={guestName}
                          onChange={e => setGuestName(e.target.value)}
                          placeholder="Your full name (optional)"
                          className="w-full text-sm border border-[#D1D5DB] rounded-lg px-4 py-3 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B] focus:ring-offset-0 transition-all"
                        />
                      </div>
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={guestSubscribe}
                          onChange={e => setGuestSubscribe(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-[#D1D5DB] text-[#1B2A5B] focus:ring-[#1B2A5B]"
                        />
                        <span className="text-sm text-[#6B7280] leading-snug">
                          Email me about new arrivals, restocks &amp; exclusive offers. You can unsubscribe anytime.
                        </span>
                      </label>
                      <button
                        onClick={handleGuestContinue}
                        disabled={checkout.loading}
                        className="w-full py-3 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {checkout.loading ? 'Setting up checkout…' : 'Continue to Shipping →'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Shipping Address ───────────────────────────── */}
            {(productId || productName) && step === 'shipping' && (
              <div className="space-y-5 animate-fade-in">
                <div className="bg-white rounded-lg p-6 sm:p-8 border border-[#E5E7EB]">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-semibold text-[#1B2A5B]">Shipping Address</h3>
                    <button
                      onClick={() => setStep('account')}
                      className="text-xs text-[#6B7280] hover:text-[#1B2A5B] transition-colors"
                      type="button"
                    >
                      ← Back
                    </button>
                  </div>
                  <p className="text-sm text-[#6B7280] mb-6">
                    Where should we ship your order? <span className="text-[#EF4444]">*</span> required
                  </p>

                  <div className="grid gap-4">
                    {/* Full name */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">
                        Full Name <span className="text-[#EF4444]">*</span>
                      </label>
                      <input
                        type="text"
                        value={shipping.name}
                        onChange={(e) => setShipping((s) => ({ ...s, name: e.target.value }))}
                        placeholder="Jane Doe"
                        className={`w-full text-sm border rounded-lg px-4 py-3 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B] ${shippingErrors.name ? 'border-[#EF4444]' : 'border-[#D1D5DB]'}`}
                      />
                      {shippingErrors.name && <p className="text-xs text-[#EF4444] mt-1.5">{shippingErrors.name}</p>}
                    </div>

                    {/* Street address */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">
                        Street Address <span className="text-[#EF4444]">*</span>
                      </label>
                      <input
                        type="text"
                        value={shipping.address}
                        onChange={(e) => setShipping((s) => ({ ...s, address: e.target.value }))}
                        placeholder="123 Main St"
                        autoComplete="address-line1"
                        className={`w-full text-sm border rounded-lg px-4 py-3 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B] ${shippingErrors.address ? 'border-[#EF4444]' : 'border-[#D1D5DB]'}`}
                      />
                      {shippingErrors.address && <p className="text-xs text-[#EF4444] mt-1.5">{shippingErrors.address}</p>}
                    </div>

                    {/* Apartment / suite (optional) */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">
                        Apartment / Suite (optional)
                      </label>
                      <input
                        type="text"
                        value={shipping.address2}
                        onChange={(e) => setShipping((s) => ({ ...s, address2: e.target.value }))}
                        placeholder="Apt 4B"
                        autoComplete="address-line2"
                        className="w-full text-sm border border-[#D1D5DB] rounded-lg px-4 py-3 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]"
                      />
                    </div>

                    {/* City + State + ZIP */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">
                          City <span className="text-[#EF4444]">*</span>
                        </label>
                        <input
                          type="text"
                          value={shipping.city}
                          onChange={(e) => setShipping((s) => ({ ...s, city: e.target.value }))}
                          placeholder="Boston"
                          autoComplete="address-level2"
                          className={`w-full text-sm border rounded-lg px-4 py-3 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B] ${shippingErrors.city ? 'border-[#EF4444]' : 'border-[#D1D5DB]'}`}
                        />
                        {shippingErrors.city && <p className="text-xs text-[#EF4444] mt-1.5">{shippingErrors.city}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">
                          State <span className="text-[#EF4444]">*</span>
                        </label>
                        <input
                          type="text"
                          value={shipping.state}
                          onChange={(e) => setShipping((s) => ({ ...s, state: e.target.value.toUpperCase() }))}
                          placeholder="MA"
                          maxLength={3}
                          autoComplete="address-level1"
                          className={`w-20 text-sm border rounded-lg px-4 py-3 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B] ${shippingErrors.state ? 'border-[#EF4444]' : 'border-[#D1D5DB]'}`}
                        />
                        {shippingErrors.state && <p className="text-xs text-[#EF4444] mt-1.5">{shippingErrors.state}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">
                          ZIP <span className="text-[#EF4444]">*</span>
                        </label>
                        <input
                          type="text"
                          value={shipping.zip}
                          onChange={(e) => setShipping((s) => ({ ...s, zip: e.target.value }))}
                          placeholder="02101"
                          autoComplete="postal-code"
                          className={`w-28 text-sm border rounded-lg px-4 py-3 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B] ${shippingErrors.zip ? 'border-[#EF4444]' : 'border-[#D1D5DB]'}`}
                        />
                        {shippingErrors.zip && <p className="text-xs text-[#EF4444] mt-1.5">{shippingErrors.zip}</p>}
                      </div>
                    </div>

                    {/* Country + Phone */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">
                          Country <span className="text-[#EF4444]">*</span>
                        </label>
                        <select
                          value={shipping.country}
                          onChange={(e) => setShipping((s) => ({ ...s, country: e.target.value }))}
                          className="w-full text-sm border border-[#D1D5DB] rounded-lg px-4 py-3 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]"
                        >
                          <option value="US">United States</option>
                          <option value="CA">Canada</option>
                          <option value="GB">United Kingdom</option>
                          <option value="GH">Ghana</option>
                          <option value="NG">Nigeria</option>
                          <option value="KE">Kenya</option>
                          <option value="ZA">South Africa</option>
                          <option value="AU">Australia</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-2">
                          Phone (optional)
                        </label>
                        <input
                          type="tel"
                          value={shipping.phone}
                          onChange={(e) => setShipping((s) => ({ ...s, phone: e.target.value }))}
                          placeholder="+1 555 123 4567"
                          autoComplete="tel"
                          className="w-full text-sm border border-[#D1D5DB] rounded-lg px-4 py-3 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleShippingSubmit}
                      className="w-full mt-3 py-3 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C] transition-colors"
                    >
                      Continue to Payment →
                    </button>

                    <p className="text-xs text-[#6B7280] text-center -mt-1">
                      💡 You won't be charged until the next step
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading state */}
            {step === 'payment' && checkout.loading && (
              <div className="bg-white rounded-lg p-12 border border-[#E5E7EB] flex items-center justify-center gap-3">
                <svg className="animate-spin w-5 h-5 text-[#1B2A5B]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-[#6B7280]">Initializing secure payment…</p>
              </div>
            )}

            {/* Error state */}
            {checkout.error && (
              <div className="bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg p-6">
                <p className="text-sm font-semibold text-[#991B1B] mb-2">Something went wrong</p>
                <p className="text-sm text-[#7F1D1D]">{checkout.error}</p>
                <button
                  onClick={() => setCheckout(prev => ({ ...prev, error: null }))}
                  className="mt-4 text-xs font-semibold text-[#991B1B] underline hover:no-underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Step 3: Payment form */}
            {step === 'payment' && !checkout.loading && !checkout.error && checkout.clientSecret && stripePromise && (
              <div className="animate-fade-in space-y-4">
                {/* Account + Shipping confirmation bar — customer can edit before paying */}
                {(isSignedIn || guestEmail) && (
                  <div className="bg-[#F0FDF4] rounded-lg p-4 border border-[#BBDBF7] flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#22C55E] text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      ✓
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#6B7280]">Ordering as</p>
                      <p className="text-sm font-medium text-[#1B2A5B] truncate">
                        {isSignedIn ? session?.user?.email : guestEmail}
                      </p>
                    </div>
                  </div>
                )}

                {/* Shipping summary with edit link */}
                <div className="bg-white rounded-lg p-4 border border-[#E5E7EB] flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#1B2A5B] text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    📦
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#6B7280]">Ship to</p>
                    <p className="text-sm font-medium text-[#1B2A5B] leading-snug">
                      {shipping.name}
                    </p>
                    <p className="text-xs text-[#6B7280] leading-snug">
                      {shipping.address}{shipping.address2 ? `, ${shipping.address2}` : ''}, {shipping.city}, {shipping.state} {shipping.zip}, {shipping.country}
                      {shipping.phone ? ` · ${shipping.phone}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setCheckout((c) => ({ ...c, clientSecret: null, orderId: null }));
                      setStep('shipping');
                    }}
                    className="text-xs font-semibold text-[#1B2A5B] hover:text-[#C41E3A] shrink-0"
                  >
                    Edit
                  </button>
                </div>

                {/* Spacer placeholder kept for backward compatibility of layout */}
                {false && (
                  <div className="hidden">spacer</div>
                )}

                {/* Stripe payment form */}
                <div className="bg-white rounded-lg p-8 border border-[#E5E7EB]">
                  <h3 className="text-lg font-semibold text-[#1B2A5B] mb-6">Payment Details</h3>
                  <Elements
                    stripe={stripePromise}
                    options={{
                      clientSecret: checkout.clientSecret,
                      appearance: stripeAppearance,
                    }}
                  >
                    <StripePaymentForm
                      amount={checkout.amount}
                      productName={checkout.productName}
                      orderId={checkout.orderId!}
                      onSuccess={handlePaymentSuccess}
                    />
                  </Elements>
                </div>
              </div>
            )}

            {/* Stripe not configured */}
            {step === 'payment' && !checkout.loading && !checkout.error && !stripePromise && (
              <div className="bg-[#FEF3E2] border border-[#FCD34D] rounded-lg p-6">
                <p className="text-sm font-semibold text-[#78350F]">Card payments unavailable</p>
                <p className="text-sm text-[#92400E] mt-2">
                  Online card payments are not configured. Please contact us to arrange payment.
                </p>
              </div>
            )}
          </div>

          {/* ── Right: order summary ────────────────────────── */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="bg-[#F9FAFB] rounded-lg border border-[#E5E7EB] overflow-hidden">
              <div className="p-6 border-b border-[#E5E7EB]">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[#1B2A5B]">
                  Order Summary
                </h3>
              </div>

              <div className="p-6 space-y-5">
                {/* Product Card */}
                <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row gap-4 p-4">
                    {/* Product Image */}
                    <div className="flex-shrink-0">
                      {checkout.productImage && checkout.productImage !== 'null' ? (
                        <div
                          className="w-28 h-32 rounded-lg bg-gradient-to-br from-[#F3F4F6] to-[#E5E7EB] bg-cover bg-center shadow-sm"
                          style={{
                            backgroundImage: `url(${checkout.productImage})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                          role="img"
                          aria-label={displayName}
                        />
                      ) : (
                        <div className="w-28 h-32 rounded-lg bg-gradient-to-br from-[#F3F4F6] to-[#E5E7EB] flex items-center justify-center shadow-sm border-2 border-dashed border-[#D1D5DB]">
                          <div className="text-center">
                            <svg className="w-8 h-8 text-[#9CA3AF] mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-xs text-[#6B7280] font-medium">Image unavailable</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#1B2A5B] leading-snug mb-2">{displayName}</p>
                        {quantity > 1 && (
                          <p className="text-xs text-[#6B7280] mb-3">
                            <span className="font-medium text-[#1B2A5B]">{quantity}</span> {quantity === 1 ? 'item' : 'items'}
                          </p>
                        )}
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#F0FDF4] rounded text-xs font-medium text-[#15803D] border border-[#BBDBF7]">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          In Stock
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#6B7280] mb-1">Subtotal</p>
                        <p className="text-lg font-bold text-[#1B2A5B]">${displayAmount.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pricing breakdown */}
                {displayAmount > 0 && (
                  <div className="pt-5 border-t border-[#E5E7EB] space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6B7280] font-normal">Subtotal</span>
                      <span className="text-[#1B2A5B] font-semibold">${(checkout.subtotal || displayAmount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6B7280] font-normal">Shipping</span>
                      {!checkout.clientSecret ? (
                        <span className="text-[#6B7280] text-xs">Calculated at checkout</span>
                      ) : checkout.shipping > 0 ? (
                        <span className="text-[#1B2A5B] font-semibold">${checkout.shipping.toFixed(2)}</span>
                      ) : (
                        <span className="text-[#10B981] font-semibold text-xs">FREE</span>
                      )}
                    </div>
                    {checkout.clientSecret && checkout.shipping > 0 && (
                      <p className="text-xs text-[#6B7280] -mt-1.5">International shipping surcharge — domestic shipping is on us.</p>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6B7280] font-normal">
                        Tax{checkout.taxRate > 0 ? ` (${checkout.taxRate}%)` : ''}
                      </span>
                      {checkout.clientSecret ? (
                        <span className="text-[#1B2A5B] font-semibold">${checkout.tax.toFixed(2)}</span>
                      ) : (
                        <span className="text-[#6B7280] text-xs">Calculated at checkout</span>
                      )}
                    </div>
                  </div>
                )}

                {displayAmount > 0 && (
                  <div className="mt-5 pt-5 border-t-2 border-[#1B2A5B] flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-[#1B2A5B] uppercase tracking-wide">Total</span>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-[#1B2A5B] leading-none">${displayAmount.toFixed(2)}</p>
                      {checkout.tax > 0 ? (
                        <p className="text-xs text-[#6B7280] mt-1">Includes ${checkout.tax.toFixed(2)} tax</p>
                      ) : (
                        <p className="text-xs text-[#6B7280] mt-1">Including estimated tax</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Trust badges */}
              <div className="bg-gradient-to-b from-[#F9FAFB] to-white p-6 space-y-2.5 border-t border-[#E5E7EB]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280] mb-4">Why buy from us</p>
                {[
                  {
                    icon: (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    ),
                    text: 'SSL encrypted & secure',
                    color: 'text-[#0EA5E9]',
                  },
                  {
                    icon: (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                    ),
                    text: 'Free shipping on all orders',
                    color: 'text-[#10B981]',
                  },
                  {
                    icon: (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m7 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ),
                    text: '14-day hassle-free returns',
                    color: 'text-[#8B5CF6]',
                  },
                ].map(b => (
                  <div key={b.text} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#F3F4F6] transition-colors">
                    <div className={`flex-shrink-0 ${b.color}`}>{b.icon}</div>
                    <span className="text-xs font-medium text-[#6B7280]">{b.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Back to shop */}
            <div className="mt-4 text-center">
              <Link
                href="/collections"
                className="text-xs text-[#6B7280] hover:text-[#1B2A5B] transition-colors"
              >
                ← Continue shopping
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Page wrapper with Suspense ────────────────────────────────────

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
          <div className="text-center">
            <div className="loading-spinner mx-auto mb-3" />
            <p className="text-sm text-[#8B7569]">Loading checkout…</p>
          </div>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
