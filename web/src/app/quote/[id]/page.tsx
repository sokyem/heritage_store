'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

interface LineItem { description: string; quantity: number; unitPrice: number; total: number }

interface PublicQuote {
  id: string;
  quoteId: string;
  status: string;
  clientName: string | null;
  lineItems: LineItem[];
  materialsTotal: number;
  laborTotal: number;
  fittingFee: number;
  rushFee: number;
  deliveryFee: number;
  discount: number;
  discountType: string | null;
  subtotal: number;
  tax: number;
  total: number;
  depositPercent: number;
  depositAmount: number;
  depositPaidAt: string | null;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  siteName: string;
}

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PublicQuotePage() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const id = params.id;
  const token = sp.get('t') || '';
  const sessionId = sp.get('session_id');
  const cancelled = sp.get('cancelled');

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [orderRef, setOrderRef] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) { setError('Missing access token'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${id}?t=${encodeURIComponent(token)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to load quote');
      }
      setQuote(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  // Confirm after Stripe redirect
  useEffect(() => {
    if (!sessionId || !token) return;
    (async () => {
      try {
        const res = await fetch(`/api/quotes/${id}/confirm?t=${encodeURIComponent(token)}&session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (res.ok && data.ok) {
          setConfirmMsg(data.alreadyPaid ? 'Deposit already received — thank you!' : 'Payment received — thank you!');
          setOrderRef(data.customOrderRef || null);
        } else if (data.error) {
          setError(data.error);
        }
      } catch {
        setError('Could not confirm payment. Refresh in a moment.');
      } finally {
        // Clean the URL
        router.replace(`/quote/${id}?t=${encodeURIComponent(token)}`);
        load();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => { if (!sessionId) load(); }, [load, sessionId]);

  async function pay() {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${id}/checkout?t=${encodeURIComponent(token)}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start checkout');
      setBusy(false);
    }
  }

  async function decline() {
    if (!quote) return;
    if (!confirm('Are you sure you want to decline this quote?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/quotes/${id}/decline?t=${encodeURIComponent(token)}`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed');
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decline');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-[#8B7569]">Loading…</div>
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] p-6">
        <div className="max-w-md bg-white rounded-xl shadow-sm border border-[#F0EBE3] p-8 text-center">
          <h1 className="text-lg font-semibold text-[#C41E3A] mb-2">Quote unavailable</h1>
          <p className="text-sm text-[#8B7569]">{error}</p>
        </div>
      </div>
    );
  }

  if (!quote) return null;

  const paid = !!quote.depositPaidAt;
  const declined = quote.status === 'rejected';
  const canAct = !paid && !declined;

  return (
    <div className="min-h-screen bg-[#FAF7F2] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs tracking-[0.2em] uppercase text-[#8B7569] mb-2">{quote.siteName}</p>
          <h1 className="text-2xl font-semibold text-[#1B2A5B]" style={{ fontFamily: 'var(--font-heading)' }}>
            Quote {quote.quoteId}
          </h1>
          {quote.clientName && <p className="text-sm text-[#8B7569] mt-1">Prepared for {quote.clientName}</p>}
        </div>

        {/* Status banners */}
        {confirmMsg && (
          <div className="bg-[#2D8E5A]/10 text-[#2D8E5A] rounded-lg px-4 py-3 mb-5 text-sm font-medium text-center">
            ✓ {confirmMsg}{orderRef ? ` Your order reference is ${orderRef}.` : ''}
          </div>
        )}
        {cancelled && !confirmMsg && (
          <div className="bg-[#F59E0B]/10 text-[#92400E] rounded-lg px-4 py-3 mb-5 text-sm text-center">
            Payment was cancelled. You can try again any time.
          </div>
        )}
        {paid && !confirmMsg && (
          <div className="bg-[#2D8E5A]/10 text-[#2D8E5A] rounded-lg px-4 py-3 mb-5 text-sm font-medium text-center">
            Deposit received — your project is in production.
          </div>
        )}
        {declined && (
          <div className="bg-[#C41E3A]/10 text-[#C41E3A] rounded-lg px-4 py-3 mb-5 text-sm text-center">
            You declined this quote. Contact us if you'd like to revisit.
          </div>
        )}
        {error && <div className="bg-[#C41E3A]/10 text-[#C41E3A] rounded-lg px-4 py-3 mb-5 text-sm">{error}</div>}

        {/* Quote body */}
        <div className="bg-white rounded-xl shadow-sm border border-[#F0EBE3] overflow-hidden mb-6">
          {/* Line items */}
          <div className="px-6 py-5 border-b border-[#F0EBE3]">
            <h2 className="text-sm font-semibold text-[#1B2A5B] mb-4 uppercase tracking-wider">Items</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[#8B7569] uppercase tracking-wider">
                  <th className="text-left pb-2">Description</th>
                  <th className="text-right pb-2 w-12">Qty</th>
                  <th className="text-right pb-2 w-24">Price</th>
                  <th className="text-right pb-2 w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {quote.lineItems.length === 0 ? (
                  <tr><td colSpan={4} className="py-3 text-center text-[#8B7569]">—</td></tr>
                ) : quote.lineItems.map((li, i) => (
                  <tr key={i} className="border-t border-[#F0EBE3]">
                    <td className="py-3 text-[#5C3D2E]">{li.description || '—'}</td>
                    <td className="py-3 text-right text-[#5C3D2E]">{li.quantity}</td>
                    <td className="py-3 text-right text-[#5C3D2E]">{fmt(li.unitPrice)}</td>
                    <td className="py-3 text-right font-semibold text-[#1B2A5B]">{fmt(li.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-6 py-5 space-y-1.5 text-sm">
            {[
              ['Materials', quote.materialsTotal],
              ['Labor', quote.laborTotal],
              ['Fitting Fee', quote.fittingFee],
              ['Rush Fee', quote.rushFee],
              ['Delivery Fee', quote.deliveryFee],
            ].filter(([, v]) => (v as number) > 0).map(([l, v]) => (
              <div key={l as string} className="flex justify-between text-[#8B7569]"><span>{l as string}</span><span>{fmt(v as number)}</span></div>
            ))}
            {quote.discount > 0 && <div className="flex justify-between text-[#C41E3A]"><span>Discount</span><span>-{fmt(quote.discount)}</span></div>}
            {quote.tax > 0 && <div className="flex justify-between text-[#8B7569]"><span>Tax</span><span>{fmt(quote.tax)}</span></div>}
            <div className="flex justify-between border-t border-[#F0EBE3] pt-3 mt-2 text-lg font-bold text-[#1B2A5B]">
              <span>Total</span><span>{fmt(quote.total)}</span>
            </div>
          </div>

          {/* Deposit highlight */}
          {!paid && (
            <div className="px-6 py-4 bg-[#FAF7F2] border-t border-[#F0EBE3]">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-[#8B7569] uppercase tracking-wider">Deposit to start ({quote.depositPercent}%)</p>
                  <p className="text-xl font-bold text-[#C41E3A]">{fmt(quote.depositAmount)}</p>
                </div>
                {quote.validUntil && (
                  <div className="text-right">
                    <p className="text-xs text-[#8B7569] uppercase tracking-wider">Valid until</p>
                    <p className="text-sm font-semibold text-[#1B2A5B]">{quote.validUntil}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notes / Terms */}
        {(quote.notes || quote.terms) && (
          <div className="bg-white rounded-xl shadow-sm border border-[#F0EBE3] p-6 mb-6 text-sm">
            {quote.notes && (
              <div className="mb-4">
                <h3 className="text-xs text-[#8B7569] uppercase tracking-wider mb-1">Notes</h3>
                <p className="text-[#5C3D2E] whitespace-pre-line">{quote.notes}</p>
              </div>
            )}
            {quote.terms && (
              <div>
                <h3 className="text-xs text-[#8B7569] uppercase tracking-wider mb-1">Terms</h3>
                <p className="text-[#5C3D2E] whitespace-pre-line">{quote.terms}</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {canAct && (
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={pay}
              disabled={busy}
              className="flex-1 bg-[#1B2A5B] text-white rounded-lg px-6 py-3.5 font-semibold text-base hover:bg-[#152045] disabled:opacity-50 transition-colors"
            >
              {busy ? 'Loading…' : `Accept & Pay Deposit — ${fmt(quote.depositAmount)}`}
            </button>
            <button
              onClick={decline}
              disabled={busy}
              className="px-6 py-3.5 rounded-lg border border-[#E8E3DB] text-[#8B7569] font-medium hover:bg-white disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        )}

        <p className="text-center text-xs text-[#9CA3AF] mt-6">
          Secured by Stripe. Questions? Reply to the email we sent — we read every message.
        </p>
      </div>
    </div>
  );
}
