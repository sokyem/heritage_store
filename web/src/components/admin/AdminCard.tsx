'use client';

import React from 'react';

interface AdminCardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  padding?: string;
  className?: string;
  children: React.ReactNode;
}

export default function AdminCard({
  title,
  subtitle,
  action,
  padding = 'p-6',
  className = '',
  children,
}: AdminCardProps) {
  return (
    <div
      className={`bg-white rounded-lg border border-gray-200/60 shadow-sm ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            {title && (
              <h3
                className="text-base font-semibold text-[#1B2A5B]"
                style={{ fontFamily: 'var(--font-heading), serif' }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={padding}>{children}</div>
    </div>
  );
}
