'use client';

import { useState, useEffect, useCallback } from 'react';
import { PaginationFooter } from '@/components/admin';

interface ReturnRequest {
  id: string;
  returnId: string;
  shipmentId: string | null;
  customerName: string;
  customerEmail: string | null;
  reason: string;
  description: string | null;
  status: string;
  resolution: string | null;
  returnTrackingNumber: string | null;
  returnCarrier: string | null;
  returnShippingCost: number | null;
  inspectionNotes: string | null;
  condition: string | null;
  refundAmount: number | null;
  refundedAt: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  shipment?: { shipmentId: string; trackingNumber: string; carrier: string };
}

interface Stats {
  total: number;
  requested: number;
  approved: number;
  received: number;
  completed: number;
}

const STATUS_BADGE: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  label_sent: 'bg-indigo-100 text-indigo-800',
  item_received: 'bg-purple-100 text-purple-800',
  inspecting: 'bg-cyan-100 text-cyan-800',
  refunded: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  completed: 'bg-emerald-100 text-emerald-800',
};

const REASON_LABELS: Record<string, string> = {
  damaged: 'Damaged',
  wrong_item: 'Wrong Item',
  sizing: 'Sizing Issue',
  changed_mind: 'Changed Mind',
  defective: 'Defective',
  other: 'Other',
};

type ReturnSortColumn = 'createdAt' | 'returnId' | 'status' | 'refundAmount';

export default function AdminReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, requested: 0, approved: 0, received: 0, completed: 0 });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReturnRequest | null>(null);
  const [loading, setLoading] = useState(true);

  // Pagination + sort
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pageTotal, setPageTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<ReturnSortColumn>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchReturns = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortDir,
    });
    if (filter !== 'all') params.set('status', filter);
    if (search) params.set('search', search);

    const res = await fetch(`/api/shipping/returns?${params}`);
    const data = await res.json();
    setReturns(data.returns || []);
    setStats(data.stats || { total: 0, requested: 0, approved: 0, received: 0, completed: 0 });
    setPageTotal(typeof data.pageTotal === 'number' ? data.pageTotal : (data.returns?.length || 0));
    setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1);
    setLoading(false);
  }, [filter, search, page, pageSize, sortBy, sortDir]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  useEffect(() => { setPage(1); }, [filter, search]);

  function toggleSort(col: ReturnSortColumn) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'createdAt' || col === 'refundAmount' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  async function handleStatusUpdate(id: string, status: string, extra?: Record<string, unknown>) {
    await fetch('/api/shipping/returns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, ...extra }),
    });
    fetchReturns();
    setSelected(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--aw-text-strong)]">Returns & RMA</h1>
          <p className="text-sm text-[color:var(--aw-text-muted)]">Manage return requests and refunds</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'bg-white' },
          { label: 'Requested', value: stats.requested, color: 'bg-amber-50' },
          { label: 'Approved', value: stats.approved, color: 'bg-blue-50' },
          { label: 'Received', value: stats.received, color: 'bg-purple-50' },
          { label: 'Completed', value: stats.completed, color: 'bg-green-50' },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-xl border border-[rgba(27,42,91,0.08)] p-4`}>
            <p className="text-xs text-[color:var(--aw-text-muted)] uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-bold text-[color:var(--aw-text-strong)] mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-white rounded-lg border border-[rgba(27,42,91,0.08)] p-1">
          {['all', 'requested', 'approved', 'item_received', 'inspecting', 'refunded', 'completed', 'denied'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                filter === s ? 'bg-[color:var(--aw-navy)] text-white' : 'text-[#5C3D2E] hover:bg-[color:var(--aw-cream)]'
              }`}
            >
              {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by RMA ID, name, email..."
          className="px-3 py-2 border border-[rgba(27,42,91,0.15)] rounded-md text-sm bg-white text-[color:var(--aw-text-strong)] placeholder:text-[color:var(--aw-text-muted)] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/20 w-64"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[rgba(27,42,91,0.08)] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[color:var(--aw-text-muted)]">Loading...</div>
        ) : returns.length === 0 ? (
          <div className="p-8 text-center text-[color:var(--aw-text-muted)]">No return requests found</div>
        ) : (
          <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(27,42,91,0.08)] bg-[color:var(--aw-bg)]">
                <th className="text-left px-4 py-3 font-medium text-[#5C3D2E]">
                  <button type="button" onClick={() => toggleSort('returnId')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    RMA ID
                    {sortBy === 'returnId' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-[#5C3D2E]">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-[#5C3D2E]">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-[#5C3D2E]">Shipment</th>
                <th className="text-left px-4 py-3 font-medium text-[#5C3D2E]">
                  <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Status
                    {sortBy === 'status' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-[#5C3D2E]">
                  <button type="button" onClick={() => toggleSort('createdAt')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Date
                    {sortBy === 'createdAt' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-[#5C3D2E]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {returns.map(r => (
                <tr key={r.id} className="border-b border-[rgba(27,42,91,0.04)] hover:bg-[color:var(--aw-bg)]/50">
                  <td className="px-4 py-3 font-mono text-xs text-[color:var(--aw-text-strong)] font-semibold">{r.returnId}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[color:var(--aw-text-strong)]">{r.customerName}</p>
                    {r.customerEmail && <p className="text-xs text-[color:var(--aw-text-muted)]">{r.customerEmail}</p>}
                  </td>
                  <td className="px-4 py-3 text-[#5C3D2E]">{REASON_LABELS[r.reason] || r.reason}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[color:var(--aw-text-muted)]">{r.shipment?.shipmentId || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-800'}`}>
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[color:var(--aw-text-muted)]">
                    {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(r)}
                      className="text-xs text-[color:var(--aw-text-strong)] hover:text-[color:var(--aw-danger)] font-medium"
                    >
                      Manage →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-4 border-t border-[color:var(--aw-border)]">
            <PaginationFooter
              page={page}
              totalPages={totalPages}
              total={pageTotal}
              label="return"
              onPageChange={setPage}
            />
          </div>
          </>
        )}
      </div>

      {/* Detail / Action Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[color:var(--aw-text-strong)]">{selected.returnId}</h2>
              <button onClick={() => setSelected(null)} className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]">✕</button>
            </div>

            <div className="space-y-3 text-sm mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[color:var(--aw-text-muted)]">Customer</span>
                  <p className="font-medium text-[color:var(--aw-text-strong)]">{selected.customerName}</p>
                </div>
                <div>
                  <span className="text-[color:var(--aw-text-muted)]">Email</span>
                  <p className="font-medium text-[color:var(--aw-text-strong)]">{selected.customerEmail || '—'}</p>
                </div>
                <div>
                  <span className="text-[color:var(--aw-text-muted)]">Reason</span>
                  <p className="font-medium text-[color:var(--aw-text-strong)]">{REASON_LABELS[selected.reason] || selected.reason}</p>
                </div>
                <div>
                  <span className="text-[color:var(--aw-text-muted)]">Status</span>
                  <p className="font-medium text-[color:var(--aw-text-strong)]">{selected.status.replace(/_/g, ' ')}</p>
                </div>
                {selected.description && (
                  <div className="col-span-2">
                    <span className="text-[color:var(--aw-text-muted)]">Description</span>
                    <p className="font-medium text-[color:var(--aw-text-strong)]">{selected.description}</p>
                  </div>
                )}
                {selected.returnTrackingNumber && (
                  <div>
                    <span className="text-[color:var(--aw-text-muted)]">Return Tracking</span>
                    <p className="font-mono text-xs text-[color:var(--aw-text-strong)]">{selected.returnTrackingNumber}</p>
                  </div>
                )}
                {selected.inspectionNotes && (
                  <div className="col-span-2">
                    <span className="text-[color:var(--aw-text-muted)]">Inspection Notes</span>
                    <p className="text-[color:var(--aw-text-strong)]">{selected.inspectionNotes}</p>
                  </div>
                )}
                {selected.refundAmount && (
                  <div>
                    <span className="text-[color:var(--aw-text-muted)]">Refund Amount</span>
                    <p className="font-bold text-green-700">${selected.refundAmount.toFixed(2)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons based on current status */}
            <div className="space-y-2">
              {selected.status === 'requested' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleStatusUpdate(selected.id, 'approved')}
                    className="flex-1 px-4 py-2 bg-[color:var(--aw-navy)] text-white rounded-md hover:bg-[#2C3E7A] transition text-sm font-medium"
                  >
                    Approve Return
                  </button>
                  <button
                    onClick={() => handleStatusUpdate(selected.id, 'denied')}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition text-sm font-medium"
                  >
                    Deny
                  </button>
                </div>
              )}
              {selected.status === 'approved' && (
                <button
                  onClick={() => handleStatusUpdate(selected.id, 'label_sent')}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition text-sm font-medium"
                >
                  Mark Label Sent
                </button>
              )}
              {(selected.status === 'label_sent' || selected.status === 'approved') && (
                <button
                  onClick={() => handleStatusUpdate(selected.id, 'item_received')}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition text-sm font-medium"
                >
                  Mark Item Received
                </button>
              )}
              {selected.status === 'item_received' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const amount = prompt('Enter refund amount:');
                      if (amount) handleStatusUpdate(selected.id, 'refunded', { refundAmount: parseFloat(amount), resolution: 'refund' });
                    }}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-sm font-medium"
                  >
                    Issue Refund
                  </button>
                  <button
                    onClick={() => handleStatusUpdate(selected.id, 'completed', { resolution: 'exchange' })}
                    className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition text-sm font-medium"
                  >
                    Exchange
                  </button>
                </div>
              )}
              {selected.status === 'refunded' && (
                <button
                  onClick={() => handleStatusUpdate(selected.id, 'completed')}
                  className="w-full px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition text-sm font-medium"
                >
                  Mark Completed
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
