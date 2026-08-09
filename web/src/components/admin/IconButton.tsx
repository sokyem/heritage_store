'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Compact icon-only button (with text label fallback for accessibility).
// Used in table row actions, toolbars, modal headers — anywhere the design
// calls for a small action affordance.
//
// `label` is mandatory for screen readers even when no visible text is
// shown; it becomes the aria-label.

type Variant = 'ghost' | 'primary' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

const VARIANT_CLASS: Record<Variant, string> = {
  ghost:
    'text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-surface-muted)]',
  primary:
    'bg-[color:var(--aw-navy)] text-white hover:bg-[color:var(--aw-navy-dark)]',
  danger:
    'text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger-soft)]',
  subtle:
    'text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)] hover:text-[color:var(--aw-text-strong)]',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'h-7 min-w-7 text-xs px-2',
  md: 'h-9 min-w-9 text-sm px-3',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required for screen readers (becomes aria-label when no children). */
  label: string;
  icon?: ReactNode;
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

export default function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  children,
  className = '',
  ...rest
}: IconButtonProps) {
  const showText = children !== undefined && children !== null && children !== false;
  return (
    <button
      type={rest.type ?? 'button'}
      aria-label={showText ? undefined : label}
      title={label}
      className={`aw-focus inline-flex items-center justify-center gap-1.5 rounded-[var(--aw-radius-md)] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    >
      {icon}
      {showText && <span>{children}</span>}
    </button>
  );
}
