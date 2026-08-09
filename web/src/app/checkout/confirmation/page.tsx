'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { trackPurchase } from '@/lib/analytics';

interface OrderDetails {
  id: string;
  status: string;
  amount: number | null;
  currency: string;
  createdAt: string;
  product: {
    id?: string;
    name: string;
    price: number;
    image?: string | null;
  };
  payment: {
    id: string;
    amount: number;
    status: string;
    paymentMethod: string | null;
    createdAt: string;
  } | null;
  shipping: {
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
  } | null;
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const orderId = searchParams.get('orderId');
  const paymentIntentId = searchParams.get('payment_intent'); // Stripe redirect param

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError('No order ID provided.');
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        // If Stripe redirected here with a payment_intent, confirm it first
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

        const res = await fetch(`/api/orders/${orderId}`);
        if (!res.ok) {
          throw new Error('Order not found');
        }
        const data: OrderDetails = await res.json();
        setOrder(data);

        // Fire the Purchase / purchase conversion event once per order.
        // Guard with sessionStorage so a page refresh doesn't double-count.
        const purchaseKey = `awulak_purchase_tracked_${orderId}`;
        const alreadyTracked =
          typeof window !== 'undefined' && window.sessionStorage.getItem(purchaseKey);
        if (!alreadyTracked) {
          const value = data.payment?.amount ?? data.amount ?? data.product?.price ?? 0;
          trackPurchase(data.id || orderId, value, [
            {
              id: data.product?.id || data.id || orderId,
              name: data.product?.name || 'Order',
              price: value,
              quantity: 1,
            },
          ]);
          try {
            window.sessionStorage.setItem(purchaseKey, '1');
          } catch {}
        }
      } catch (err) {
        setError('Unable to load your order details. Your payment was processed successfully.');
      } finally {
        setLoading(false);
      }
    };

    void fetchOrder();
  }, [orderId, paymentIntentId]);

  // ── Loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-3" />
          <p className="text-sm text-[#8B7569]">Loading your order…</p>
        </div>
      </div>
    );
  }

  const amount = order?.payment?.amount ?? order?.amount ?? order?.product?.price ?? 0;
  const productName = order?.product?.name ?? 'Your Order';
  const orderRef = orderId ? `#${orderId.slice(-8).toUpperCase()}` : '';
  const isPaid = order?.payment?.status === 'succeeded' || order?.status === 'scheduled';

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
          <Link href="/collections" className="text-xs text-[#8B7569] hover:text-[#1B2A5B] transition-colors">
            Continue Shopping →
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
            {isPaid ? 'Order Confirmed!' : 'Thank You!'}
          </h1>
          <p className="text-base text-[#8B7569] leading-relaxed max-w-[480px] mx-auto">
            {isPaid
              ? 'Your payment was successful and your order is being prepared. You\'ll receive a confirmation email shortly.'
              : 'Your order has been received. We\'ll confirm your payment and send you an email update.'}
          </p>
        </div>

        {/* ── Order details card ──────────────────────────── */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden mb-6">
          {/* Order header */}
          <div className="bg-[#1B2A5B] px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase text-white/60 mb-1">
                  Order Reference
                </p>
                <p className="text-lg font-bold text-white font-mono">{orderRef}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold tracking-[0.12em] uppercase text-white/60 mb-1">
                  Status
                </p>
                <span className="inline-flex items-center gap-1.5 bg-[#22C55E] text-white text-xs font-bold px-3 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  {isPaid ? 'Paid' : 'Processing'}
                </span>
              </div>
            </div>
          </div>

          {/* Product details */}
          <div className="p-6 border-b border-[#F0EBE3]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-4">
              Items Ordered
            </h3>
            <div className="flex gap-4">
              {order?.product?.image ? (
                <div
                  className="w-20 h-24 rounded-lg bg-[#F0EBE3] bg-cover bg-center flex-shrink-0"
                  style={{ backgroundImage: `url(${order.product.image})` }}
                />
              ) : (
                <div className="w-20 h-24 rounded-lg bg-[#F0EBE3] flex items-center justify-center flex-shrink-0">
                  <span className="text-3xl opacity-30">👗</span>
                </div>
              )}
              <div className="flex-1">
                <p className="text-base font-semibold text-[#1B2A5B] leading-snug mb-1">
                  {productName}
                </p>
                <p className="text-sm text-[#8B7569]">Qty: 1</p>
                <p className="text-base font-bold text-[#1B2A5B] mt-2">
                  ${amount.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Payment summary */}
          <div className="p-6 border-b border-[#F0EBE3]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-4">
              Payment Summary
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#8B7569]">Subtotal</span>
                <span className="text-[#1B2A5B]">${amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#8B7569]">Shipping</span>
                <span className="text-[#22C55E] font-medium">Free</span>
              </div>
              <div className="flex justify-between text-sm font-semibold pt-2 border-t border-[#F0EBE3]">
                <span className="text-[#1B2A5B]">Total Charged</span>
                <span className="text-[#1B2A5B] text-base">${amount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Shipping address (if available) */}
          {order?.shipping?.address && (
            <div className="p-6 border-b border-[#F0EBE3]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B7569] mb-3">
                Shipping To
              </h3>
              <div className="text-sm text-[#1B2A5B] space-y-0.5">
                {order.shipping.name && <p className="font-medium">{order.shipping.name}</p>}
                <p>{order.shipping.address}</p>
                <p>
                  {[order.shipping.city, order.shipping.state, order.shipping.zip]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {order.shipping.country && order.shipping.country !== 'US' && (
                  <p>{order.shipping.country}</p>
                )}
              </div>
            </div>
          )}

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
                  desc: 'You\'ll receive an order confirmation at your email address.',
                },
                {
                  step: '2',
                  title: 'Order preparation',
                  desc: 'Our team will carefully prepare and package your order.',
                },
                {
                  step: '3',
                  title: 'Shipping notification',
                  desc: 'You\'ll get a tracking number once your order ships.',
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
            href="/collections"
            className="flex-1 py-3.5 rounded-lg border-2 border-[#1B2A5B] text-[#1B2A5B] text-sm font-semibold text-center hover:bg-[#FAF7F2] transition-colors"
          >
            Continue Shopping
          </Link>
          {session?.user ? (
            <Link
              href="/customer/dashboard"
              className="flex-1 py-3.5 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold text-center hover:bg-[#2D4A8C] transition-colors"
            >
              View My Orders
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

        {/* Social proof / brand message */}
        <div className="mt-10 text-center">
          <p className="text-sm text-[#8B7569] leading-relaxed">
            Thank you for supporting African craftsmanship. Every purchase helps sustain our artisan community.
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

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
          <div className="text-center">
            <div className="loading-spinner mx-auto mb-3" />
            <p className="text-sm text-[#8B7569]">Loading confirmation…</p>
          </div>
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
