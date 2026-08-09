'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const RETURN_REASONS = [
  { value: 'damaged', label: 'Item arrived damaged' },
  { value: 'wrong_item', label: 'Wrong item received' },
  { value: 'sizing', label: 'Sizing issue' },
  { value: 'defective', label: 'Defective product' },
  { value: 'changed_mind', label: 'Changed my mind' },
  { value: 'other', label: 'Other reason' },
];

export default function ReturnRequestPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]"><p>Loading...</p></div>}>
      <ReturnRequestContent />
    </Suspense>
  );
}

function ReturnRequestContent() {
  const searchParams = useSearchParams();
  const shipmentParam = searchParams.get('shipment') || '';

  const [shipmentId, setShipmentId] = useState(shipmentParam);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [returnId, setReturnId] = useState('');

  useEffect(() => {
    if (shipmentParam) setShipmentId(shipmentParam);
  }, [shipmentParam]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!shipmentId || !reason || !name) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/shipping/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId: shipmentId.trim(),
          reason,
          description: description.trim() || undefined,
          customerName: name.trim(),
          customerEmail: email.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit return request');
      }

      const data = await res.json();
      setReturnId(data.returnRequest.returnId);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header */}
      <header className="border-b border-[rgba(27,42,91,0.08)] bg-white">
        <div className="max-w-[700px] mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-serif text-xl tracking-[0.15em] text-[#1B2A5B] font-bold">AWULA K</a>
          <a href="/orders/track" className="text-sm text-[#5C3D2E] hover:text-[#1B2A5B]">← Track Order</a>
        </div>
      </header>

      <main className="max-w-[700px] mx-auto px-6 py-12">
        {success ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="font-serif text-3xl text-[#1B2A5B] mb-2">Return Request Submitted</h1>
            <p className="text-[#5C3D2E] mb-4">
              Your return ID is <strong className="text-[#1B2A5B] font-mono">{returnId}</strong>
            </p>
            <p className="text-sm text-[#8B7569] mb-8">
              We&apos;ll review your request and send you a return label within 24–48 hours.
            </p>
            <a href="/orders/track" className="inline-flex items-center px-6 py-2.5 bg-[#1B2A5B] text-white rounded-md hover:bg-[#2C3E7A] transition text-sm font-medium">
              Track Your Order
            </a>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-3xl text-[#1B2A5B] mb-2">Request a Return</h1>
            <p className="text-[#5C3D2E] mb-8">Fill out the form below and we&apos;ll process your return request.</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-lg mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Shipment ID */}
              <div>
                <label className="block text-sm font-medium text-[#1B2A5B] mb-1.5">Shipment ID *</label>
                <input
                  type="text"
                  value={shipmentId}
                  onChange={e => setShipmentId(e.target.value)}
                  placeholder="e.g. SHP-0001"
                  required
                  className="w-full px-4 py-3 border border-[rgba(27,42,91,0.15)] rounded-md bg-white text-[#1B2A5B] placeholder:text-[#8B7569] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/20 focus:border-[#1B2A5B]"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-[#1B2A5B] mb-1.5">Your Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Full name"
                  required
                  className="w-full px-4 py-3 border border-[rgba(27,42,91,0.15)] rounded-md bg-white text-[#1B2A5B] placeholder:text-[#8B7569] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/20 focus:border-[#1B2A5B]"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-[#1B2A5B] mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 border border-[rgba(27,42,91,0.15)] rounded-md bg-white text-[#1B2A5B] placeholder:text-[#8B7569] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/20 focus:border-[#1B2A5B]"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-[#1B2A5B] mb-1.5">Reason for Return *</label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-[rgba(27,42,91,0.15)] rounded-md bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/20 focus:border-[#1B2A5B]"
                >
                  <option value="">Select a reason...</option>
                  {RETURN_REASONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-[#1B2A5B] mb-1.5">Additional Details</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe the issue..."
                  className="w-full px-4 py-3 border border-[rgba(27,42,91,0.15)] rounded-md bg-white text-[#1B2A5B] placeholder:text-[#8B7569] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/20 focus:border-[#1B2A5B] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !shipmentId || !reason || !name}
                className="w-full px-8 py-3 bg-[#1B2A5B] text-white rounded-md hover:bg-[#2C3E7A] transition disabled:opacity-50 font-medium"
              >
                {loading ? 'Submitting...' : 'Submit Return Request'}
              </button>

              <p className="text-xs text-[#8B7569] text-center">
                Returns must be requested within 14 days of delivery. Items must be in original condition with tags attached.
              </p>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
