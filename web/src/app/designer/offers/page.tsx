'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DesignerOfferCard from '@/components/DesignerOfferCard';
import NotificationsBell from '@/components/NotificationsBell';
import { showSuccessToast, showErrorToast } from '@/components/Toast';

interface ActiveOffer {
  id: string;
  offerId: string;
  status: string;
  expiresAt: string;
  offeredAt: string;
  order: {
    id: string;
    orderId: string;
    eventType: string | null;
    deadline: string | null;
    estimatedPrice: number | null;
    designDescription: string | null;
    clientCity: string | null;
    clientName: string | null;
    priority: string;
  };
}

interface HistoryOffer {
  id: string;
  offerId: string;
  status: string;
  respondedAt: string | null;
  offeredAt: string;
  declineReason: string | null;
  order: {
    orderId: string;
    eventType: string | null;
    estimatedPrice: number | null;
  };
}

export default function DesignerOffersPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [activeOffers, setActiveOffers] = useState<ActiveOffer[]>([]);
  const [history, setHistory] = useState<HistoryOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);

  const fetchOffers = useCallback(async () => {
    try {
      const response = await fetch('/api/designer/offers');
      if (response.ok) {
        const data = await response.json();
        setActiveOffers(data.active);
        setHistory(data.history);
      }
    } catch (error) {
      console.error('Failed to fetch offers:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (authStatus !== 'authenticated') return;

    fetchOffers();

    // Poll every 3 seconds for active offers
    const interval = setInterval(fetchOffers, 3000);
    return () => clearInterval(interval);
  }, [authStatus, router, fetchOffers]);

  const handleRespond = async (offerId: string, action: 'accept' | 'decline') => {
    setResponding(true);
    try {
      const response = await fetch(`/api/designer/offers/${offerId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (response.ok) {
        showSuccessToast(action === 'accept' ? 'Accepted' : 'Declined', data.message);
        await fetchOffers();
        if (action === 'accept') {
          // Redirect to workspace after short delay
          setTimeout(() => router.push('/designer'), 1500);
        }
      } else {
        showErrorToast('Error', data.error || 'Failed to respond');
      }
    } catch (error) {
      showErrorToast('Error', 'Network error. Please try again.');
    } finally {
      setResponding(false);
    }
  };

  if (authStatus === 'loading' || loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#FAF7F2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <p style={{ color: '#8B7569', fontSize: '16px' }}>Loading offers...</p>
      </div>
    );
  }

  const statusColors: Record<string, { bg: string; text: string }> = {
    accepted: { bg: '#DCFCE7', text: '#16A34A' },
    declined: { bg: '#FEE2E2', text: '#DC2626' },
    expired: { bg: '#F3F4F6', text: '#6B7280' },
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FAF7F2',
    }}>
      {/* Header */}
      <header style={{
        background: '#1B2A5B',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => router.push('/designer')}
            style={{
              background: 'none',
              border: 'none',
              color: '#FAF7F2',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            &larr; Workspace
          </button>
          <h1 style={{
            color: '#FAF7F2',
            fontSize: '20px',
            fontWeight: 700,
            fontFamily: 'Playfair Display, serif',
            margin: 0,
          }}>
            Incoming Offers
          </h1>
        </div>
        <NotificationsBell />
      </header>

      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 16px' }}>
        {/* Active Offers */}
        {activeOffers.length > 0 ? (
          <div style={{ marginBottom: '40px' }}>
            {activeOffers.map((offer) => (
              <DesignerOfferCard
                key={offer.id}
                offer={offer}
                onRespond={handleRespond}
                isResponding={responding}
              />
            ))}
          </div>
        ) : (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            padding: '48px 24px',
            textAlign: 'center',
            marginBottom: '40px',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9711;</div>
            <h3 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#1B2A5B',
              margin: '0 0 8px',
            }}>
              No active offers
            </h3>
            <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
              New orders will appear here automatically. This page refreshes every 3 seconds.
            </p>
          </div>
        )}

        {/* Offer History */}
        {history.length > 0 && (
          <div>
            <h3 style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1B2A5B',
              marginBottom: '12px',
            }}>
              Recent History
            </h3>
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: '12px',
              overflow: 'hidden',
            }}>
              {history.map((offer, i) => {
                const colors = statusColors[offer.status] || statusColors.expired;
                return (
                  <div
                    key={offer.id}
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: i < history.length - 1 ? '1px solid #F3F4F6' : 'none',
                    }}
                  >
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: '#1B2A5B', margin: '0 0 2px' }}>
                        {offer.order.orderId}
                        {offer.order.eventType && ` - ${offer.order.eventType}`}
                      </p>
                      <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0 }}>
                        {new Date(offer.offeredAt).toLocaleDateString()}
                        {offer.order.estimatedPrice && ` · $${offer.order.estimatedPrice.toLocaleString()}`}
                      </p>
                    </div>
                    <span style={{
                      background: colors.bg,
                      color: colors.text,
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: '6px',
                      textTransform: 'capitalize',
                    }}>
                      {offer.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
