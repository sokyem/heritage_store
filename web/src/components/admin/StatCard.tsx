'use client';

import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: React.ReactNode;
  color?: string;
}

export default function StatCard({
  label,
  value,
  trend,
  trendValue,
  icon,
  color = '#1B2A5B',
}: StatCardProps) {
  const trendColors = {
    up: 'text-emerald-600',
    down: 'text-red-500',
    neutral: 'text-gray-400',
  };

  const trendIcons = {
    up: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
    ),
    down: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    ),
    neutral: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
    ),
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200/60 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            {label}
          </p>
          <p
            className="mt-2 text-2xl font-bold"
            style={{
              fontFamily: 'var(--font-heading), serif',
              color,
            }}
          >
            {value}
          </p>
          {trend && trendValue && (
            <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${trendColors[trend]}`}>
              {trendIcons[trend]}
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${color}10`, color }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
