'use client';

// Clickable column header that shows the current sort direction and calls
// onSort(column) when clicked. Replaces the manual `<th><button> label
// {sortBy === col && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}` pattern
// repeated across 6+ list pages.
//
// The arrow uses the .aw-sort-arrow utility from admin.css to rotate
// instead of swap glyphs — keeps layout perfectly stable when toggling.

export interface SortableHeaderProps<C extends string = string> {
  column: C;
  label: string;
  sortBy: C;
  sortDir: 'asc' | 'desc';
  onSort: (column: C) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export default function SortableHeader<C extends string = string>({
  column,
  label,
  sortBy,
  sortDir,
  onSort,
  align = 'left',
  className = '',
}: SortableHeaderProps<C>) {
  const active = sortBy === column;
  const alignClass = align === 'right' ? 'text-right justify-end' : align === 'center' ? 'text-center justify-center' : 'text-left';

  return (
    <th className={`text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] px-4 py-3 ${alignClass} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`aw-focus inline-flex items-center gap-1.5 transition-colors ${
          active ? 'text-[color:var(--aw-text-strong)]' : 'hover:text-[color:var(--aw-text-strong)]'
        }`}
      >
        {label}
        <span
          className={`aw-sort-arrow text-[10px] leading-none ${active ? 'opacity-100' : 'opacity-30'}`}
          data-dir={active ? sortDir : 'asc'}
          aria-hidden
        >
          ▲
        </span>
      </button>
    </th>
  );
}
