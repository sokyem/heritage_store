'use client';

// Standard error banner for admin pages. Always renders a real message,
// never swallows the failure. Pair with useAdminFetch.
//
// AdminEmptyState is re-exported from here for back-compat — there used
// to be two divergent implementations; the canonical one now lives in
// AdminEmptyState.tsx. Importers from either path continue to work.

import Icon from './Icon';

export function AdminErrorBanner({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry?: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="bg-[color:var(--aw-danger-soft)] border border-[color:var(--aw-danger)]/30 rounded-[var(--aw-radius-lg)] px-4 py-3 mb-5 flex items-start gap-3"
    >
      <span className="text-[color:var(--aw-danger)] shrink-0 mt-0.5">
        <Icon name="alert" className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[color:var(--aw-danger)]">
          Couldn&apos;t load this data
        </p>
        <p className="text-sm text-[color:var(--aw-danger)]/90 break-words">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="aw-focus text-sm font-semibold text-[color:var(--aw-danger)] underline hover:no-underline shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export { default as AdminEmptyState } from './AdminEmptyState';
