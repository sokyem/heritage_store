'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import OrderTimeline, { OrderTimelineEntry } from '@/components/admin/OrderTimeline';
import DictateButton from '@/components/admin/DictateButton';
import { showSuccessToast, showErrorToast } from '@/components/Toast';

interface OrderDetail {
  id: string;
  shortId: string;
  status: string;
  amount: number | null;
  currency: string;
  customNotes: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; name: string | null; createdAt: string } | null;
  product: { id: string; name: string; price: number; image: string | null; description: string | null } | null;
  sizeChart?: {
    image: string | null;
    data: {
      unitDetected?: string;
      columns: string[];
      rows: Array<{ size: string; values: Record<string, { cm: number | null; in: number | null }> }>;
      notes?: string;
    } | null;
  } | null;
  payment: {
    id: string;
    status: string;
    amount: number;
    paymentMethod: string | null;
    last4: string | null;
    brand: string | null;
    receipt_url: string | null;
    stripePaymentIntentId: string | null;
  } | null;
  shipping: {
    name: string | null;
    address: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string;
    phone: string | null;
  };
  shipment: {
    id: string;
    trackingNumber: string | null;
    carrier: string | null;
    status: string;
    shippedAt: string | null;
    labelUrl: string | null;
    hasLabel?: boolean;
    shippingCost?: number | null;
  } | null;
  shippingName: string | null;
  shippingAddress: string | null;
  shippingAddress2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  shippingCountry: string | null;
  shippingPhone: string | null;
  selectedColor: string | null;
  selectedSize: string | null;
  timeline?: OrderTimelineEntry[];
}

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  pending: { color: '#D4A574', label: 'Pending Payment' },
  scheduled: { color: '#1B2A5B', label: 'Paid · Needs Fulfillment' },
  processing: { color: '#7B6B8E', label: 'Processing' },
  awaiting_collection: { color: '#D97706', label: 'Awaiting Collection' },
  shipped: { color: '#2D8E5A', label: 'Shipped' },
  delivered: { color: '#2D8E5A', label: 'Delivered' },
  cancelled: { color: '#C41E3A', label: 'Cancelled' },
  refunded: { color: '#8B7569', label: 'Refunded' },
  partially_refunded: { color: '#8B7569', label: 'Partially Refunded' },
  abandoned: { color: '#A8A29E', label: 'Abandoned (unpaid)' },
};

export default function StorefrontOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('UPS');
  const [marking, setMarking] = useState(false);

  // Refund modal
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('requested_by_customer');
  const [refundNotes, setRefundNotes] = useState<string>('');
  const [refundBusy, setRefundBusy] = useState(false);

  // Edit-address modal
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState({
    name: '', address: '', address2: '', city: '', state: '', zip: '', country: 'US', phone: '',
  });
  const [addressBusy, setAddressBusy] = useState(false);

  // Resend shipping button
  const [resendShippingBusy, setResendShippingBusy] = useState(false);

  // Buy-label flow: preview the cheapest USPS cost, then confirm to purchase.
  const [rateQuote, setRateQuote] = useState<{
    cost: number; service: string; currency: string; shipmentId: string; rateId: string; weightLb?: number;
  } | null>(null);
  const [rateBusy, setRateBusy] = useState(false);
  const [buyingLabel, setBuyingLabel] = useState(false);
  const [recreating, setRecreating] = useState(false);

  // Hard delete (danger zone)
  const [destroyOpen, setDestroyOpen] = useState(false);
  const [destroyConfirm, setDestroyConfirm] = useState('');
  const [destroyForce, setDestroyForce] = useState(false);
  const [destroyBusy, setDestroyBusy] = useState(false);
  const [resending, setResending] = useState(false);

  // Send message compose panel
  const [showCompose, setShowCompose] = useState(false);
  const [aiNotes, setAiNotes] = useState('');
  const [composeMessage, setComposeMessage] = useState('');
  const [draftStep, setDraftStep] = useState<'notes' | 'draft'>('notes');
  const [draftingAi, setDraftingAi] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  // Message thread
  type OrderMsg = { id: string; direction: string; content: string; sentBy: string | null; createdAt: string };
  const [messages, setMessages] = useState<OrderMsg[]>([]);
  const [loggingReply, setLoggingReply] = useState(false);
  const [showLogReply, setShowLogReply] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/admin/orders/storefront/${id}/send-message`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setMessages(data.messages || []);
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}`);
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      setOrder(data);
      loadMessages();
      if (data.shipment?.trackingNumber) setTrackingNumber(data.shipment.trackingNumber);
      if (data.shipment?.carrier) setCarrier(data.shipment.carrier);
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function markShipped() {
    if (!order) return;
    setMarking(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/mark-shipped`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: trackingNumber.trim() || null, carrier }),
      });
      if (!res.ok) throw new Error('failed');
      showSuccessToast('Order marked as shipped', 'Customer has been notified.');
      await load();
    } catch {
      showErrorToast('Failed to mark shipped', 'Please try again.');
    } finally {
      setMarking(false);
    }
  }

  // Step 1: preview the cheapest USPS postage cost (no purchase yet).
  async function getRate() {
    setRateBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/rate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not get a rate');
      setRateQuote({
        cost: data.cost, service: data.service, currency: data.currency,
        shipmentId: data.shipmentId, rateId: data.rateId, weightLb: data.weightLb,
      });
    } catch (err) {
      showErrorToast('Could not get shipping cost', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRateBusy(false);
    }
  }

  // Step 2: buy the exact rate that was quoted (charges your EasyPost balance).
  async function buyLabel() {
    setBuyingLabel(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/create-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rateQuote ? { shipmentId: rateQuote.shipmentId, rateId: rateQuote.rateId } : {}),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not buy the label');
      showSuccessToast('Label purchased', data.trackingNumber ? `Tracking: ${data.trackingNumber}` : 'Label created.');
      setRateQuote(null);
      await load();
    } catch (err) {
      showErrorToast('Label purchase failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBuyingLabel(false);
    }
  }

  // Void the current label (refund via EasyPost) and buy a fresh USPS Ground
  // Advantage one — for when the wrong service was bought or the address changed.
  async function recreateLabel() {
    if (!window.confirm('Void the current label and buy a new USPS Ground Advantage label? The old label will be refunded by USPS (this can take up to ~2 weeks) and your EasyPost balance will be charged for the new one.')) return;
    setRecreating(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/recreate-label`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not recreate the label');
      showSuccessToast('Label recreated', data.trackingNumber ? `New tracking: ${data.trackingNumber}` : 'New label created.');
      await load();
    } catch (err) {
      showErrorToast('Could not recreate the label', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRecreating(false);
    }
  }

  async function resendConfirmation() {
    setResending(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/resend-confirmation`, { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      showSuccessToast('Confirmation re-sent', `Sent to ${data.sentTo}`);
    } catch {
      showErrorToast('Resend failed', 'Could not send email. Check email config.');
    } finally {
      setResending(false);
    }
  }

  async function markDelivered() {
    if (!order) return;
    if (!confirm('Mark this order as delivered? Customer will receive a delivery confirmation email.')) return;
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/mark-delivered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('failed');
      showSuccessToast('Order marked as delivered', 'Customer has been notified.');
      await load();
    } catch {
      showErrorToast('Failed to mark delivered', 'Please try again.');
    }
  }

  async function resendShipping() {
    setResendShippingBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/resend-shipping`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      showSuccessToast('Shipping email re-sent', `Tracking: ${data.trackingNumber}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not resend';
      showErrorToast('Resend failed', msg);
    } finally {
      setResendShippingBusy(false);
    }
  }

  async function draftMessage() {
    if (!aiNotes.trim()) return;
    setDraftingAi(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/draft-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: aiNotes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setComposeMessage(data.draft || '');
      setDraftStep('draft');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not generate draft. Try again or write manually.';
      setDraftError(msg);
      // Stay on Step 1 so the user can retry or skip AI
    } finally {
      setDraftingAi(false);
    }
  }

  async function sendMessage() {
    if (!composeMessage.trim()) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: composeMessage.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      showSuccessToast('Message sent', `Delivered to ${data.sentTo}`);
      setComposeMessage('');
      setMessageSent(true);
      setTimeout(() => setMessageSent(false), 3000);
      setShowCompose(false);
      loadMessages();
    } catch (err) {
      showErrorToast('Could not send message', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSendingMessage(false);
    }
  }

  function openRefund() {
    if (!order?.payment) return;
    setRefundAmount(''); // empty = full refund by default
    setRefundReason('requested_by_customer');
    setRefundNotes('');
    setRefundOpen(true);
  }

  async function submitRefund() {
    if (!order) return;
    setRefundBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: refundAmount.trim() ? parseFloat(refundAmount) : undefined,
          reason: refundReason,
          notes: refundNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Already refunded in Stripe — the route synced our DB; reflect it.
        if (data.alreadyRefunded) {
          showSuccessToast('Already refunded', 'This order was already refunded in Stripe — status synced.');
          setRefundOpen(false);
          setTimeout(() => load(), 600);
          return;
        }
        throw new Error(data.error || 'Refund failed');
      }
      const amountStr = data.amount ? `$${Number(data.amount).toFixed(2)}` : 'full amount';
      showSuccessToast('Refund issued', `Stripe refunded ${amountStr}. Customer will be notified via webhook.`);
      setRefundOpen(false);
      // Give Stripe ~1s to fire the webhook → status update lands → then reload
      setTimeout(() => load(), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Refund failed';
      showErrorToast('Refund failed', msg);
    } finally {
      setRefundBusy(false);
    }
  }

  function openEditAddress() {
    if (!order) return;
    setAddressDraft({
      name: order.shippingName || '',
      address: order.shippingAddress || '',
      address2: order.shippingAddress2 || '',
      city: order.shippingCity || '',
      state: order.shippingState || '',
      zip: order.shippingZip || '',
      country: order.shippingCountry || 'US',
      phone: order.shippingPhone || '',
    });
    setAddressOpen(true);
  }

  async function destroyOrder() {
    if (destroyConfirm !== 'DELETE') return;
    setDestroyBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}/destroy`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE', force: destroyForce }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hard delete failed');
      showSuccessToast('Order permanently deleted', `Removed ${data.shortId} from the database.`);
      router.push('/admin/orders/storefront');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete';
      showErrorToast('Hard delete failed', msg);
    } finally {
      setDestroyBusy(false);
    }
  }

  async function saveAddress() {
    setAddressBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingName: addressDraft.name.trim() || null,
          shippingAddress: addressDraft.address.trim() || null,
          shippingAddress2: addressDraft.address2.trim() || null,
          shippingCity: addressDraft.city.trim() || null,
          shippingState: addressDraft.state.trim() || null,
          shippingZip: addressDraft.zip.trim() || null,
          shippingCountry: addressDraft.country.trim() || 'US',
          shippingPhone: addressDraft.phone.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('failed');
      showSuccessToast('Address updated', 'Shipping address saved.');
      setAddressOpen(false);
      await load();
    } catch {
      showErrorToast('Update failed', 'Could not save address.');
    } finally {
      setAddressBusy(false);
    }
  }

  async function changeStatus(newStatus: string) {
    if (!order) return;
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('failed');
      showSuccessToast('Status updated', `Order is now ${newStatus}.`);
      await load();
    } catch {
      showErrorToast('Update failed', 'Could not change status.');
    }
  }

  async function cancelOrder() {
    if (!confirm('Cancel this order? This marks it as cancelled — it does NOT issue a refund (do that from Stripe).')) return;
    try {
      const res = await fetch(`/api/admin/orders/storefront/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('failed');
      showSuccessToast('Order cancelled', 'Issue a refund in Stripe if needed.');
      router.push('/admin/orders/storefront');
    } catch {
      showErrorToast('Cancel failed', 'Please try again.');
    }
  }

  if (loading) {
    return (
      <div className="p-10 text-center">
        <div className="loading-spinner mx-auto mb-3" />
        <p className="text-sm text-[color:var(--aw-text-muted)]">Loading order…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-semibold text-[color:var(--aw-text-strong)] mb-2">Order not found</h2>
        <Link href="/admin/orders/storefront" className="text-[color:var(--aw-danger)] hover:underline text-sm">
          ← Back to all orders
        </Link>
      </div>
    );
  }

  const s = STATUS_STYLES[order.status] || { color: '#8B7569', label: order.status };
  const canFulfill = order.payment?.status === 'succeeded' && ['scheduled', 'processing', 'awaiting_collection'].includes(order.status);
  const isShipped = order.status === 'shipped' || order.status === 'delivered';

  // Flag orders we may not be able to fulfill correctly: an explicit cart marker
  // (an item had no size/color), or a physical order with no item detail at all
  // (e.g. older orders placed before the notes fix). Hidden once cancelled.
  const orderNotes = order.customNotes || '';
  const variantFlagged = orderNotes.includes('NEEDS SIZE/COLOR');
  const noItemDetail = !order.customNotes && !!order.product;
  const showVariantWarning = (variantFlagged || noItemDetail) && order.status !== 'cancelled' && order.status !== 'refunded';

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-[1200px] mx-auto">
      <AdminPageHeader
        title={`Order ${order.shortId}`}
        subtitle={`Placed ${new Date(order.createdAt).toLocaleString()}`}
        breadcrumbs={[
          { label: 'Orders', href: '/admin/orders/storefront' },
          { label: 'Storefront', href: '/admin/orders/storefront' },
          { label: order.shortId },
        ]}
      >
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={resendConfirmation} disabled={resending} className="btn-outline text-xs px-3 py-2 disabled:opacity-50">
            {resending ? 'Sending…' : '✉ Resend Confirmation'}
          </button>
          <button
            onClick={() => { setShowCompose(v => !v); setMessageSent(false); setDraftStep('notes'); setAiNotes(''); setComposeMessage(''); setDraftError(null); }}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 font-semibold bg-[#1B2A5B] text-white rounded-md hover:bg-[#0F1A3A] transition-colors"
          >
            ✉ Message Customer
          </button>
          {order.status !== 'cancelled' && (
            <button onClick={cancelOrder} className="text-xs px-3 py-2 border border-[#C41E3A] text-[color:var(--aw-danger)] rounded-md hover:bg-[color:var(--aw-danger)] hover:text-white transition-colors">
              Cancel Order
            </button>
          )}
        </div>
      </AdminPageHeader>

      {/* Message Customer compose panel */}
      {showCompose && (
        <div className="mb-6 bg-white border border-[#1B2A5B]/20 rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--aw-border)] bg-[#F8F6F2]">
            <div className="flex items-center gap-3">
              {draftStep === 'draft' && (
                <button onClick={() => { setDraftStep('notes'); setDraftError(null); }} className="text-xs text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] flex items-center gap-1">
                  ← Back
                </button>
              )}
              <div>
                <h3 className="font-semibold text-[color:var(--aw-text-strong)] text-sm">
                  {draftStep === 'notes' ? '✨ Draft with AI' : '✉ Review & Send'}
                </h3>
                <p className="text-[11px] text-[color:var(--aw-text-muted)]">
                  To: <strong>{order.user?.email}</strong> · Order {order.shortId}
                </p>
              </div>
            </div>
            <button
              onClick={() => { setShowCompose(false); setDraftStep('notes'); setAiNotes(''); setComposeMessage(''); setDraftError(null); }}
              className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] text-xl leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-[color:var(--aw-surface-muted)]"
            >×</button>
          </div>

          <div className="p-5">
            {draftStep === 'notes' ? (
              /* Step 1 — tell the AI what to say */
              <>
                <p className="text-xs text-[color:var(--aw-text-muted)] mb-3">
                  Tell the AI what you want to say — in rough notes or point form. It will write a polished email for you.
                </p>
                <div className="mb-3 text-[11px] text-[color:var(--aw-text-muted)] bg-[#F3F4F6] rounded-lg px-3 py-2 space-y-0.5">
                  <p className="font-semibold text-[color:var(--aw-text-strong)] mb-1">Order context AI already knows:</p>
                  <p>• Customer: {order.user?.name || '—'} · Product: {order.product?.name || '—'}</p>
                  {order.selectedColor || order.selectedSize ? <p>• {[order.selectedColor && `Color: ${order.selectedColor}`, order.selectedSize && `Size: ${order.selectedSize}`].filter(Boolean).join(' · ')}</p> : null}
                  <p>• Status: {STATUS_STYLES[order.status]?.label || order.status} · Total: ${(order.amount || 0).toFixed(2)}</p>
                </div>
                {draftError && (
                  <div className="mb-3 text-[11px] text-[#C41E3A] bg-[#FBECEC] border border-[#C41E3A]/20 rounded-lg px-3 py-2 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠</span>
                    <span>{draftError} — edit your notes and try again, or click <strong>Skip AI</strong> to write the email yourself.</span>
                  </div>
                )}
                <textarea
                  rows={4}
                  autoFocus
                  value={aiNotes}
                  onChange={e => { setAiNotes(e.target.value); setDraftError(null); }}
                  placeholder="e.g. tell them their order is delayed, we're waiting on the Yellow M restock, expected 1 week — apologise and offer 10% off next order"
                  className="w-full rounded-lg border border-[color:var(--aw-border)] bg-[#FAFAFA] px-4 py-3 text-sm text-[color:var(--aw-text-strong)] placeholder-[color:var(--aw-text-muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/30"
                />
                <div className="mt-2">
                  <DictateButton
                    onTranscript={(t) => { setAiNotes(prev => (prev.trim() ? `${prev.trim()} ${t}` : t)); setDraftError(null); }}
                  />
                </div>
                <div className="flex justify-between items-center mt-3 gap-3">
                  <button
                    onClick={() => { setComposeMessage(''); setDraftStep('draft'); }}
                    className="text-xs text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] underline"
                  >
                    Skip AI — write manually
                  </button>
                  <button
                    onClick={draftMessage}
                    disabled={draftingAi || !aiNotes.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-[#1B2A5B] text-white rounded-lg hover:bg-[#0F1A3A] transition-colors disabled:opacity-50"
                  >
                    {draftingAi ? (
                      <><span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Drafting…</>
                    ) : '✨ Generate Draft'}
                  </button>
                </div>
              </>
            ) : (
              /* Step 2 — review / edit the draft, then send */
              <>
                {aiNotes && (
                  <div className="mb-3 text-[11px] text-[color:var(--aw-text-muted)] bg-[#F3F4F6] rounded-lg px-3 py-2 italic">
                    Your notes: "{aiNotes}"
                  </div>
                )}
                <p className="text-xs text-[color:var(--aw-text-muted)] mb-2">Review and edit the draft below before sending.</p>
                <textarea
                  rows={8}
                  autoFocus
                  value={composeMessage}
                  onChange={e => setComposeMessage(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--aw-border)] bg-[#FAFAFA] px-4 py-3 text-sm text-[color:var(--aw-text-strong)] resize-none focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/30 font-mono leading-relaxed"
                />
                <div className="flex justify-between items-center mt-3 gap-3">
                  <button
                    onClick={draftMessage}
                    disabled={draftingAi || !aiNotes.trim()}
                    className="text-xs text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] inline-flex items-center gap-1 disabled:opacity-40"
                  >
                    {draftingAi ? '⟳ Regenerating…' : '✨ Regenerate'}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowCompose(false); setDraftStep('notes'); setAiNotes(''); setComposeMessage(''); setDraftError(null); }}
                      className="px-4 py-2 text-xs font-semibold border border-[color:var(--aw-border)] rounded-md hover:bg-[color:var(--aw-surface-muted)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={sendMessage}
                      disabled={sendingMessage || !composeMessage.trim()}
                      className="px-5 py-2 text-xs font-semibold bg-[#1B2A5B] text-white rounded-lg hover:bg-[#0F1A3A] transition-colors disabled:opacity-50"
                    >
                      {sendingMessage ? 'Sending…' : '✉ Send to Customer'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Status banner — stacks on mobile, side-by-side on desktop */}
      <div className="rounded-lg p-4 sm:p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ backgroundColor: `${s.color}10`, borderLeft: `4px solid ${s.color}` }}>
        <div>
          <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Status</p>
          <p className="text-lg sm:text-xl font-semibold" style={{ color: s.color }}>{s.label}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Total</p>
          <p className="text-xl sm:text-2xl font-bold text-[color:var(--aw-text-strong)]">${(order.amount || 0).toFixed(2)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left: main fulfillment actions */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">

          {/* Missing size/color warning — confirm before shipping */}
          {showVariantWarning && (
            <div className="rounded-lg border-2 p-4" style={{ borderColor: '#C41E3A', background: '#FBECEC' }}>
              <p className="font-semibold text-[#C41E3A] flex items-center gap-2">
                ⚠ {variantFlagged ? 'Size/color missing on an item' : 'No item details recorded'}
              </p>
              <p className="text-sm text-[#7A2A33] mt-1">
                {variantFlagged
                  ? 'A product was ordered without a size or color selected. Confirm the exact size/color with the customer before buying a label or shipping.'
                  : 'This order has no recorded size/color (it predates the fix or was placed without item details). Confirm what the customer wants before shipping.'}
              </p>
              {order.user?.email && (
                <a
                  href={`mailto:${order.user.email}?subject=Your AWULA K order ${order.shortId} — quick size %26 color confirmation`}
                  className="inline-block mt-2 text-sm font-semibold text-[#C41E3A] underline"
                >
                  ✉ Email {order.user.email} to confirm
                </a>
              )}
            </div>
          )}

          {/* Fulfillment action card */}
          {canFulfill && (
            <div className="bg-white border-2 border-[#2D8E5A] rounded-lg p-4 sm:p-6">
              <h3 className="font-semibold text-[color:var(--aw-text-strong)] mb-1">Ready to ship</h3>
              <p className="text-sm text-[color:var(--aw-text-muted)] mb-4">Add a tracking number and notify the customer.</p>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2">
                  <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input-field">
                    <option>UPS</option>
                    <option>USPS</option>
                    <option>FedEx</option>
                    <option>DHL</option>
                    <option>Other</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Tracking number (optional)"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    className="input-field"
                  />
                </div>
                <button onClick={markShipped} disabled={marking} className="btn-primary w-full sm:w-auto sm:self-end disabled:opacity-50">
                  {marking ? 'Marking…' : '✓ Mark as Shipped'}
                </button>
              </div>

              {/* Get Label (via EasyPost) — preview the cost first. */}
              <div className="mt-4 pt-4 border-t border-[color:var(--aw-border)]">
                {order.shipment?.trackingNumber ? (
                  <div className="text-sm space-y-1">
                    <p className="text-[color:var(--aw-text-strong)] font-medium">
                      ✓ Label purchased — {order.shipment.carrier} {order.shipment.trackingNumber}
                      {typeof order.shipment.shippingCost === 'number' ? ` · $${order.shipment.shippingCost.toFixed(2)}` : ''}
                    </p>
                    <a
                      href={`/api/admin/shipping/${order.shipment.id}/label?download=1`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[color:var(--aw-danger)] underline"
                    >
                      ⬇ Download label PDF
                    </a>
                    <p className="text-xs text-[color:var(--aw-text-muted)]">Print it, attach to the parcel, then tap “Mark as Shipped”.</p>
                    <div className="pt-1">
                      <button
                        onClick={recreateLabel}
                        disabled={recreating}
                        className="text-xs font-semibold text-[color:var(--aw-danger)] underline disabled:opacity-50"
                      >
                        {recreating ? 'Voiding & recreating…' : '↻ Void & recreate label'}
                      </button>
                      <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">Refunds the old label with USPS and buys a fresh one — Ground Advantage for US addresses, or the cheapest international service for overseas orders (Ground Advantage is US-only).</p>
                    </div>
                  </div>
                ) : !rateQuote ? (
                  <div>
                    <button
                      onClick={getRate}
                      disabled={rateBusy}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#2D8E5A] text-white rounded-md hover:bg-[#256B45] disabled:opacity-50"
                    >
                      {rateBusy ? 'Getting cost…' : '🏷️ Get Label'}
                    </button>
                    <p className="text-xs text-[color:var(--aw-text-muted)] mt-2">See the USPS rate before you buy — nothing is charged yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-[color:var(--aw-text-strong)]">
                      USPS <strong>{rateQuote.service}</strong> — <strong>${rateQuote.cost.toFixed(2)}</strong>
                      {rateQuote.weightLb ? <span className="text-[color:var(--aw-text-muted)]"> · {rateQuote.weightLb} lb parcel</span> : null}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={buyLabel} disabled={buyingLabel} className="btn-primary disabled:opacity-50">
                        {buyingLabel ? 'Buying…' : `Confirm & get label — $${rateQuote.cost.toFixed(2)}`}
                      </button>
                      <button
                        onClick={() => setRateQuote(null)}
                        disabled={buyingLabel}
                        className="px-4 py-2 text-xs font-semibold border border-[color:var(--aw-border)] rounded-md hover:bg-[color:var(--aw-surface-2,#F5F2EC)] disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-[color:var(--aw-text-muted)]">Buys real postage now from your EasyPost balance.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {isShipped && (
            <div className="bg-white border border-[color:var(--aw-border)] rounded-lg p-6">
              <h3 className="font-semibold text-[color:var(--aw-text-strong)] mb-4">Shipment</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase text-[color:var(--aw-text-muted)] mb-1">Carrier</p>
                  <p className="text-[color:var(--aw-text-strong)] font-medium">{order.shipment?.carrier || carrier}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-[color:var(--aw-text-muted)] mb-1">Tracking</p>
                  <p className="text-[color:var(--aw-text-strong)] font-medium font-mono">{order.shipment?.trackingNumber || trackingNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-[color:var(--aw-text-muted)] mb-1">Shipped at</p>
                  <p className="text-[color:var(--aw-text-strong)] font-medium">{order.shipment?.shippedAt ? new Date(order.shipment.shippedAt).toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-[color:var(--aw-text-muted)] mb-1">Label</p>
                  {order.shipment?.hasLabel || order.shipment?.trackingNumber ? (
                    <a href={`/api/admin/shipping/${order.shipment.id}/label?download=1`} target="_blank" rel="noreferrer" className="text-[color:var(--aw-danger)] underline">Download PDF</a>
                  ) : order.shipment?.labelUrl ? (
                    <a href={order.shipment.labelUrl} target="_blank" rel="noreferrer" className="text-[color:var(--aw-danger)] underline">Download PDF</a>
                  ) : <p className="text-[color:var(--aw-text-muted)]">No label</p>}
                </div>
              </div>
              {/* Resend shipping email — always available when there's tracking */}
              {order.shipment?.trackingNumber && (
                <div className="mt-3">
                  <button
                    onClick={resendShipping}
                    disabled={resendShippingBusy}
                    className="text-xs font-semibold text-[color:var(--aw-text-strong)] hover:text-[color:var(--aw-danger)] inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {resendShippingBusy ? 'Sending…' : '✉ Resend Tracking Email to Customer'}
                  </button>
                </div>
              )}
              {order.status === 'shipped' && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
                  <button
                    onClick={markDelivered}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#2D8E5A] text-white rounded-md hover:bg-[#206E44] transition-colors"
                  >
                    ✓ Mark as Delivered
                  </button>
                  <span className="text-xs text-[color:var(--aw-text-muted)]">
                    Sends a delivery email to the customer. The UPS/USPS webhook does this automatically once it fires.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Product */}
          <div className="bg-white border border-[color:var(--aw-border)] rounded-lg p-6">
            <h3 className="font-semibold text-[color:var(--aw-text-strong)] mb-4">Product</h3>
            {order.product ? (
              <div className="flex gap-4">
                {order.product.image && (
                  <img src={order.product.image} alt={order.product.name} className="w-20 h-20 rounded-md object-cover" />
                )}
                <div className="flex-1">
                  <p className="font-medium text-[color:var(--aw-text-strong)]">{order.product.name}</p>
                  {order.product.description && !order.product.description.startsWith('Cart order (') && (
                    <p className="text-xs text-[color:var(--aw-text-muted)] mt-1 line-clamp-2">{order.product.description}</p>
                  )}
                  <p className="text-sm text-[color:var(--aw-text-strong)] font-semibold mt-2">${order.product.price.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[color:var(--aw-text-muted)]">No product linked.</p>
            )}
            {order.customNotes && (
              <div className="mt-4 pt-4 border-t border-[color:var(--aw-border)]">
                <p className="text-xs uppercase text-[color:var(--aw-text-muted)] mb-1">Customer notes</p>
                <p className="text-sm text-[color:var(--aw-text-strong)] whitespace-pre-line">{order.customNotes}</p>
              </div>
            )}
            {order.sizeChart && (order.sizeChart.image || order.sizeChart.data) && (
              <div className="mt-4 pt-4 border-t border-[color:var(--aw-border)]">
                <p className="text-xs uppercase text-[color:var(--aw-text-muted)] mb-2">Size chart for this product</p>
                {order.sizeChart.data && (
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-[color:var(--aw-surface-muted)] text-[color:var(--aw-text-muted)] text-left">
                          <th className="px-2 py-1.5 font-semibold border border-[color:var(--aw-border)]">Size</th>
                          {order.sizeChart.data.columns.map((c) => (
                            <th key={c} className="px-2 py-1.5 font-semibold border border-[color:var(--aw-border)] whitespace-nowrap">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {order.sizeChart.data.rows.map((row, i) => (
                          <tr key={`${row.size}-${i}`} className="text-[color:var(--aw-text-strong)]">
                            <td className="px-2 py-1.5 font-semibold border border-[color:var(--aw-border)]">{row.size}</td>
                            {order.sizeChart!.data!.columns.map((c) => {
                              const cell = row.values?.[c];
                              return (
                                <td key={c} className="px-2 py-1.5 border border-[color:var(--aw-border)] whitespace-nowrap">
                                  {cell && (cell.cm != null || cell.in != null) ? `${cell.cm ?? '—'}cm / ${cell.in ?? '—'}in` : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {order.sizeChart.image && (
                  <img src={order.sizeChart.image} alt="Size chart" className="w-full max-w-sm rounded-md border border-[color:var(--aw-border)] bg-white" />
                )}
              </div>
            )}
          </div>

          {/* Shipping address */}
          <div className="bg-white border border-[color:var(--aw-border)] rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[color:var(--aw-text-strong)]">Shipping Address</h3>
              <button
                onClick={openEditAddress}
                className="text-xs font-semibold text-[color:var(--aw-text-strong)] hover:text-[color:var(--aw-danger)] inline-flex items-center gap-1"
              >
                ✏ Edit
              </button>
            </div>
            {order.shippingAddress ? (
              <address className="not-italic text-sm text-[color:var(--aw-text-strong)] leading-relaxed">
                {order.shippingName && <><strong>{order.shippingName}</strong><br /></>}
                {order.shippingAddress}<br />
                {order.shippingAddress2 && <>{order.shippingAddress2}<br /></>}
                {order.shippingCity}, {order.shippingState} {order.shippingZip}<br />
                {order.shippingCountry || 'US'}
                {order.shippingPhone && <><br />📞 {order.shippingPhone}</>}
              </address>
            ) : (
              <div className="text-sm text-[color:var(--aw-text-muted)] italic">
                ⚠ No shipping address on file. Customer may have selected digital delivery or this is a guest order without shipping info.
              </div>
            )}
          </div>
        </div>

        {/* Right: customer + payment sidebar */}
        <div className="space-y-6">
          {/* Message thread */}
          <div className="bg-white border border-[color:var(--aw-border)] rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[color:var(--aw-text-strong)]">Messages</h3>
              <button
                onClick={() => setShowLogReply(v => !v)}
                className="text-xs text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] border border-[color:var(--aw-border)] px-2 py-1 rounded"
              >
                + Log reply
              </button>
            </div>

            {showLogReply && (
              <div className="mb-4 p-3 bg-[#F8F6F2] rounded-lg border border-[color:var(--aw-border)]">
                <p className="text-[11px] text-[color:var(--aw-text-muted)] mb-2">Paste or type the customer&apos;s reply to save it in the thread.</p>
                <textarea
                  rows={3}
                  autoFocus
                  value={replyDraft}
                  onChange={e => setReplyDraft(e.target.value)}
                  placeholder="Customer reply text…"
                  className="w-full rounded border border-[color:var(--aw-border)] bg-white px-3 py-2 text-xs text-[color:var(--aw-text-strong)] resize-none focus:outline-none focus:ring-1 focus:ring-[#1B2A5B]/40"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => { setShowLogReply(false); setReplyDraft(''); }} className="text-xs text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]">Cancel</button>
                  <button
                    disabled={loggingReply || !replyDraft.trim()}
                    onClick={async () => {
                      setLoggingReply(true);
                      try {
                        const res = await fetch(`/api/admin/orders/storefront/${id}/log-reply`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ content: replyDraft.trim() }),
                        });
                        if (!res.ok) throw new Error('failed');
                        setReplyDraft('');
                        setShowLogReply(false);
                        loadMessages();
                      } catch { showErrorToast('Could not save reply', 'Please try again.'); }
                      finally { setLoggingReply(false); }
                    }}
                    className="text-xs px-3 py-1 bg-[#1B2A5B] text-white rounded hover:bg-[#0F1A3A] disabled:opacity-50"
                  >
                    {loggingReply ? 'Saving…' : 'Save reply'}
                  </button>
                </div>
              </div>
            )}

            {messages.length === 0 ? (
              <p className="text-xs text-[color:var(--aw-text-muted)]">No messages yet. Use &ldquo;Message Customer&rdquo; above to start a thread.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => (
                  <div key={m.id} className={`text-xs rounded-lg px-3 py-2.5 ${
                    m.direction === 'outbound'
                      ? 'bg-[#1B2A5B]/5 border border-[#1B2A5B]/15'
                      : 'bg-[#F0FAF4] border border-[#2D8E5A]/20'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold" style={{ color: m.direction === 'outbound' ? '#1B2A5B' : '#2D8E5A' }}>
                        {m.direction === 'outbound' ? `✉ You${m.sentBy ? ` (${m.sentBy})` : ''}` : '↩ Customer'}
                      </span>
                      <span className="text-[color:var(--aw-text-muted)]">
                        {new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[color:var(--aw-text-strong)] whitespace-pre-line leading-relaxed">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity timeline */}
          <div className="bg-white border border-[color:var(--aw-border)] rounded-lg p-6">
            <h3 className="font-semibold text-[color:var(--aw-text-strong)] mb-4">Activity</h3>
            <OrderTimeline entries={order.timeline || []} />
          </div>

          {/* Customer */}
          <div className="bg-white border border-[color:var(--aw-border)] rounded-lg p-6">
            <h3 className="font-semibold text-[color:var(--aw-text-strong)] mb-4">Customer</h3>
            {order.user ? (
              <>
                <p className="font-medium text-[color:var(--aw-text-strong)]">{order.user.name || 'Guest customer'}</p>
                <p className="text-sm text-[color:var(--aw-text-muted)] mt-1">
                  <a href={`mailto:${order.user.email}`} className="hover:text-[color:var(--aw-text-strong)]">{order.user.email}</a>
                </p>
                <p className="text-xs text-[color:var(--aw-text-muted)] mt-2">
                  Customer since {new Date(order.user.createdAt).toLocaleDateString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-[color:var(--aw-text-muted)]">Anonymous</p>
            )}
          </div>

          {/* Payment */}
          <div className="bg-white border border-[color:var(--aw-border)] rounded-lg p-6">
            <h3 className="font-semibold text-[color:var(--aw-text-strong)] mb-4">Payment</h3>
            {order.payment ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[color:var(--aw-text-muted)]">Status</span>
                  <span className="font-semibold" style={{ color: order.payment.status === 'succeeded' ? '#2D8E5A' : '#D4A574' }}>
                    {order.payment.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[color:var(--aw-text-muted)]">Amount</span>
                  <span className="text-[color:var(--aw-text-strong)] font-semibold">${order.payment.amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[color:var(--aw-text-muted)]">Method</span>
                  <span className="text-[color:var(--aw-text-strong)]">{order.payment.paymentMethod || '—'}</span>
                </div>
                {order.payment.brand && order.payment.last4 && (
                  <div className="flex justify-between">
                    <span className="text-[color:var(--aw-text-muted)]">Card</span>
                    <span className="text-[color:var(--aw-text-strong)] capitalize">{order.payment.brand} •••• {order.payment.last4}</span>
                  </div>
                )}
                {order.payment.receipt_url && (
                  <a href={order.payment.receipt_url} target="_blank" rel="noreferrer" className="block mt-3 text-center text-xs text-[color:var(--aw-danger)] hover:underline">
                    View Stripe receipt →
                  </a>
                )}
                {order.payment.stripePaymentIntentId && (
                  <a
                    href={`https://dashboard.stripe.com/payments/${order.payment.stripePaymentIntentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-center text-xs text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]"
                  >
                    Open in Stripe →
                  </a>
                )}

                {/* Issue Refund button — only when payment is in a refundable state */}
                {(order.payment.status === 'succeeded' || order.payment.status === 'partially_refunded') && (
                  <button
                    onClick={openRefund}
                    className="w-full mt-3 px-3 py-2 text-xs font-semibold border border-[#C41E3A] text-[color:var(--aw-danger)] rounded-md hover:bg-[color:var(--aw-danger)] hover:text-white transition-colors"
                  >
                    {order.payment.status === 'partially_refunded' ? '↩ Issue Another Refund' : '↩ Issue Refund'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-[color:var(--aw-text-muted)]">No payment recorded.</p>
            )}
          </div>

          {/* Manual status override */}
          <div className="bg-white border border-[color:var(--aw-border)] rounded-lg p-6">
            <h3 className="font-semibold text-[color:var(--aw-text-strong)] mb-3">Override Status</h3>
            <p className="text-xs text-[color:var(--aw-text-muted)] mb-3">Manually change order status without notifications.</p>
            <select
              value={order.status}
              onChange={(e) => changeStatus(e.target.value)}
              className="input-field w-full"
            >
              {Object.keys(STATUS_STYLES).map((k) => (
                <option key={k} value={k}>{STATUS_STYLES[k].label}</option>
              ))}
            </select>
          </div>

          {/* Danger zone */}
          <div className="bg-white border-2 border-[#FEE2E2] rounded-lg p-6">
            <h3 className="font-semibold text-[color:var(--aw-danger)] mb-2">⚠ Danger Zone</h3>
            <p className="text-xs text-[color:var(--aw-text-muted)] mb-4 leading-relaxed">
              Permanently removes this order, its payment record, and any linked shipments from the database. <strong className="text-[color:var(--aw-danger)]">Cannot be undone.</strong> Use only for test orders.
            </p>
            <button
              onClick={() => { setDestroyConfirm(''); setDestroyForce(false); setDestroyOpen(true); }}
              className="w-full px-3 py-2 text-xs font-semibold border border-[#C41E3A] text-[color:var(--aw-danger)] rounded-md hover:bg-[color:var(--aw-danger)] hover:text-white transition-colors"
            >
              🗑 Permanently Delete This Order
            </button>
          </div>
        </div>
      </div>

      {/* ─── Refund Modal ─────────────────────────────────────────── */}
      {refundOpen && order && order.payment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => !refundBusy && setRefundOpen(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[color:var(--aw-border)]">
              <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)]">Issue Refund</h2>
              <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">
                This refunds the customer via Stripe. They'll be notified automatically when the webhook fires.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">
                  Amount (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={order.payment.amount}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder={`Leave empty for full refund: $${order.payment.amount.toFixed(2)}`}
                  className="input-field w-full"
                />
                <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">
                  Captured: <strong className="text-[color:var(--aw-text-strong)]">${order.payment.amount.toFixed(2)}</strong>
                  {' · '}leave empty to refund the full amount
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">
                  Reason
                </label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="requested_by_customer">Requested by customer</option>
                  <option value="duplicate">Duplicate charge</option>
                  <option value="fraudulent">Fraudulent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">
                  Internal note (optional)
                </label>
                <textarea
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  placeholder="e.g. customer reported wrong size, exchanging via new order"
                  rows={3}
                  className="input-field w-full resize-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-[color:var(--aw-border)] flex gap-2 justify-end">
              <button
                onClick={() => setRefundOpen(false)}
                disabled={refundBusy}
                className="px-4 py-2 text-sm border border-[#D1D5DB] text-[color:var(--aw-text-muted)] rounded-md hover:bg-[#F9FAFB]"
              >
                Cancel
              </button>
              <button
                onClick={submitRefund}
                disabled={refundBusy}
                className="px-5 py-2 text-sm font-semibold bg-[color:var(--aw-danger)] text-white rounded-md hover:bg-[#9F162E] disabled:opacity-50"
              >
                {refundBusy ? 'Issuing refund…' : 'Issue Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Hard Delete Modal ────────────────────────────────────── */}
      {destroyOpen && order && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => !destroyBusy && setDestroyOpen(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[color:var(--aw-border)]">
              <h2 className="text-lg font-semibold text-[color:var(--aw-danger)]">⚠ Permanently Delete Order {order.shortId}?</h2>
              <p className="text-sm text-[#5C3D2E] mt-2 leading-relaxed">
                This removes the order, its payment row, and any linked shipments from the database.
                <strong className="text-[color:var(--aw-danger)]"> This cannot be undone.</strong>
                <br /><br />
                Use this only for test/spam orders. For real orders use <strong>Cancel + Issue Refund</strong>.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">
                  Type <code className="bg-[color:var(--aw-danger-soft)] text-[color:var(--aw-danger)] px-1.5 py-0.5 rounded font-mono">DELETE</code> to confirm
                </label>
                <input
                  type="text"
                  value={destroyConfirm}
                  onChange={(e) => setDestroyConfirm(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  className="input-field w-full font-mono"
                />
              </div>
              {order.payment?.status === 'succeeded' && (
                <label className="flex items-start gap-2 cursor-pointer text-xs text-[#5C3D2E]">
                  <input
                    type="checkbox"
                    checked={destroyForce}
                    onChange={(e) => setDestroyForce(e.target.checked)}
                    className="mt-0.5 w-4 h-4"
                  />
                  <span>
                    <strong>This order has a SUCCEEDED payment.</strong> Check to delete anyway.
                    <span className="block text-[color:var(--aw-text-muted)] text-[11px] mt-0.5">
                      The Stripe charge will NOT be refunded. Issue a refund first if the customer needs their money back.
                    </span>
                  </span>
                </label>
              )}
            </div>
            <div className="p-6 border-t border-[color:var(--aw-border)] flex gap-2 justify-end">
              <button
                onClick={() => setDestroyOpen(false)}
                disabled={destroyBusy}
                className="px-4 py-2 text-sm border border-[#D1D5DB] text-[color:var(--aw-text-muted)] rounded-md hover:bg-[#F9FAFB]"
              >
                Cancel
              </button>
              <button
                onClick={destroyOrder}
                disabled={destroyBusy || destroyConfirm !== 'DELETE' || (order.payment?.status === 'succeeded' && !destroyForce)}
                className="px-5 py-2 text-sm font-semibold bg-[color:var(--aw-danger)] text-white rounded-md hover:bg-[#9F162E] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {destroyBusy ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Address Modal ───────────────────────────────────── */}
      {addressOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => !addressBusy && setAddressOpen(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[color:var(--aw-border)]">
              <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)]">Edit Shipping Address</h2>
              <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">
                Updates this order only. If the customer changed their address, also remember to re-print the shipping label.
              </p>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">Full name</label>
                <input value={addressDraft.name} onChange={(e) => setAddressDraft((d) => ({ ...d, name: e.target.value }))} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">Address</label>
                <input value={addressDraft.address} onChange={(e) => setAddressDraft((d) => ({ ...d, address: e.target.value }))} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">Apartment / Suite</label>
                <input value={addressDraft.address2} onChange={(e) => setAddressDraft((d) => ({ ...d, address2: e.target.value }))} className="input-field w-full" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">City</label>
                  <input value={addressDraft.city} onChange={(e) => setAddressDraft((d) => ({ ...d, city: e.target.value }))} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">State</label>
                  <input value={addressDraft.state} onChange={(e) => setAddressDraft((d) => ({ ...d, state: e.target.value.toUpperCase() }))} maxLength={3} className="input-field w-20" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">ZIP</label>
                  <input value={addressDraft.zip} onChange={(e) => setAddressDraft((d) => ({ ...d, zip: e.target.value }))} className="input-field w-28" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">Country</label>
                  <select value={addressDraft.country} onChange={(e) => setAddressDraft((d) => ({ ...d, country: e.target.value }))} className="input-field w-full">
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
                  <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">Phone</label>
                  <input type="tel" value={addressDraft.phone} onChange={(e) => setAddressDraft((d) => ({ ...d, phone: e.target.value }))} className="input-field w-full" />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-[color:var(--aw-border)] flex gap-2 justify-end">
              <button
                onClick={() => setAddressOpen(false)}
                disabled={addressBusy}
                className="px-4 py-2 text-sm border border-[#D1D5DB] text-[color:var(--aw-text-muted)] rounded-md hover:bg-[#F9FAFB]"
              >
                Cancel
              </button>
              <button
                onClick={saveAddress}
                disabled={addressBusy}
                className="px-5 py-2 text-sm font-semibold bg-[color:var(--aw-navy)] text-white rounded-md hover:bg-[#0F1A3A] disabled:opacity-50"
              >
                {addressBusy ? 'Saving…' : 'Save Address'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
