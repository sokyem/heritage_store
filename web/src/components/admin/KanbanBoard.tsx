'use client';

import React from 'react';

interface KanbanColumn {
  key: string;
  label: string;
  color: string;
}

interface KanbanBoardProps<T extends { status: string }> {
  columns: KanbanColumn[];
  items: T[];
  renderCard: (item: T, index: number) => React.ReactNode;
  onStatusChange?: (item: T, newStatus: string) => void;
}

export default function KanbanBoard<T extends { status: string }>({
  columns,
  items,
  renderCard,
}: KanbanBoardProps<T>) {
  const grouped = columns.map((col) => ({
    ...col,
    items: items.filter(
      (item) => item.status.toLowerCase().replace(/[\s-]+/g, '_') === col.key.toLowerCase().replace(/[\s-]+/g, '_')
    ),
  }));

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
      {grouped.map((col) => (
        <div
          key={col.key}
          className="flex-shrink-0 w-72 flex flex-col bg-gray-50/80 rounded-lg border border-gray-200/40"
        >
          {/* Column header */}
          <div className="px-4 py-3 border-b border-gray-200/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              <h4 className="text-sm font-semibold text-gray-700">{col.label}</h4>
            </div>
            <span className="text-xs font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-100">
              {col.items.length}
            </span>
          </div>

          {/* Column body */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {col.items.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-xs text-gray-300">
                No items
              </div>
            ) : (
              col.items.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-lg border border-gray-200/60 shadow-sm hover:shadow transition-shadow"
                >
                  {renderCard(item, idx)}
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
