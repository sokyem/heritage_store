'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

interface Order {
  id: string;
  product: { name: string; price: number };
  status: string;
  amount?: number;
  payment?: { status: string; amount?: number };
  updatedAt: string;
  customNotes?: string;
  shipment?: {
    id: string;
    shipmentId: string;
    trackingNumber: string | null;
    carrier: string;
    status: string;
    shippedAt: string | null;
  } | null;
}

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  label_created: 'Label created',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  returned: 'Returned',
  exception: 'Delivery issue',
};

// Build the public carrier tracking URL so "Track" opens the customer's
// package directly on USPS / UPS / FedEx without needing them to paste
// the number anywhere.
function carrierTrackingUrl(carrier: string, trackingNumber: string): string {
  const tn = encodeURIComponent(trackingNumber);
  switch (carrier.toUpperCase()) {
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${tn}`;
    case 'UPS':
      return `https://www.ups.com/track?tracknum=${tn}`;
    case 'FEDEX':
      return `https://www.fedex.com/fedextrack/?tracknumbers=${tn}`;
    case 'DHL':
      return `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`;
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(`${carrier} tracking ${trackingNumber}`)}`;
  }
}

interface Conversation {
  id: string;
  title: string;
  messages: Array<{ id: string; content: string }>;
}

interface ConsultationItem {
  id: string;
  date: string;
  status: string;
  notes: string | null;
  meetingLink: string | null;
  eventType: string | null;
  createdAt: string;
  booking: {
    id: string;
    meetingLink: string | null;
    status: string;
    callSummary: string | null;
    callRecordingUrl: string | null;
    slot: {
      date: string;
      startTime: string;
      endTime: string;
      duration: number;
      type: string;
    } | null;
  } | null;
}

const TYPE_LABELS: Record<string, string> = {
  virtual: 'Virtual',
  in_person: 'In-Person',
  phone: 'Phone',
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pending payment',
  scheduled: 'Confirmed',
  booked: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * A consultation can be booked two ways — the AI-intake slot picker (which
 * carries a `booking` with slot times) or the paid checkout flow (which
 * stores type/time in `notes` and the video link directly). This derives a
 * single display shape from whichever fields are present.
 */
function deriveConsultation(c: ConsultationItem) {
  const lines = (c.notes ?? '').split('\n');
  const typeFromNotes = lines.find((l) => l.startsWith('Type:'))?.slice(5).trim();
  const timeFromNotes = lines.find((l) => l.startsWith('Time:'))?.slice(5).trim();
  const slot = c.booking?.slot ?? null;
  const type =
    typeFromNotes ||
    (slot ? TYPE_LABELS[slot.type] || slot.type : '') ||
    c.eventType ||
    'Consultation';
  return {
    type,
    date: slot?.date || c.date,
    time: timeFromNotes || slot?.startTime || '',
    meetingLink: c.meetingLink || c.booking?.meetingLink || null,
    duration: slot?.duration ?? null,
  };
}

function formatConsultDateTime(date: string, time: string) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return time ? `${date} · ${time}` : date;
  const formatted = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return time ? `${formatted} · ${time}` : formatted;
}

export default function CustomerDashboard() {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [consultations, setConsultations] = useState<ConsultationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated') {
      loadDashboard();
    } else if (status === 'unauthenticated') {
      // Guest users (e.g. clicking "View your order" from an email) would
      // otherwise be stuck on the loading spinner forever because
      // loadDashboard never runs to flip `loading` off.
      setLoading(false);
    }
  }, [status]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [ordersRes, conversationsRes, consultationsRes] = await Promise.all([
        fetch('/api/orders'),
        fetch('/api/conversations'),
        fetch('/api/consultations/mine'),
      ]);

      const ordersData = await ordersRes.json();
      const conversationsData = await conversationsRes.json();
      const consultationsData = await consultationsRes.json();

      const filteredOrders = ordersData.filter((order: any) => {
        return order.user?.email === session?.user?.email;
      });

      setOrders(filteredOrders.map((order: any) => ({
        id: order.id,
        product: order.product || { name: 'Custom Style', price: order.amount || 0 },
        status: order.status,
        amount: order.amount || order.product?.price || 0,
        payment: order.payment,
        updatedAt: order.updatedAt,
        customNotes: order.customNotes,
        shipment: order.shipment || null,
      })));

      setConversations(conversationsData || []);

      // /api/consultations/mine is already scoped to the signed-in user.
      const myConsultations: ConsultationItem[] = Array.isArray(consultationsData)
        ? consultationsData
        : [];

      const now = Date.now();
      const itemTime = (c: ConsultationItem) => {
        const t = new Date(deriveConsultation(c).date).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      const isUpcoming = (c: ConsultationItem) =>
        itemTime(c) >= now - 24 * 60 * 60 * 1000;
      myConsultations.sort((a, b) => {
        const aUp = isUpcoming(a);
        const bUp = isUpcoming(b);
        if (aUp !== bUp) return aUp ? -1 : 1;
        return aUp ? itemTime(a) - itemTime(b) : itemTime(b) - itemTime(a);
      });

      setConsultations(myConsultations.slice(0, 5));
    } catch (error) {
      console.error('Customer dashboard failed to load', error);
    } finally {
      setLoading(false);
    }
  };

  const unpaidOrders = orders.filter((order) => order.payment?.status !== 'succeeded');
  const activeOrders = orders.filter((order) => order.status !== 'completed');

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="label-sm">Loading your dashboard</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="max-w-sm text-center card p-10 shadow-card animate-fade-in">
          <p className="label-accent mb-3">My Account</p>
          <h1 className="text-2xl heading-lg mb-4">Customer Dashboard</h1>
          <hr className="divider mx-auto mb-4" />
          <p className="body-text text-sm mb-8">Sign in to see your orders, messages, and measurement updates.</p>
          <button onClick={() => signIn(undefined, { callbackUrl: '/customer/dashboard' })} className="btn-primary w-full">Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header */}
      <header className="border-b border-[rgba(27,42,91,0.08)] bg-white">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <a href="/" className="text-sm font-medium tracking-[0.15em] uppercase text-[#1B2A5B]">AWULA K</a>
              <span className="text-xs text-[#8B7569]">/</span>
              <span className="text-sm text-[#1B2A5B]">My Dashboard</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#8B7569]">{session.user?.name || session.user?.email}</span>
              {(session.user as { role?: string } | undefined)?.role === 'designer' && (
                <a href="/designer" className="btn-outline text-xs py-1.5 px-4">Designer</a>
              )}
              <button onClick={() => signOut({ callbackUrl: '/' })} className="text-xs text-[#8B7569] hover:text-[#C41E3A] transition-colors">Sign Out</button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 lg:px-10 py-10 space-y-8">
        {/* Stats */}
        <section className="grid gap-4 lg:grid-cols-4 animate-fade-in">
          {[
            { label: 'Active Orders', value: activeOrders.length },
            { label: 'Pending Payments', value: unpaidOrders.length },
            { label: 'Consultations', value: consultations.length },
            { label: 'Inbox Threads', value: conversations.length },
          ].map((stat, i) => (
            <div key={i} className="card p-6 shadow-soft">
              <p className="label-sm text-xs">{stat.label}</p>
              <p className="text-3xl font-normal tracking-wide text-[#1B2A5B] mt-2">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Orders */}
          <div className="space-y-6">
            <div className="card p-6 shadow-soft animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                  <p className="label-accent mb-1">Orders</p>
                  <h2 className="text-xl heading-lg">Your Current Styles</h2>
                </div>
                <a href="/orders" className="btn-outline text-xs py-2 px-4">View All</a>
              </div>

              <div className="space-y-3">
                {orders.length ? orders.map((order) => (
                  <div key={order.id} className="p-4 rounded-[4px] border border-[rgba(27,42,91,0.06)] bg-white">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[#1B2A5B]">{order.product.name}</p>
                        <p className="text-xs text-[#8B7569] mt-1">{order.status.replace('_', ' ')}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-[#1B2A5B]">${(order.amount ?? order.payment?.amount ?? order.product?.price ?? 0).toFixed(2)}</span>
                        <span className={`status-badge ${order.payment?.status === 'succeeded' ? 'status-success' : 'status-pending'}`}>
                          {order.payment?.status || 'pending'}
                        </span>
                      </div>
                    </div>
                    {order.shipment?.trackingNumber && (
                      <div className="mt-3 px-3 py-2.5 rounded-[4px] bg-[#FAF7F2] border border-[rgba(27,42,91,0.06)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#8B7569] mb-1">
                              {order.shipment.carrier} · {SHIPMENT_STATUS_LABELS[order.shipment.status] || order.shipment.status}
                            </p>
                            <p className="text-xs font-mono text-[#1B2A5B] truncate">
                              {order.shipment.trackingNumber}
                            </p>
                          </div>
                          <a
                            href={carrierTrackingUrl(order.shipment.carrier, order.shipment.trackingNumber)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 text-xs font-semibold text-[#C41E3A] hover:underline whitespace-nowrap"
                          >
                            Track →
                          </a>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {order.payment?.status !== 'succeeded' ? (
                        <a href={`/checkout/${order.id}`} className="btn-accent text-xs py-1.5 px-4">Pay Now</a>
                      ) : (
                        <span className="status-badge status-success">Paid</span>
                      )}
                      <a href="/inbox" className="btn-outline text-xs py-1.5 px-4">Message</a>
                    </div>
                  </div>
                )) : (
                  <div className="py-12 text-center border border-dashed border-[rgba(27,42,91,0.12)] rounded-[4px]">
                    <p className="text-sm font-medium text-[#1B2A5B] mb-2">No orders yet</p>
                    <p className="text-sm text-[#8B7569] mb-6">Begin with a consultation or place your first custom order.</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <a href="/consults" className="btn-accent text-xs py-2 px-5">Book a Consultation</a>
                      <a href="/orders" className="btn-outline text-xs py-2 px-5">Shop</a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Upcoming Consultations */}
            <div className="card p-6 shadow-soft animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                  <p className="label-accent mb-1">Consultations</p>
                  <h2 className="text-xl heading-lg">Upcoming Consultations</h2>
                </div>
                <a href="/consults" className="btn-outline text-xs py-2 px-4">Book New</a>
              </div>

              <div className="space-y-3">
                {consultations.length ? consultations.map((c) => {
                  const info = deriveConsultation(c);
                  const isCancelled = c.status === 'cancelled';
                  const statusLabel = STATUS_LABELS[c.status] || c.status.replace(/_/g, ' ');
                  const statusClass =
                    c.status === 'pending_payment' || isCancelled
                      ? 'status-pending'
                      : 'status-success';
                  return (
                    <div key={c.id} className="p-4 rounded-[4px] border border-[#F0EBE3] bg-[#FAF7F2]">
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[#1B2A5B]">
                            {formatConsultDateTime(info.date, info.time)}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="status-badge bg-[#1B2A5B] text-white">{info.type}</span>
                            {info.duration != null && (
                              <span className="text-xs text-[#8B7569]">{info.duration} min</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start">
                          <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                        </div>
                      </div>
                      {c.status === 'pending_payment' && (
                        <p className="mt-2 text-xs text-[#C41E3A]">
                          Payment not completed — your consultation is held but not yet confirmed.
                        </p>
                      )}
                      {info.meetingLink && !isCancelled ? (
                        <div className="mt-3">
                          <a
                            href={info.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-xs font-medium py-2 px-5 rounded-[4px] bg-[#C41E3A] text-white hover:opacity-90 transition-opacity"
                          >
                            Join Video Consultation
                          </a>
                        </div>
                      ) : !isCancelled ? (
                        <p className="mt-3 text-xs text-[#8B7569]">
                          Your video link will appear here once your session is set up.
                        </p>
                      ) : null}

                      {/* Studio recap — surfaces the share-ready summary and
                          recording the studio captured after the call. Raw
                          admin notes stay internal. */}
                      {(c.booking?.callSummary || c.booking?.callRecordingUrl) && (
                        <div className="mt-4 pt-3 border-t border-[rgba(27,42,91,0.08)]">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1B2A5B] mb-2">
                            Studio Recap
                          </p>
                          {c.booking.callSummary && (
                            <p className="text-xs text-[#5C3D2E] whitespace-pre-line leading-relaxed mb-3">
                              {c.booking.callSummary}
                            </p>
                          )}
                          {c.booking.callRecordingUrl && (
                            <a
                              href={c.booking.callRecordingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1B2A5B] underline hover:no-underline"
                            >
                              ⏺ Watch the recording
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <div className="py-10 text-center border border-dashed border-[rgba(27,42,91,0.12)] rounded-[4px]">
                    <p className="text-sm text-[#8B7569] mb-3">No consultations booked yet.</p>
                    <a href="/consults" className="btn-accent text-xs py-2 px-5">Book a Consultation</a>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="card p-6 shadow-soft animate-fade-in">
                <h3 className="text-sm font-medium tracking-[0.06em] uppercase text-[#1B2A5B] mb-2">Measurements</h3>
                <p className="text-sm text-[#8B7569] mb-4">Update your fit profile before your next fitting.</p>
                <a href="/measurements" className="btn-primary text-xs py-2 px-4 inline-block">Update</a>
              </div>
              <div className="card p-6 shadow-soft animate-fade-in">
                <h3 className="text-sm font-medium tracking-[0.06em] uppercase text-[#1B2A5B] mb-2">Message Studio</h3>
                <p className="text-sm text-[#8B7569] mb-4">Ask about styling, delivery, or fit preferences.</p>
                <a href="/inbox" className="btn-primary text-xs py-2 px-4 inline-block">Open Inbox</a>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="card p-6 shadow-soft animate-fade-in">
              <h3 className="text-sm font-medium tracking-[0.06em] uppercase text-[#1B2A5B] mb-3">Studio Notes</h3>
              <p className="text-sm text-[#8B7569] leading-relaxed">
                Your AWULA K team will share fitting updates, couture previews, and delivery confirmations here.
              </p>
            </div>
            <div className="card p-6 shadow-soft animate-fade-in">
              <h3 className="text-sm font-medium tracking-[0.06em] uppercase text-[#1B2A5B] mb-3">Conversations</h3>
              {conversations.length ? (
                <ul className="space-y-3">
                  {conversations.slice(0, 3).map((conversation) => (
                    <li key={conversation.id} className="p-3 rounded-[4px] bg-[#F0EBE3]">
                      <p className="text-sm font-medium text-[#1B2A5B]">{conversation.title}</p>
                      <p className="text-xs text-[#8B7569] mt-1">
                        {conversation.messages?.[0]?.content || 'Latest update will appear here.'}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#8B7569]">No conversations yet.</p>
              )}
            </div>
            <div className="p-6 rounded-[4px] bg-[#1B2A5B] text-white">
              <p className="text-xs font-medium tracking-[0.09em] uppercase text-white/60 mb-3">Quick Links</p>
              <div className="flex flex-col gap-2 text-sm">
                <a href="/consults" className="hover:text-white/80 transition-colors">Book Consultation</a>
                <a href="/measurements" className="hover:text-white/80 transition-colors">My Measurements</a>
                <a href="/" className="hover:text-white/80 transition-colors">Browse Collection</a>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
