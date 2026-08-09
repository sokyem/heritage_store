'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminErrorBanner } from '@/components/admin/AdminErrorBanner';
import { PaginationFooter } from '@/components/admin';

interface FabricItem {
  id: string;
  fabricType: string;
  color: string | null;
  quantity: number | null;
  unit: string | null;
  supplier: string | null;
  cost: number | null;
  usedForOrder: string | null;
}

const FABRIC_TYPES = [
  'Ankara', 'Kente', 'Aso-Oke', 'Adire', 'Mud Cloth / Bogolan',
  'Kitenge / Chitenge', 'George Fabric', 'Lace', 'Brocade', 'Damask',
  'Swiss Voile', 'Organza', 'Silk', 'Cotton', 'Chiffon', 'Satin',
  'Velvet', 'Denim', 'Leather', 'Raffia', 'Other',
];

const EMPTY: Partial<FabricItem> = { fabricType: '', color: '', quantity: 0, unit: 'yards', supplier: '', cost: 0, usedForOrder: '' };

export default function InventoryPage() {
  type InventorySortColumn = 'fabricType' | 'color' | 'quantity' | 'cost' | 'supplier';

  const [items, setItems] = useState<FabricItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<FabricItem> | null>(null);
  const [saving, setSaving] = useState(false);

  // Search + pagination + sort
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<InventorySortColumn>('fabricType');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [aggStats, setAggStats] = useState<{ total: number; lowStock: number; totalValue: number } | null>(null);

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
      if (search.trim()) params.set('search', search.trim());
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/admin/inventory?${params.toString()}`),
        fetch('/api/admin/inventory/stats').catch(() => null),
      ]);
      if (!listRes.ok) {
        const err = await listRes.json().catch(() => null);
        throw new Error(err?.error || `Inventory failed (${listRes.status})`);
      }
      const data = await listRes.json();
      if (Array.isArray(data)) {
        setItems(data);
        setTotalCount(data.length);
        setTotalPages(1);
      } else {
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotalCount(typeof data.total === 'number' ? data.total : 0);
        setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1);
      }
      if (statsRes?.ok) {
        const s = await statsRes.json().catch(() => null);
        if (s) setAggStats(s);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortDir, search]);

  useEffect(() => { setPage(1); }, [search]);

  function toggleSort(col: InventorySortColumn) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'quantity' || col === 'cost' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!editing || !editing.fabricType) return;
    setSaving(true);
    const isNew = !editing.id;
    const url = isNew ? '/api/admin/inventory' : `/api/admin/inventory/${editing.id}`;
    const method = isNew ? 'POST' : 'PUT';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    setSaving(false);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this fabric item?')) return;
    await fetch(`/api/admin/inventory/${id}`, { method: 'DELETE' });
    load();
  }

  // Stats come from /stats endpoint (global) — `items.reduce` here would only
  // see the current page after pagination, so fall back to it only if the
  // stats endpoint isn't responding yet.
  const totalValue = aggStats?.totalValue ?? items.reduce((s, i) => s + (i.cost || 0) * (i.quantity || 0), 0);
  const totalItems = aggStats?.total ?? totalCount;

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1">Fabrics &amp; Materials</h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">African textiles &amp; materials · {totalItems} items · Est. value: <span className="text-[color:var(--aw-text-strong)] font-semibold">${totalValue.toLocaleString()}</span></p>
        </div>
        <button className="btn-primary text-base px-6 py-2.5" onClick={() => setEditing({ ...EMPTY })}>+ Add Fabric</button>
      </div>

      <AdminErrorBanner message={loadError} onRetry={load} />

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by fabric, color, supplier…"
        className="input-field text-sm py-2.5 mb-5 max-w-md"
      />

      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-[color:var(--aw-border)] overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-[#E8E3DB] bg-[color:var(--aw-surface-muted)]">
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">
                  <button type="button" onClick={() => toggleSort('fabricType')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Fabric
                    {sortBy === 'fabricType' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">
                  <button type="button" onClick={() => toggleSort('color')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Color
                    {sortBy === 'color' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">
                  <button type="button" onClick={() => toggleSort('quantity')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Qty
                    {sortBy === 'quantity' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">Unit</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">
                  <button type="button" onClick={() => toggleSort('supplier')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Supplier
                    {sortBy === 'supplier' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">
                  <button type="button" onClick={() => toggleSort('cost')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Cost/Unit
                    {sortBy === 'cost' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">Used For</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-right px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-bg)] transition-colors">
                  <td className="px-5 py-4 text-[15px] font-semibold text-[color:var(--aw-text-strong)]">{i.fabricType}</td>
                  <td className="px-5 py-4 text-[15px]">{i.color || '—'}</td>
                  <td className="px-5 py-4 text-[15px] font-medium">{i.quantity ?? 0}</td>
                  <td className="px-5 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{i.unit || 'yards'}</td>
                  <td className="px-5 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{i.supplier || '—'}</td>
                  <td className="px-5 py-4 text-[15px] font-medium">{i.cost != null ? `$${i.cost}` : '—'}</td>
                  <td className="px-5 py-4 text-sm text-[color:var(--aw-text-muted)]">{i.usedForOrder || '—'}</td>
                  <td className="px-5 py-4 text-right space-x-3">
                    <button className="text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors" onClick={() => setEditing(i)}>Edit</button>
                    <button className="text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger)]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors" onClick={() => remove(i.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-base text-[color:var(--aw-text-muted)]">No fabric in inventory</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <PaginationFooter
        page={page}
        totalPages={totalPages}
        total={totalCount}
        label="item"
        onPageChange={setPage}
        loading={loading}
      />

      {/* Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl p-7 w-full max-w-lg mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-5">{editing.id ? 'Edit Fabric' : 'Add Fabric'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Fabric Type</label>
                <select className="input-field text-base py-2.5" value={editing.fabricType || ''} onChange={(e) => setEditing({ ...editing, fabricType: e.target.value })}>
                  <option value="">Select fabric type...</option>
                  {FABRIC_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Color</label>
                  <input className="input-field text-base py-2.5" value={editing.color || ''} onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Supplier</label>
                  <input className="input-field text-base py-2.5" value={editing.supplier || ''} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Quantity</label>
                  <input className="input-field text-base py-2.5" type="number" value={editing.quantity ?? ''} onChange={(e) => setEditing({ ...editing, quantity: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Unit</label>
                  <select className="input-field text-base py-2.5" value={editing.unit || 'yards'} onChange={(e) => setEditing({ ...editing, unit: e.target.value })}>
                    <option>yards</option>
                    <option>meters</option>
                    <option>rolls</option>
                    <option>pieces</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Cost/Unit ($)</label>
                  <input className="input-field text-base py-2.5" type="number" value={editing.cost ?? ''} onChange={(e) => setEditing({ ...editing, cost: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Used For Order</label>
                <input className="input-field text-base py-2.5" value={editing.usedForOrder || ''} onChange={(e) => setEditing({ ...editing, usedForOrder: e.target.value })} placeholder="e.g. AWK-001" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-outline text-base px-5 py-2.5" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary text-base px-5 py-2.5" onClick={save} disabled={saving || !editing.fabricType}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
