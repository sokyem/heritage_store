'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AdminPageHeader,
  AdminModal,
  StatCard,
  AdminEmptyState,
} from '@/components/admin';

/* ══════════════════════════════════════════════════════════
   Types — mirror Prisma RentalItem model
   ══════════════════════════════════════════════════════════ */

interface RentalItem {
  id: string;
  itemId: string;
  name: string;
  description: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  images: string | null;
  rentalPrice: number;
  replacementCost: number | null;
  condition: string;
  maintenanceStatus: string;
  isAvailable: boolean;
  timesRented: number;
  lastCleaned: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { rentalOrders: number };
}

interface ItemForm {
  id?: string;
  name: string;
  description: string;
  category: string;
  size: string;
  color: string;
  rentalPrice: string;
  replacementCost: string;
  condition: string;
  maintenanceStatus: string;
  isAvailable: boolean;
  notes: string;
}

/* ══════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════ */

const CATEGORIES = ['gown', 'suit', 'dress', 'accessories'] as const;
const CONDITIONS = ['excellent', 'good', 'fair', 'needs_repair', 'retired'] as const;
const MAINTENANCE = ['clean', 'needs_cleaning', 'in_cleaning', 'needs_repair', 'in_repair'] as const;

const CONDITION_COLORS: Record<string, { bg: string; text: string }> = {
  excellent:    { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  good:         { bg: 'bg-blue-50',    text: 'text-blue-700' },
  fair:         { bg: 'bg-amber-50',   text: 'text-amber-700' },
  needs_repair: { bg: 'bg-red-50',     text: 'text-red-700' },
  retired:      { bg: 'bg-gray-100',   text: 'text-gray-600' },
};

const MAINT_COLORS: Record<string, { bg: string; text: string }> = {
  clean:          { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  needs_cleaning: { bg: 'bg-amber-50',   text: 'text-amber-700' },
  in_cleaning:    { bg: 'bg-blue-50',    text: 'text-blue-700' },
  needs_repair:   { bg: 'bg-red-50',     text: 'text-red-700' },
  in_repair:      { bg: 'bg-violet-50',  text: 'text-violet-700' },
};

const CATEGORY_TINTS: Record<string, string> = {
  gown:        '#D4A574',
  suit:        '#1B2A5B',
  dress:       '#C41E3A',
  accessories: '#6B8E7B',
};

const EMPTY_FORM: ItemForm = {
  name: '',
  description: '',
  category: 'gown',
  size: '',
  color: '',
  rentalPrice: '',
  replacementCost: '',
  condition: 'excellent',
  maintenanceStatus: 'clean',
  isAvailable: true,
  notes: '',
};

/* ══════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════ */

function fmtCurrency(n: number | null | undefined): string {
  return `$${(n || 0).toFixed(2)}`;
}

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseImages(images: string | null): string[] {
  if (!images) return [];
  try {
    const v = JSON.parse(images);
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/* ══════════════════════════════════════════════════════════
   Item Card
   ══════════════════════════════════════════════════════════ */

function ItemCard({
  item,
  onEdit,
  onDelete,
  onToggleAvailable,
}: {
  item: RentalItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAvailable: () => void;
}) {
  const images = parseImages(item.images);
  const firstImage = images[0];
  const initial = item.name.charAt(0).toUpperCase();
  const tint = CATEGORY_TINTS[item.category || ''] || '#8B7569';
  const condColors = CONDITION_COLORS[item.condition] || CONDITION_COLORS.good;
  const maintColors = MAINT_COLORS[item.maintenanceStatus] || MAINT_COLORS.clean;

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden hover:shadow-md hover:border-gray-300 transition-all flex flex-col">
      {/* Image / Placeholder */}
      <div className="aspect-[4/3] bg-[color:var(--aw-bg)] relative overflow-hidden">
        {firstImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={firstImage} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-6xl font-bold opacity-30"
              style={{ color: tint, fontFamily: 'var(--font-heading)' }}
            >
              {initial}
            </span>
          </div>
        )}
        {!item.isAvailable && (
          <div className="absolute top-3 left-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-red-50 text-red-700">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Unavailable
            </span>
          </div>
        )}
        {item._count?.rentalOrders != null && item._count.rentalOrders > 0 && (
          <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm">
            <span className="text-[11px] font-semibold text-[color:var(--aw-text-strong)]">
              {item.timesRented}× rented
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3
            className="text-base font-semibold text-[color:var(--aw-text-strong)] truncate"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {item.name}
          </h3>
          <span className="text-xs text-gray-400 font-mono shrink-0">{item.itemId}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs text-gray-500">
          {item.category && (
            <span className="inline-block bg-[color:var(--aw-bg)] text-[color:var(--aw-text-strong)] px-2 py-0.5 rounded font-medium capitalize">
              {item.category}
            </span>
          )}
          {item.size && <span>· {item.size}</span>}
          {item.color && <span>· {item.color}</span>}
        </div>

        {/* Pricing */}
        <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400">Rental</p>
            <p className="text-lg font-semibold text-[color:var(--aw-text-strong)]">
              {fmtCurrency(item.rentalPrice)}
            </p>
          </div>
          {item.replacementCost != null && (
            <div className="text-right">
              <p className="text-xs text-gray-400">Replacement</p>
              <p className="text-sm font-medium text-gray-600">
                {fmtCurrency(item.replacementCost)}
              </p>
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${condColors.bg} ${condColors.text}`}
          >
            {formatLabel(item.condition)}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${maintColors.bg} ${maintColors.text}`}
          >
            {formatLabel(item.maintenanceStatus)}
          </span>
        </div>

        {/* Toggle + Actions */}
        <div className="mt-auto pt-3 border-t border-gray-100 space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs font-medium text-gray-600">Available for rental</span>
            <button
              type="button"
              role="switch"
              aria-checked={item.isAvailable}
              onClick={onToggleAvailable}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                item.isAvailable ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  item.isAvailable ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="flex-1 text-xs font-semibold text-[color:var(--aw-text-strong)] border border-gray-200 hover:bg-[color:var(--aw-surface-muted)] py-2 rounded-lg transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-xs font-semibold text-red-600 border border-gray-200 hover:bg-red-50 hover:border-red-200 py-2 px-3 rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Add/Edit Item Modal
   ══════════════════════════════════════════════════════════ */

function ItemModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: ItemForm;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ItemForm>({ ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update<K extends keyof ItemForm>(field: K, value: ItemForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.rentalPrice) { setError('Rental price is required'); return; }
    setError('');
    setSaving(true);
    const isNew = !form.id;
    const url = isNew ? '/api/admin/rental-items' : `/api/admin/rental-items/${form.id}`;
    try {
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description || null,
          category: form.category || null,
          size: form.size || null,
          color: form.color || null,
          rentalPrice: parseFloat(form.rentalPrice) || 0,
          replacementCost: form.replacementCost ? parseFloat(form.replacementCost) : null,
          condition: form.condition,
          maintenanceStatus: form.maintenanceStatus,
          isAvailable: form.isAvailable,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      onSaved();
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';
  const inputCls = 'input-field text-sm py-2.5';

  const footer = (
    <>
      <button className="btn-outline text-sm px-5 py-2.5" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button
        className="btn-primary text-sm px-5 py-2.5"
        onClick={save}
        disabled={saving || !form.name.trim() || !form.rentalPrice}
      >
        {saving ? 'Saving...' : form.id ? 'Update Item' : 'Create Item'}
      </button>
    </>
  );

  return (
    <AdminModal
      isOpen
      onClose={onClose}
      title={form.id ? 'Edit Rental Item' : 'Add Rental Item'}
      size="lg"
      footer={footer}
    >
      <div className="space-y-6">
        {error && (
          <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] text-sm font-medium px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Section 1: Basic */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Basic</h3>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Name *</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="e.g. Ivory Lace Bridal Gown"
              />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                className={inputCls}
                rows={3}
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="Hand-beaded bodice with full lace train..."
              />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select
                className={inputCls}
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{formatLabel(c)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Variants */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Variants</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Size</label>
              <input
                className={inputCls}
                value={form.size}
                onChange={(e) => update('size', e.target.value)}
                placeholder="e.g. S, M, L, 8, 10, 12"
              />
            </div>
            <div>
              <label className={labelCls}>Color</label>
              <input
                className={inputCls}
                value={form.color}
                onChange={(e) => update('color', e.target.value)}
                placeholder="e.g. Ivory, Black, Burgundy"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Pricing */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Pricing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Rental Price ($) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={form.rentalPrice}
                onChange={(e) => update('rentalPrice', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={labelCls}>Replacement Cost ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={form.replacementCost}
                onChange={(e) => update('replacementCost', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Condition + Maintenance + Availability */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Condition & Maintenance</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Condition</label>
              <select
                className={inputCls}
                value={form.condition}
                onChange={(e) => update('condition', e.target.value)}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{formatLabel(c)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Maintenance Status</label>
              <select
                className={inputCls}
                value={form.maintenanceStatus}
                onChange={(e) => update('maintenanceStatus', e.target.value)}
              >
                {MAINTENANCE.map((m) => (
                  <option key={m} value={m}>{formatLabel(m)}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 mt-4 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(e) => update('isAvailable', e.target.checked)}
              className="rounded border-gray-300 text-[color:var(--aw-text-strong)] focus:ring-[#1B2A5B]/30"
            />
            Available for new rentals
          </label>
        </div>

        {/* Section 5: Notes */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-3">Notes</h3>
          <textarea
            className={inputCls}
            rows={3}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Internal notes about this item..."
          />
        </div>
      </div>
    </AdminModal>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════════ */

export default function RentalInventoryPage() {
  const [items, setItems] = useState<RentalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ItemForm | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetch('/api/admin/rental-items')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load rental items');
        return r.json();
      })
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message || 'Failed to load rental items.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const total = items.length;
    const available = items.filter((i) => i.isAvailable).length;
    const needsCleaning = items.filter((i) =>
      i.maintenanceStatus === 'needs_cleaning' || i.maintenanceStatus === 'in_cleaning'
    ).length;
    // "In use" is approximated by unavailable items (the source of truth for
    // active rentals lives in RentalOrder, but unavailable is the simplest
    // signal we have without a join here).
    const inUse = items.filter((i) => !i.isAvailable).length;
    return { total, available, inUse, needsCleaning };
  }, [items]);

  /* ── Filter ── */
  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          i.name.toLowerCase().includes(q) ||
          i.itemId.toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q) ||
          (i.color || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (categoryFilter && i.category !== categoryFilter) return false;
      if (conditionFilter && i.condition !== conditionFilter) return false;
      return true;
    });
  }, [items, search, categoryFilter, conditionFilter]);

  function editItem(item: RentalItem) {
    setEditing({
      id: item.id,
      name: item.name,
      description: item.description || '',
      category: item.category || 'gown',
      size: item.size || '',
      color: item.color || '',
      rentalPrice: String(item.rentalPrice),
      replacementCost: item.replacementCost != null ? String(item.replacementCost) : '',
      condition: item.condition,
      maintenanceStatus: item.maintenanceStatus,
      isAvailable: item.isAvailable,
      notes: item.notes || '',
    });
  }

  async function remove(item: RentalItem) {
    if (!confirm(`Delete ${item.name} (${item.itemId})? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/rental-items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      load();
    } catch {
      alert('Failed to delete item.');
    }
  }

  async function toggleAvailable(item: RentalItem) {
    try {
      const res = await fetch(`/api/admin/rental-items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !item.isAvailable }),
      });
      if (!res.ok) throw new Error('Toggle failed');
      load();
    } catch {
      alert('Failed to update availability.');
    }
  }

  return (
    <div className="min-h-screen bg-[color:var(--aw-bg)]">
      <AdminPageHeader
        title="Rental Inventory"
        subtitle="Manage items available for rental"
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Inventory', href: '/admin/inventory' },
          { label: 'Rentals' },
        ]}
      >
        <button className="btn-primary text-sm px-5 py-2.5" onClick={() => setEditing({ ...EMPTY_FORM })}>
          + Add Item
        </button>
      </AdminPageHeader>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Items"
            value={stats.total}
            color="#1B2A5B"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            }
          />
          <StatCard
            label="Available"
            value={stats.available}
            color="#2D8E5A"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="In Use"
            value={stats.inUse}
            color="#6366F1"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          <StatCard
            label="Needs Cleaning"
            value={stats.needsCleaning}
            color={stats.needsCleaning > 0 ? '#D97706' : '#2D8E5A'}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 9h-6L8 4z" />
              </svg>
            }
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-3 mb-6">
          <input
            className="input-field text-sm py-2 flex-1 max-w-md"
            placeholder="Search by name, ID, category, or color..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input-field text-sm py-2 max-w-[180px]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{formatLabel(c)}</option>
            ))}
          </select>
          <select
            className="input-field text-sm py-2 max-w-[180px]"
            value={conditionFilter}
            onChange={(e) => setConditionFilter(e.target.value)}
          >
            <option value="">All Conditions</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{formatLabel(c)}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] text-sm font-medium px-5 py-4 rounded-lg mb-5 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={load} className="text-[color:var(--aw-danger)] underline text-sm font-semibold">
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="loading-spinner mx-auto" />
          </div>
        )}

        {/* Grid / Empty */}
        {!loading && !error && (
          <>
            {items.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200/60 shadow-sm">
                <AdminEmptyState
                  title="No rental items yet"
                  description="Add your first item to build out your rental inventory."
                  actionLabel="+ Add Item"
                  onAction={() => setEditing({ ...EMPTY_FORM })}
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200/60 shadow-sm">
                <AdminEmptyState
                  title="No matching items"
                  description="Try adjusting your search or filters."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filtered.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onEdit={() => editItem(item)}
                    onDelete={() => remove(item)}
                    onToggleAvailable={() => toggleAvailable(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit/Add Modal */}
      {editing && (
        <ItemModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
