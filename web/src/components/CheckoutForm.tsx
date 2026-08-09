'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { showSuccessToast, showErrorToast } from './Toast';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

interface CheckoutFormProps {
  orderId: string;
  amount: number;
  productName: string;
  guestEmail?: string;
  guestName?: string;
  initialProvider?: 'stripe' | 'paypal';
  onSuccess?: () => void;
}

// Inner form that uses Stripe hooks (must be inside <Elements>)
function PaymentForm({ amount, productName, onSuccess }: { amount: number; productName: string; onSuccess?: () => void }) {
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
      setError(submitError.message || 'Validation failed');
      setLoading(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: (() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('provider');
          url.searchParams.delete('status');
          url.searchParams.delete('token');
          url.searchParams.delete('PayerID');
          return url.toString();
        })(),
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment failed');
      showErrorToast('Payment Failed', confirmError.message || 'Please try again.');
      setLoading(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      // Update payment status in our backend
      const response = await fetch('/api/payments/checkout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          status: 'succeeded',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Payment succeeded, but order confirmation failed.');
      }

      showSuccessToast('Payment Complete', `$${amount.toFixed(2)} paid for ${productName}`);
      onSuccess?.();
    } else if (paymentIntent?.status === 'processing') {
      showSuccessToast('Processing', 'Your payment is being processed. We\'ll update you shortly.');
      onSuccess?.();
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <div className="flex justify-between mb-4 pb-4 border-b border-[rgba(27,42,91,0.08)]">
          <span className="text-sm text-[#8B7569]">{productName}</span>
          <span className="text-sm font-semibold text-[#1B2A5B]">${amount.toFixed(2)}</span>
        </div>
      </div>

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
        className="w-full py-3.5 rounded-lg text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: loading ? '#9CA3AF' : '#1B2A5B',
          color: '#FAF7F2',
        }}
      >
        {loading ? 'Processing...' : `Pay $${amount.toFixed(2)}`}
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

function PayPalForm({
  orderId,
  amount,
  productName,
  guestEmail,
  guestName,
  onSuccess,
}: {
  orderId: string;
  amount: number;
  productName: string;
  guestEmail?: string;
  guestName?: string;
  onSuccess?: () => void;
}) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturePending, setCapturePending] = useState(false);

  useEffect(() => {
    const provider = searchParams.get('provider');
    const status = searchParams.get('status');
    const token = searchParams.get('token');

    if (provider !== 'paypal' || status !== 'success' || !token || capturePending) {
      return;
    }

    const captureOrder = async () => {
      setCapturePending(true);
      setError(null);

      try {
        const response = await fetch('/api/payments/checkout', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'paypal',
            paypalOrderId: token,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to capture PayPal payment');
        }

        window.history.replaceState({}, '', window.location.pathname);
        showSuccessToast('Payment Complete', `$${amount.toFixed(2)} paid for ${productName} with PayPal`);
        onSuccess?.();
      } catch (captureError: any) {
        setError(captureError.message || 'Failed to capture PayPal payment');
        showErrorToast('PayPal Capture Failed', captureError.message || 'Please try again.');
      } finally {
        setCapturePending(false);
      }
    };

    void captureOrder();
  }, [amount, capturePending, onSuccess, productName, searchParams]);

  const handlePayPalCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'paypal',
          orderId,
          amount,
          currency: 'usd',
          description: `Purchase: ${productName}`,
          ...(guestEmail && { guestEmail, guestName }),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize PayPal checkout');
      }

      window.location.href = data.approvalUrl;
    } catch (paypalError: any) {
      setError(paypalError.message || 'Failed to start PayPal checkout');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between mb-4 pb-4 border-b border-[rgba(27,42,91,0.08)]">
        <span className="text-sm text-[#8B7569]">{productName}</span>
        <span className="text-sm font-semibold text-[#1B2A5B]">${amount.toFixed(2)}</span>
      </div>

      <div className="rounded-xl border border-[rgba(27,42,91,0.08)] bg-[#FCFAF7] p-5">
        <p className="text-sm font-semibold text-[#1B2A5B]">Pay with PayPal</p>
        <p className="mt-1 text-sm text-[#8B7569]">
          You&apos;ll be redirected to PayPal to approve the payment, then returned here automatically.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        disabled={loading || capturePending}
        onClick={handlePayPalCheckout}
        className="w-full py-3.5 rounded-lg text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: loading || capturePending ? '#9CA3AF' : '#FFC439',
          color: '#111827',
        }}
      >
        {capturePending ? 'Confirming PayPal payment...' : loading ? 'Redirecting to PayPal...' : `Pay $${amount.toFixed(2)} with PayPal`}
      </button>

      <p className="text-xs text-[#8B7569] text-center">
        PayPal handles authorization and returns you here after approval.
      </p>
    </div>
  );
}

// Outer wrapper: creates PaymentIntent then mounts Stripe Elements
export default function CheckoutForm({ orderId, amount, productName, guestEmail, guestName, initialProvider, onSuccess }: CheckoutFormProps) {
  const [method, setMethod] = useState<'stripe' | 'paypal'>(initialProvider || (stripePromise ? 'stripe' : 'paypal'));
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initialProvider) {
      setMethod(initialProvider);
    }
  }, [initialProvider]);

  useEffect(() => {
    if (method !== 'stripe') {
      setLoading(false);
      return;
    }

    const createPaymentIntent = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/payments/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'stripe',
            orderId,
            amount,
            currency: 'usd',
            description: `Purchase: ${productName}`,
            ...(guestEmail && { guestEmail, guestName }),
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to initialize payment');
        }

        const data = await res.json();
        setClientSecret(data.clientSecret);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    void createPaymentIntent();
  }, [method, orderId, amount, productName, guestEmail, guestName]);

  const paypalSelected = method === 'paypal';

  if (!stripePromise && !paypalSelected) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm font-medium text-yellow-800">Stripe Not Configured</p>
        <p className="text-xs text-yellow-700 mt-1">
          Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in your environment to enable payments.
        </p>
      </div>
    );
  }

  if (paypalSelected) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F5F1EA] p-1">
          <button
            type="button"
            onClick={() => setMethod('stripe')}
            disabled={!stripePromise}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: 'transparent', color: '#8B7569' }}
          >
            Card
          </button>
          <button
            type="button"
            onClick={() => setMethod('paypal')}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
            style={{ background: '#FFFFFF', color: '#1B2A5B' }}
          >
            PayPal
          </button>
        </div>

        {!stripePromise && (
          <div className="rounded-lg border border-[rgba(27,42,91,0.08)] bg-[#FCFAF7] px-4 py-3">
            <p className="text-sm text-[#8B7569]">Card payments are unavailable in this environment, but PayPal checkout is still available.</p>
          </div>
        )}

        <PayPalForm
          orderId={orderId}
          amount={amount}
          productName={productName}
          guestEmail={guestEmail}
          guestName={guestName}
          onSuccess={onSuccess}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="loading-spinner" />
        <p className="text-sm text-[#8B7569] ml-3">Initializing secure payment...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm font-medium text-red-800">Payment Error</p>
        <p className="text-xs text-red-700 mt-1">{error}</p>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">Unable to initialize payment. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F5F1EA] p-1">
        <button
          type="button"
          onClick={() => setMethod('stripe')}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{ background: '#FFFFFF', color: '#1B2A5B' }}
        >
          Card
        </button>
        <button
          type="button"
          onClick={() => setMethod('paypal')}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{ background: 'transparent', color: '#8B7569' }}
        >
          PayPal
        </button>
      </div>

      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: 'stripe',
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
          },
        }}
      >
        <PaymentForm amount={amount} productName={productName} onSuccess={onSuccess} />
      </Elements>
    </div>
  );
}
