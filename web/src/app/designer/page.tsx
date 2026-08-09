'use client';

import { useEffect, useState } from 'react';
import NotificationsBell from '@/components/NotificationsBell';
import { showSuccessToast, showErrorToast } from '@/components/Toast';

interface Order {
  id: string;
  customer: string;
  email: string;
  product: string;
  status: string;
  designer?: string;
  amount?: number;
  paymentStatus?: string;
  createdAt: string;
  customNotes?: string;
}

const statusSteps = [
  { key: 'requested', label: 'Requested' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_production', label: 'In Production' },
  { key: 'fitting', label: 'Fitting' },
  { key: 'completed', label: 'Completed' },
];

function getNextStatus(status: string) {
  const currentIndex = statusSteps.findIndex((step) => step.key === status);
  return currentIndex < statusSteps.length - 1 ? statusSteps[currentIndex + 1].key : null;
}

function formatStatusLabel(status: string) {
  return statusSteps.find((step) => step.key === status)?.label || status;
}

export default function DesignerWorkspace() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOfferCount, setActiveOfferCount] = useState(0);

  useEffect(() => {
    fetchOrders();
    fetchActiveOffers();
    // Poll for new offers every 5 seconds
    const offerInterval = setInterval(fetchActiveOffers, 5000);
    return () => clearInterval(offerInterval);
  }, []);

  const fetchActiveOffers = async () => {
    try {
      const response = await fetch('/api/designer/offers');
      if (response.ok) {
        const data = await response.json();
        setActiveOfferCount(data.active?.length || 0);
      }
    } catch {
      // Silently fail — designer may not be linked
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/orders');
      const data = await response.json();
      setOrders(
        data.map((order: any) => ({
          id: order.id,
          customer: order.user?.name || order.user?.email || 'Guest',
          email: order.user?.email || '',
          product: order.product?.name || 'Custom Order',
          status: order.status,
          designer: order.customNotes || 'Studio Team',
          amount: order.amount || order.product?.price || 0,
          paymentStatus: order.payment?.status || 'pending',
          createdAt: order.createdAt,
          customNotes: order.customNotes,
        }))
      );
    } catch (error) {
      console.error('Designer workspace load failed', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Unable to update status');
      }

      showSuccessToast('Status updated', `${formatStatusLabel(newStatus)} has been applied`);
      fetchOrders();
    } catch (error) {
      console.error(error);
      showErrorToast('Update failed', 'Could not update the order status.');
    }
  };

  const assignDesigner = async (orderId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designer: 'AWULA_K Studio' }),
      });

      if (!response.ok) {
        throw new Error('Unable to assign designer');
      }

      showSuccessToast('Designer assigned', 'This order is now linked to your studio workflow.');
      fetchOrders();
    } catch (error) {
      console.error(error);
      showErrorToast('Assignment failed', 'Could not assign a designer to this order.');
    }
  };

  const inProductionOrders = orders.filter((order) => order.status === 'in_production');
  const completingOrders = orders.filter((order) => order.status === 'fitting' || order.status === 'scheduled');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="label-sm">Preparing Designer Workspace</p>
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
              <span className="text-sm text-[#1B2A5B]">Designer Workspace</span>
            </div>
            <div className="flex items-center gap-4">
              <NotificationsBell />
              <a href="/customer/dashboard" className="btn-outline text-xs py-1.5 px-4">Customer</a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 lg:px-10 py-10">
        {/* Active Offer Banner */}
        {activeOfferCount > 0 && (
          <a
            href="/designer/offers"
            className="block mb-6 animate-fade-in"
            style={{
              background: 'linear-gradient(135deg, #1B2A5B 0%, #2D4A8C 100%)',
              borderRadius: '12px',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              textDecoration: 'none',
              cursor: 'pointer',
              border: '2px solid #C41E3A',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{
                background: '#C41E3A',
                color: '#FFF',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 700,
              }}>
                {activeOfferCount}
              </span>
              <div>
                <p style={{ color: '#FFFFFF', fontSize: '16px', fontWeight: 600, margin: 0 }}>
                  New Order {activeOfferCount === 1 ? 'Offer' : 'Offers'} Available
                </p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', margin: 0 }}>
                  Respond before the timer runs out
                </p>
              </div>
            </div>
            <span style={{ color: '#FAF7F2', fontSize: '14px', fontWeight: 500 }}>
              View &rarr;
            </span>
          </a>
        )}

        {/* Stats */}
        <div className="grid gap-4 lg:grid-cols-3 mb-8 animate-fade-in">
          {[
            { label: 'Active Orders', value: orders.length },
            { label: 'In Production', value: inProductionOrders.length },
            { label: 'Fitting Requests', value: completingOrders.length },
          ].map((stat, i) => (
            <div key={i} className="card p-6 shadow-soft">
              <p className="label-sm text-xs">{stat.label}</p>
              <p className="text-3xl font-normal tracking-wide text-[#1B2A5B] mt-2">{stat.value}</p>
            </div>
          ))}
        </div>

        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Production Board */}
          <div className="card p-6 shadow-soft animate-fade-in">
            <div className="mb-6">
              <p className="label-accent mb-1">Production Board</p>
              <h2 className="text-xl heading-lg">Today&apos;s Orders</h2>
            </div>
            <div className="space-y-3">
              {orders.map((order) => {
                const nextStatus = getNextStatus(order.status);
                return (
                  <div key={order.id} className="p-4 rounded-[4px] border border-[rgba(27,42,91,0.06)] bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#8B7569]">
                          {order.customer} &middot; {order.email}
                        </p>
                        <h3 className="text-sm font-medium text-[#1B2A5B] mt-1">{order.product}</h3>
                      </div>
                      <span className="status-badge status-info">
                        {formatStatusLabel(order.status)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {[
                        { label: 'Designer', value: order.designer },
                        { label: 'Total', value: `$${order.amount?.toFixed(2)}` },
                        { label: 'Payment', value: order.paymentStatus },
                      ].map((field, j) => (
                        <div key={j} className="p-3 rounded-[4px] bg-[#F0EBE3]">
                          <p className="text-[10px] uppercase tracking-[0.09em] text-[#8B7569]">{field.label}</p>
                          <p className="text-sm font-medium text-[#1B2A5B] mt-1">{field.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {nextStatus ? (
                        <button
                          className="btn-accent text-xs py-1.5 px-4"
                          onClick={() => updateOrderStatus(order.id, nextStatus)}
                        >
                          Move to {formatStatusLabel(nextStatus)}
                        </button>
                      ) : (
                        <span className="status-badge status-success">Ready for delivery</span>
                      )}
                      <button
                        className="btn-outline text-xs py-1.5 px-4"
                        onClick={() => assignDesigner(order.id)}
                      >
                        Confirm Designer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="card p-6 shadow-soft animate-fade-in">
              <h2 className="text-sm font-medium tracking-[0.06em] uppercase text-[#1B2A5B] mb-4">Workflow Highlights</h2>
              <div className="space-y-3">
                {[
                  { title: 'Design Notes', body: 'Keep conversations flowing across orders, confirm fabric appointments, and move the most urgent pieces into fitting with confidence.' },
                  { title: 'Client Attention', body: 'Orders with fold-in updates appear first. Use the status tools to keep the team aligned and the customer informed.' },
                  { title: 'Production Rhythm', body: 'Move three orders through production each day to maintain a premium supply cadence for bespoke deliveries.' },
                ].map((item, i) => (
                  <div key={i} className="p-4 rounded-[4px] bg-[#F0EBE3]">
                    <p className="text-xs font-medium tracking-[0.06em] uppercase text-[#C41E3A] mb-1">{item.title}</p>
                    <p className="text-sm text-[#5C3D2E] leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-[4px] bg-[#1B2A5B] text-white">
              <p className="text-xs font-medium tracking-[0.09em] uppercase text-white/60 mb-3">Quick Actions</p>
              <div className="flex flex-col gap-2 text-sm">
                <a href="/designer/offers" className="hover:text-white/80 transition-colors">View Offers{activeOfferCount > 0 ? ` (${activeOfferCount})` : ''}</a>
                <a href="/inbox" className="hover:text-white/80 transition-colors">Open Inbox</a>
                <a href="/consults" className="hover:text-white/80 transition-colors">View Consultations</a>
                <a href="/customer/dashboard" className="hover:text-white/80 transition-colors">Customer View</a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
