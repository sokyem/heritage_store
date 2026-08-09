'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import AIAssistPanel from '@/components/admin/AIAssistPanel';
import { showErrorToast, showSuccessToast } from '@/components/Toast';
import {
  AdminErrorBanner,
  AdminPageHeader,
  PaginationFooter,
  SearchToolbar,
  SortableHeader,
  SkeletonRow,
  buildCrumbs,
} from '@/components/admin';

const STATUSES = ['Inquiry', 'Awaiting Deposit', 'Fabric Sourced', 'Cutting', 'Sewing', 'Fitting', 'Finishing', 'Ready', 'Delivered'];
const STATUS_COLORS: Record<string, string> = {
  Inquiry: '#8B7569', 'Awaiting Deposit': '#D4A574', 'Fabric Sourced': '#6B8E7B',
  Cutting: '#1B2A5B', Sewing: '#1B2A5B', Fitting: '#7B6B8E',
  Finishing: '#4A7B8E', Ready: '#2D8E5A', Delivered: '#2D8E5A',
};

interface Order {
  id: string;
  orderId: string;
  clientId: string;
  client: { id: string; name: string; clientId: string } | null;
  item: string;
  fabric: string | null;
  totalPrice: number | null;
  deposit: number | null;
  totalPaid: number | null;
  balance: number | null;
  status: string;
  dueDate: string | null;
  notes: string | null;
  paymentStatus: string | null;
  productionAllowed: string | null;
}

interface Client {
  id: string;
  clientId: string;
  name: string;
}

const EMPTY_ORDER = {
  clientId: '',
  item: '',
  fabric: '',
  totalPrice: 0,
  deposit: 0,
  status: 'Inquiry',
  dueDate: '',
  notes: '',
  paymentStatus: '',
  productionAllowed: 'HOLD',
};

export default function OrdersPage() {
  type SortableColumn = 'orderId' | 'updatedAt' | 'totalPrice' | 'status' | 'dueDate';

  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  // Server-side pagination + sort
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<SortableColumn>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortDir,
      });
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const [oRes, cRes] = await Promise.all([
        fetch(`/api/admin/orders?${params.toString()}`),
        fetch('/api/admin/clients'),
      ]);
      if (!oRes.ok) {
        const err = await oRes.json().catch(() => null);
        throw new Error(err?.error || `Orders request failed (${oRes.status})`);
      }
      if (!cRes.ok) {
        const err = await cRes.json().catch(() => null);
        throw new Error(err?.error || `Clients request failed (${cRes.status})`);
      }
      const [oData, c] = await Promise.all([oRes.json(), cRes.json()]);
      if (Array.isArray(oData)) {
        setOrders(oData);
        setTotal(oData.length);
        setTotalPages(1);
      } else {
        setOrders(Array.isArray(oData.items) ? oData.items : []);
        setTotal(typeof oData.total === 'number' ? oData.total : 0);
        setTotalPages(typeof oData.totalPages === 'number' ? oData.totalPages : 1);
      }
      setClients(Array.isArray(c) ? c : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortDir, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 whenever the search/filter changes.
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  function toggleSort(col: SortableColumn) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'updatedAt' || col === 'totalPrice' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  // Server filters now; client-side filter is a no-op alias.
  const filtered = orders;

  async function save() {
    if (!editing) return;
    setSaving(true);
    const isNew = !editing.id;
    const url = isNew ? '/api/admin/orders' : `/api/admin/orders/${editing.id}`;
    const method = isNew ? 'POST' : 'PUT';
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save order');
      }

      showSuccessToast(isNew ? 'Order created' : 'Order updated', `${editing.item || 'Order'} has been saved.`);
      setEditing(null);
      load();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save order';
      showErrorToast('Save failed', message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this order?')) return;
    try {
      const response = await fetch(`/api/admin/orders/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete order');
      }

      showSuccessToast('Order deleted', 'The order has been removed.');
      load();
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : 'Failed to delete order';
      showErrorToast('Delete failed', message);
    }
  }

  function applyOrderDraft(draft: Record<string, unknown>) {
    setEditing((current) => {
      if (!current) return current;
      return {
        ...current,
        ...draft,
      };
    });
    showSuccessToast('Draft applied', 'Review the generated order details before saving.');
  }

  const pathname = usePathname();

  return (
    <div>
      <AdminPageHeader
        title="Studio Orders"
        subtitle={`${total || orders.length} total · in-studio AdminOrder records`}
        breadcrumbs={buildCrumbs(pathname || '/admin/orders')}
      >
        <button
          className="aw-focus inline-flex items-center gap-2 px-4 py-2 rounded-[var(--aw-radius-md)] bg-[color:var(--aw-navy)] text-white text-sm font-semibold hover:bg-[color:var(--aw-navy-dark)] transition-colors shadow-[var(--aw-shadow-sm)]"
          onClick={() => setEditing({ ...EMPTY_ORDER })}
        >
          + New Order
        </button>
      </AdminPageHeader>

      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
        <SearchToolbar
          value={search}
          onChange={setSearch}
          placeholder="Search by order ID, client name, or item…"
          rightSlot={
            <select
              className="aw-focus min-w-[180px] px-3 py-2 text-sm rounded-[var(--aw-radius-md)] border border-[color:var(--aw-border-strong)] bg-[color:var(--aw-surface)] text-[color:var(--aw-text-strong)] focus:outline-none focus:border-[color:var(--aw-navy)]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          }
        />

        <AdminErrorBanner message={loadError} onRetry={load} />

        <div className="bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] shadow-[var(--aw-shadow-sm)] border border-[color:var(--aw-border)] overflow-x-auto">
          <table className="w-full min-w-[1000px] aw-table-hover">
            <thead>
              <tr className="border-b border-[color:var(--aw-border)] bg-[color:var(--aw-surface-muted)]">
                <SortableHeader column="orderId" label="Order" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">Client</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">Item</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">Fabric</th>
                <SortableHeader column="totalPrice" label="Total" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">Paid</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">Balance</th>
                <SortableHeader column="status" label="Status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHeader column="dueDate" label="Due" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">Prod.</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRow cols={11} count={6} cellPadding="px-4 py-4" />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-5 py-12 text-center text-base text-[color:var(--aw-text-muted)]">
                    No orders found
                  </td>
                </tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id} className="border-b border-[color:var(--aw-border)] last:border-0">
                    <td className="px-4 py-4 text-[15px] font-semibold text-[color:var(--aw-text-strong)]">{o.orderId}</td>
                    <td className="px-4 py-4 text-[15px]">{o.client?.name || '—'}</td>
                    <td className="px-4 py-4 text-[15px]">{o.item}</td>
                    <td className="px-4 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{o.fabric || '—'}</td>
                    <td className="px-4 py-4 text-[15px] font-medium">{o.totalPrice != null ? `$${o.totalPrice}` : '—'}</td>
                    <td className="px-4 py-4 text-[15px]">{o.totalPaid != null ? `$${o.totalPaid}` : '$0'}</td>
                    <td className="px-4 py-4 text-[15px] font-semibold" style={{ color: (o.balance ?? 0) > 0 ? 'var(--aw-danger)' : 'var(--aw-success)' }}>
                      {o.balance != null ? `$${o.balance}` : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className="inline-block text-xs font-semibold uppercase tracking-wide text-white px-2.5 py-1 rounded-[var(--aw-radius-pill)]"
                        style={{ background: STATUS_COLORS[o.status] || 'var(--aw-text-muted)' }}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-[color:var(--aw-text-muted)]">{o.dueDate || '—'}</td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-bold uppercase tracking-wider ${o.productionAllowed === 'GO' ? 'text-[color:var(--aw-success)]' : 'text-[color:var(--aw-danger)]'}`}>
                        {o.productionAllowed || 'HOLD'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        className="aw-focus text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-surface-muted)] text-sm font-medium px-3 py-1.5 rounded-[var(--aw-radius-sm)] transition-colors"
                        onClick={() => setEditing({ ...o, clientId: o.client?.id || o.clientId })}
                      >
                        Edit
                      </button>
                      <button
                        className="aw-focus text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger-soft)] text-sm font-medium px-3 py-1.5 rounded-[var(--aw-radius-sm)] transition-colors"
                        onClick={() => remove(o.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          totalPages={totalPages}
          total={total}
          label="order"
          onPageChange={setPage}
          loading={loading}
        />

      {/* Order Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl p-7 w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-5">{editing.id ? 'Edit Order' : 'New Order'}</h2>
            <div className="space-y-4">
              <AIAssistPanel<Record<string, unknown>>
                title="Draft Order From Requirements"
                helperText="Describe the client request, pricing, deadline, and fabric needs in plain language. Add reference images or a voice note if that’s faster. AI will draft the order fields for review."
                endpoint="/api/admin/orders/ai-draft"
                promptPlaceholder="Example: Create a bridal order for Ama Boateng, ivory beaded mermaid gown with detachable train, total price 2500, 50% deposit, fitting in three weeks, final delivery by 2026-06-20..."
                extraPayload={{
                  clients: clients.map((client) => ({ id: client.id, clientId: client.clientId, name: client.name })),
                }}
                onApply={(draft) => applyOrderDraft(draft)}
              />

              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Client</label>
                <select
                  className="input-field text-base py-2.5"
                  value={(editing.clientId as string) || ''}
                  onChange={(e) => setEditing({ ...editing, clientId: e.target.value })}
                >
                  <option value="">Select client...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.clientId} — {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Item Description</label>
                <input className="input-field text-base py-2.5" value={(editing.item as string) || ''} onChange={(e) => setEditing({ ...editing, item: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Fabric</label>
                <input className="input-field text-base py-2.5" value={(editing.fabric as string) || ''} onChange={(e) => setEditing({ ...editing, fabric: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Total Price ($)</label>
                  <input className="input-field text-base py-2.5" type="number" value={(editing.totalPrice as number) || ''} onChange={(e) => setEditing({ ...editing, totalPrice: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Deposit ($)</label>
                  <input className="input-field text-base py-2.5" type="number" value={(editing.deposit as number) || ''} onChange={(e) => setEditing({ ...editing, deposit: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Status</label>
                  <select className="input-field text-base py-2.5" value={(editing.status as string) || 'Inquiry'} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Production</label>
                  <select className="input-field text-base py-2.5" value={(editing.productionAllowed as string) || 'HOLD'} onChange={(e) => setEditing({ ...editing, productionAllowed: e.target.value })}>
                    <option>HOLD</option>
                    <option>GO</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Due Date</label>
                <input className="input-field text-base py-2.5" value={(editing.dueDate as string) || ''} onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })} placeholder="e.g. 2025-06-15" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Notes</label>
                <textarea className="input-field text-base py-2.5" rows={2} value={(editing.notes as string) || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-outline text-base px-5 py-2.5" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary text-base px-5 py-2.5" onClick={save} disabled={saving || !(editing.clientId && editing.item)}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
