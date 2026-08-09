'use client';

import React from 'react';

type BadgeType =
  | 'order'
  | 'payment'
  | 'production'
  | 'rental'
  | 'consultation'
  | 'custom';

interface StatusBadgeProps {
  status: string;
  type?: BadgeType;
}

const colorMap: Record<string, { bg: string; text: string; dot: string }> = {
  // Positive / success
  completed:    { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500' },
  paid:         { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500' },
  delivered:    { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500' },
  active:       { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500' },
  approved:     { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500' },
  confirmed:    { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500' },
  returned:     { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500' },

  // In-progress / info
  processing:   { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500' },
  in_progress:  { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500' },
  shipped:      { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500' },
  rented:       { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500' },
  scheduled:    { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500' },
  cutting:      { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500' },
  sewing:       { bg: 'bg-blue-50',     text: 'text-blue-700',     dot: 'bg-blue-500' },
  fitting:      { bg: 'bg-indigo-50',   text: 'text-indigo-700',   dot: 'bg-indigo-500' },
  finishing:    { bg: 'bg-indigo-50',   text: 'text-indigo-700',   dot: 'bg-indigo-500' },

  // Warning / pending
  pending:      { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500' },
  awaiting:     { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500' },
  review:       { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500' },
  on_hold:      { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500' },
  overdue:      { bg: 'bg-orange-50',   text: 'text-orange-700',   dot: 'bg-orange-500' },
  partial:      { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500' },
  deposit_paid: { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500' },

  // Danger / negative
  cancelled:    { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-500' },
  failed:       { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-500' },
  rejected:     { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-500' },
  refunded:     { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-500' },
  damaged:      { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-500' },
  lost:         { bg: 'bg-red-50',      text: 'text-red-700',      dot: 'bg-red-500' },

  // Neutral / draft
  draft:        { bg: 'bg-gray-100',    text: 'text-gray-600',     dot: 'bg-gray-400' },
  new:          { bg: 'bg-gray-100',    text: 'text-gray-600',     dot: 'bg-gray-400' },
  inquiry:      { bg: 'bg-gray-100',    text: 'text-gray-600',     dot: 'bg-gray-400' },
  available:    { bg: 'bg-gray-100',    text: 'text-gray-600',     dot: 'bg-gray-400' },
};

const fallback = { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };

export default function StatusBadge({ status }: StatusBadgeProps) {
  const key = status.toLowerCase().replace(/[\s-]+/g, '_');
  const colors = colorMap[key] || fallback;
  const display = status.replace(/[_-]/g, ' ');

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${colors.bg} ${colors.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {display}
    </span>
  );
}
