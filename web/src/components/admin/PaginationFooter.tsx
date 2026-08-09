'use client';

import Icon from './Icon';

// Canonical "Page X of Y · N items · Prev / Next" footer.
//
// Replaces 12+ hand-rolled copies across the admin list pages. Renders
// nothing when totalPages <= 1 so callers don't need to gate it.
//
// Tokens: text colors and border come from --aw-* in admin.css.

export interface PaginationFooterProps {
  page: number;
  totalPages: number;
  total: number;
  /** Singular noun shown in "X items" / "1 item". Default: "item". */
  label?: string;
  onPageChange: (next: number) => void;
  /** Disables both buttons during in-flight fetches. */
  loading?: boolean;
}

export default function PaginationFooter({
  page,
  totalPages,
  total,
  label = 'item',
  onPageChange,
  loading = false,
}: PaginationFooterProps) {
  if (totalPages <= 1) return null;

  const noun = total === 1 ? label : `${label}s`;
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 mt-3 text-sm">
      <p className="text-[color:var(--aw-text-muted)]" aria-live="polite">
        Page{' '}
        <span className="font-semibold text-[color:var(--aw-text-strong)]">{page}</span>{' '}
        of {totalPages}
        <span className="mx-2 text-[color:var(--aw-text-faint)]">·</span>
        {total} {noun}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={!canPrev}
          className="aw-focus inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--aw-radius-md)] border border-[color:var(--aw-border-strong)] text-sm font-medium text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Icon name="chevronLeft" className="w-3.5 h-3.5" />
          Prev
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={!canNext}
          className="aw-focus inline-flex items-center gap-1 px-3 py-1.5 rounded-[var(--aw-radius-md)] border border-[color:var(--aw-border-strong)] text-sm font-medium text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
          <Icon name="chevronRight" className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
