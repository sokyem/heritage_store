'use client';

import React, { useState, useMemo } from 'react';

interface Column<T> {
  key: string;
  label: string;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface AdminTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T, index: number) => void;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  searchKeys?: string[];
  searchPlaceholder?: string;
  stickyHeader?: boolean;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

export default function AdminTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  loading = false,
  emptyMessage = 'No data found',
  emptyIcon,
  searchKeys,
  searchPlaceholder = 'Search...',
  stickyHeader = false,
}: AdminTableProps<T>) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim() || !searchKeys || searchKeys.length === 0) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      searchKeys.some((key) => {
        const val = getNestedValue(row, key);
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, searchKeys]);

  const alignClass = (align?: string) => {
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
  };

  return (
    <div>
      {searchKeys && searchKeys.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative max-w-xs">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/20 focus:border-[#1B2A5B]/40 bg-gray-50/50"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={`border-b border-gray-100 ${stickyHeader ? 'sticky top-0 z-10 bg-white' : ''}`}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 bg-[#F8F5F0] ${alignClass(col.align)}`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-2.5">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        {emptyIcon || (
                          <svg
                            className="w-10 h-10 text-gray-200"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                            />
                          </svg>
                        )}
                        <p className="text-sm text-gray-400">{emptyMessage}</p>
                      </div>
                    </td>
                  </tr>
                )
                : filtered.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={`border-b border-gray-50 transition-colors ${
                      onRowClick
                        ? 'cursor-pointer hover:bg-[#FAF7F2]/60'
                        : 'hover:bg-gray-50/50'
                    }`}
                    onClick={() => onRowClick?.(row, rowIdx)}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-2.5 text-sm text-gray-700 ${alignClass(col.align)}`}
                      >
                        {col.render
                          ? col.render(getNestedValue(row, col.key), row, rowIdx)
                          : (getNestedValue(row, col.key) as React.ReactNode) ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
