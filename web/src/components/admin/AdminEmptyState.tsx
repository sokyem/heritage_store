'use client';

import React from 'react';

// Canonical empty-state card for the admin. Renders a centered card with
// an icon, title, supporting copy, and an optional action.
//
// Accepts BOTH the legacy "description + actionLabel/onAction" API and the
// alternate "hint + action node" API used elsewhere in the admin. New
// callers should prefer `hint` + `action`; the old props remain so
// existing imports keep compiling without a sweep.
//
// Imported via either path:
//   import AdminEmptyState from '@/components/admin/AdminEmptyState';
//   import { AdminEmptyState } from '@/components/admin/AdminErrorBanner'; // re-exported

export interface AdminEmptyStateProps {
  icon?: React.ReactNode | string;
  title: string;

  /** Newer prop name. */
  hint?: string;
  /** Legacy prop name — same meaning as hint. */
  description?: string;

  /** Newer prop — render any action node (button, link, etc.). */
  action?: React.ReactNode;

  /** Legacy prop pair — kept for back-compat with older callers. */
  actionLabel?: string;
  onAction?: () => void;

  /** Apply the card chrome (border, surface, shadow). Default true. */
  withCard?: boolean;
}

export default function AdminEmptyState({
  icon,
  title,
  hint,
  description,
  action,
  actionLabel,
  onAction,
  withCard = true,
}: AdminEmptyStateProps) {
  const supportingText = hint ?? description;

  const renderIcon = () => {
    if (icon === undefined || icon === null) {
      // Default inbox-ish icon
      return (
        <svg
          className="w-7 h-7 text-[color:var(--aw-text-faint)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      );
    }
    if (typeof icon === 'string') {
      return <span className="text-2xl leading-none" aria-hidden>{icon}</span>;
    }
    return icon;
  };

  const card = withCard
    ? 'bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] border border-[color:var(--aw-border)] shadow-[var(--aw-shadow-sm)]'
    : '';

  return (
    <div className={`flex flex-col items-center justify-center py-14 px-6 text-center ${card}`}>
      <div className="w-14 h-14 rounded-full bg-[color:var(--aw-surface-muted)] flex items-center justify-center mb-4">
        {renderIcon()}
      </div>
      <h3
        className="text-base font-semibold text-[color:var(--aw-text-strong)] mb-1.5"
        style={{ fontFamily: 'var(--font-heading), serif' }}
      >
        {title}
      </h3>
      {supportingText && (
        <p className="text-sm text-[color:var(--aw-text-muted)] max-w-sm">{supportingText}</p>
      )}
      {action ? (
        <div className="mt-5">{action}</div>
      ) : actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="aw-focus mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[color:var(--aw-navy)] rounded-[var(--aw-radius-md)] hover:bg-[color:var(--aw-navy-dark)] transition-colors shadow-[var(--aw-shadow-sm)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
