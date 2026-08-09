'use client';

import { useState } from 'react';

interface TrackingEvent {
  status: string;
  description: string;
  location: string;
  date: string;
  time: string;
}

interface TrackingData {
  trackingNumber: string;
  status: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  events: TrackingEvent[];
}

interface ShipmentInfo {
  shipmentId: string;
  recipientName: string;
  carrier: string;
  serviceType: string;
  status: string;
  trackingNumber: string;
  shippingCost: number | null;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  createdAt: string;
}

const STATUS_STEPS = [
  { key: 'label_created', label: 'Label Created', icon: '🏷️' },
  { key: 'picked_up', label: 'Picked Up', icon: '📦' },
  { key: 'in_transit', label: 'In Transit', icon: '🚚' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '📬' },
  { key: 'delivered', label: 'Delivered', icon: '✅' },
];

function getStepIndex(status: string): number {
  const idx = STATUS_STEPS.findIndex(s => s.key === status);
  return idx >= 0 ? idx : -1;
}

export default function TrackOrder() {
  const [query, setQuery] = useState('');
  const [shipment, setShipment] = useState<ShipmentInfo | null>(null);
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setShipment(null);
    setTracking(null);

    try {
      // First try to find the shipment by ID or tracking number
      const shipRes = await fetch(`/api/shipping/public-track?q=${encodeURIComponent(query.trim())}`);
      if (!shipRes.ok) {
        const data = await shipRes.json();
        throw new Error(data.error || 'Shipment not found');
      }

      const shipData = await shipRes.json();
      setShipment(shipData.shipment);

      if (shipData.tracking) {
        setTracking(shipData.tracking);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find shipment. Please check your tracking number.');
    } finally {
      setLoading(false);
    }
  }

  const currentStep = shipment ? getStepIndex(shipment.status) : -1;

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header */}
      <header className="border-b border-[rgba(27,42,91,0.08)] bg-white">
        <div className="max-w-[900px] mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-serif text-xl tracking-[0.15em] text-[#1B2A5B] font-bold">AWULA K</a>
          <a href="/orders" className="text-sm text-[#5C3D2E] hover:text-[#1B2A5B]">← Back to Shop</a>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-6 py-12">
        <h1 className="font-serif text-3xl text-[#1B2A5B] mb-2">Track Your Order</h1>
        <p className="text-[#5C3D2E] mb-8">Enter your shipment ID or tracking number to see the latest status.</p>

        {/* Search form */}
        <form onSubmit={handleTrack} className="flex gap-3 mb-10">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g. SHP-0001 or 1Z999AA10123456784"
            className="flex-1 px-4 py-3 border border-[rgba(27,42,91,0.15)] rounded-md bg-white text-[#1B2A5B] placeholder:text-[#8B7569] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/20 focus:border-[#1B2A5B]"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-[#1B2A5B] text-white rounded-md hover:bg-[#2C3E7A] transition disabled:opacity-50 font-medium"
          >
            {loading ? 'Tracking...' : 'Track'}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-lg mb-8">
            {error}
          </div>
        )}

        {shipment && (
          <div className="space-y-8">
            {/* Shipment Summary */}
            <div className="bg-white rounded-xl border border-[rgba(27,42,91,0.08)] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif text-xl text-[#1B2A5B]">Shipment {shipment.shipmentId}</h2>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  shipment.status === 'delivered' ? 'bg-green-100 text-green-800' :
                  shipment.status === 'in_transit' ? 'bg-blue-100 text-blue-800' :
                  shipment.status === 'exception' ? 'bg-red-100 text-red-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  {shipment.status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-[#8B7569]">Carrier</span>
                  <p className="font-medium text-[#1B2A5B]">{shipment.carrier}</p>
                </div>
                <div>
                  <span className="text-[#8B7569]">Tracking #</span>
                  <p className="font-medium text-[#1B2A5B] font-mono text-xs">{shipment.trackingNumber || '—'}</p>
                </div>
                <div>
                  <span className="text-[#8B7569]">Est. Delivery</span>
                  <p className="font-medium text-[#1B2A5B]">
                    {shipment.estimatedDelivery
                      ? new Date(shipment.estimatedDelivery).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-[#8B7569]">Shipped</span>
                  <p className="font-medium text-[#1B2A5B]">
                    {new Date(shipment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>

            {/* Progress Stepper */}
            {shipment.status !== 'exception' && shipment.status !== 'returned' && (
              <div className="bg-white rounded-xl border border-[rgba(27,42,91,0.08)] p-6">
                <h3 className="font-serif text-lg text-[#1B2A5B] mb-6">Shipping Progress</h3>
                <div className="flex items-center justify-between">
                  {STATUS_STEPS.map((step, i) => (
                    <div key={step.key} className="flex flex-col items-center flex-1 relative">
                      {/* Connector line */}
                      {i > 0 && (
                        <div className={`absolute top-5 right-1/2 w-full h-0.5 -z-0 ${
                          i <= currentStep ? 'bg-[#1B2A5B]' : 'bg-[rgba(27,42,91,0.12)]'
                        }`} />
                      )}
                      {/* Circle */}
                      <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                        i < currentStep ? 'bg-[#1B2A5B] text-white' :
                        i === currentStep ? 'bg-[#C41E3A] text-white ring-4 ring-[#C41E3A]/20' :
                        'bg-[#F0EBE3] text-[#8B7569]'
                      }`}>
                        {i < currentStep ? '✓' : step.icon}
                      </div>
                      <span className={`mt-2 text-xs text-center ${
                        i <= currentStep ? 'text-[#1B2A5B] font-semibold' : 'text-[#8B7569]'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tracking Timeline */}
            {tracking && tracking.events.length > 0 && (
              <div className="bg-white rounded-xl border border-[rgba(27,42,91,0.08)] p-6">
                <h3 className="font-serif text-lg text-[#1B2A5B] mb-6">Tracking Details</h3>
                <div className="space-y-0">
                  {tracking.events.map((event, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full mt-1 ${
                          i === 0 ? 'bg-[#C41E3A]' : 'bg-[rgba(27,42,91,0.2)]'
                        }`} />
                        {i < tracking.events.length - 1 && (
                          <div className="w-px flex-1 bg-[rgba(27,42,91,0.1)]" />
                        )}
                      </div>
                      <div className="pb-6">
                        <p className="text-sm font-medium text-[#1B2A5B]">{event.description}</p>
                        <p className="text-xs text-[#8B7569] mt-0.5">
                          {event.location && `${event.location} · `}
                          {event.date} {event.time && `at ${event.time}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Return request link */}
            {shipment.status === 'delivered' && (
              <div className="text-center">
                <p className="text-sm text-[#8B7569] mb-2">Need to make a return?</p>
                <a
                  href={`/orders/return?shipment=${shipment.shipmentId}`}
                  className="inline-flex items-center px-6 py-2.5 border border-[#1B2A5B] text-[#1B2A5B] rounded-md hover:bg-[#1B2A5B] hover:text-white transition text-sm font-medium"
                >
                  Request a Return
                </a>
              </div>
            )}
          </div>
        )}

        {/* If no search yet, show help text */}
        {!shipment && !error && !loading && (
          <div className="text-center py-16 text-[#8B7569]">
            <div className="text-5xl mb-4">📦</div>
            <p className="text-lg">Enter your shipment ID or tracking number above</p>
            <p className="text-sm mt-2">You can find this in your order confirmation email</p>
          </div>
        )}
      </main>
    </div>
  );
}
