'use client';

import type { ReactNode } from 'react';
import Icon from './Icon';

// Search input wrapped in a consistent card surface. The `rightSlot` is the
// generic escape hatch for status pills, filter selects, sort dropdowns,
// etc. — anything that should sit on the same line on desktop and wrap on
// mobile.

export interface SearchToolbarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rightSlot?: ReactNode;
  /** Optional autoFocus on initial mount. Defaults to false. */
  autoFocus?: boolean;
}

export default function SearchToolbar({
  value,
  onChange,
  placeholder = 'Search…',
  rightSlot,
  autoFocus = false,
}: SearchToolbarProps) {
  return (
    <div className="bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] border border-[color:var(--aw-border)] shadow-[var(--aw-shadow-sm)] p-3 mb-5 flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Icon
          name="search"
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--aw-text-faint)] pointer-events-none"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="aw-focus w-full pl-9 pr-3 py-2 text-sm rounded-[var(--aw-radius-md)] border border-[color:var(--aw-border-strong)] bg-[color:var(--aw-surface)] text-[color:var(--aw-text-strong)] placeholder:text-[color:var(--aw-text-faint)] focus:outline-none focus:border-[color:var(--aw-navy)]"
        />
      </div>
      {rightSlot}
    </div>
  );
}
