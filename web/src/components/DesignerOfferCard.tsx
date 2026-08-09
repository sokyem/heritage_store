'use client';

import { useState, useEffect, useCallback } from 'react';

interface OfferData {
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

interface DesignerOfferCardProps {
  offer: OfferData;
  onRespond: (offerId: string, action: 'accept' | 'decline') => void;
  isResponding: boolean;
}

export default function DesignerOfferCard({
  offer,
  onRespond,
  isResponding,
}: DesignerOfferCardProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  const calcSeconds = useCallback(() => {
    const remaining = Math.max(
      0,
      Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)
    );
    return remaining;
  }, [offer.expiresAt]);

  useEffect(() => {
    setSecondsLeft(calcSeconds());

    const interval = setInterval(() => {
      const remaining = calcSeconds();
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setIsExpired(true);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calcSeconds]);

  const progress = Math.max(0, secondsLeft / 60); // 0-1 based on 60s
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference * (1 - progress);

  const priorityColors: Record<string, string> = {
    RUSH: '#DC2626',
    HIGH: '#EA580C',
    NORMAL: '#1B2A5B',
    LOW: '#6B7280',
  };

  if (isExpired) {
    return (
      <div style={{
        background: '#F9FAFB',
        border: '1px solid #E5E7EB',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center',
        color: '#9CA3AF',
      }}>
        <p style={{ fontSize: '18px', fontWeight: 600 }}>Offer Expired</p>
        <p style={{ fontSize: '14px', marginTop: '4px' }}>
          This offer has timed out. Waiting for next available order...
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: '#FFFFFF',
      border: '2px solid #1B2A5B',
      borderRadius: '16px',
      padding: '32px',
      boxShadow: '0 4px 24px rgba(27, 42, 91, 0.12)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '24px',
      }}>
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px',
          }}>
            <h2 style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#1B2A5B',
              fontFamily: 'Playfair Display, serif',
              margin: 0,
            }}>
              New Order Offer
            </h2>
            <span style={{
              background: priorityColors[offer.order.priority] || '#1B2A5B',
              color: '#FFF',
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
            }}>
              {offer.order.priority}
            </span>
          </div>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
            {offer.offerId} &middot; {offer.order.orderId}
          </p>
        </div>

        {/* Countdown Timer */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r="45"
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="6"
            />
            <circle
              cx="50" cy="50" r="45"
              fill="none"
              stroke={secondsLeft <= 15 ? '#DC2626' : '#1B2A5B'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
            />
            <text
              x="50" y="46"
              textAnchor="middle"
              fontSize="28"
              fontWeight="700"
              fill={secondsLeft <= 15 ? '#DC2626' : '#1B2A5B'}
            >
              {secondsLeft}
            </text>
            <text
              x="50" y="62"
              textAnchor="middle"
              fontSize="10"
              fill="#9CA3AF"
            >
              seconds
            </text>
          </svg>
        </div>
      </div>

      {/* Order Details */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginBottom: '24px',
        padding: '16px',
        background: '#FAF7F2',
        borderRadius: '8px',
      }}>
        {offer.order.eventType && (
          <div>
            <p style={{ fontSize: '12px', color: '#8B7569', margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 600 }}>
              Event Type
            </p>
            <p style={{ fontSize: '15px', color: '#1B2A5B', margin: 0, fontWeight: 500 }}>
              {offer.order.eventType}
            </p>
          </div>
        )}
        {offer.order.deadline && (
          <div>
            <p style={{ fontSize: '12px', color: '#8B7569', margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 600 }}>
              Deadline
            </p>
            <p style={{ fontSize: '15px', color: '#1B2A5B', margin: 0, fontWeight: 500 }}>
              {offer.order.deadline}
            </p>
          </div>
        )}
        {offer.order.estimatedPrice && (
          <div>
            <p style={{ fontSize: '12px', color: '#8B7569', margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 600 }}>
              Estimated Price
            </p>
            <p style={{ fontSize: '15px', color: '#1B2A5B', margin: 0, fontWeight: 500 }}>
              ${offer.order.estimatedPrice.toLocaleString()}
            </p>
          </div>
        )}
        {offer.order.clientCity && (
          <div>
            <p style={{ fontSize: '12px', color: '#8B7569', margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 600 }}>
              Location
            </p>
            <p style={{ fontSize: '15px', color: '#1B2A5B', margin: 0, fontWeight: 500 }}>
              {offer.order.clientCity}
            </p>
          </div>
        )}
      </div>

      {/* Design Description */}
      {offer.order.designDescription && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '12px', color: '#8B7569', margin: '0 0 4px', textTransform: 'uppercase', fontWeight: 600 }}>
            Design Brief
          </p>
          <p style={{ fontSize: '14px', color: '#374151', margin: 0, lineHeight: 1.5 }}>
            {offer.order.designDescription.length > 200
              ? offer.order.designDescription.substring(0, 200) + '...'
              : offer.order.designDescription}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '12px',
      }}>
        <button
          onClick={() => onRespond(offer.id, 'accept')}
          disabled={isResponding}
          style={{
            flex: 2,
            padding: '14px 24px',
            background: isResponding ? '#9CA3AF' : '#16A34A',
            color: '#FFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 700,
            cursor: isResponding ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {isResponding ? 'Processing...' : 'Accept Order'}
        </button>
        <button
          onClick={() => onRespond(offer.id, 'decline')}
          disabled={isResponding}
          style={{
            flex: 1,
            padding: '14px 24px',
            background: '#F3F4F6',
            color: '#6B7280',
            border: '1px solid #D1D5DB',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: isResponding ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
