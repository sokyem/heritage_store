'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AdminPageHeader,
  AdminTable,
  AdminModal,
  StatusBadge,
  StatCard,
  AdminEmptyState,
} from '@/components/admin';

/* ══════════════════════════════════════════════════════════
   Types — mirror Prisma RentalOrder / RentalItem / Client
   ══════════════════════════════════════════════════════════ */

interface Client {
  id: string;
  clientId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface RentalItem {
  id: string;
  itemId: string;
  name: string;
  category: string | null;
  size: string | null;
  color: string | null;
  rentalPrice: number;
  isAvailable: boolean;
}

interface RentalOrder {
  id: string;
  rentalId: string;
  clientId: string;
  rentalItemId: string;
  client: Client | null;
  rentalItem: RentalItem | null;
  startDate: string;
  endDate: string;
  returnDate: string | null;
  rentalPrice: number;
  deposit: number;
  totalPaid: number;
  lateFee: number;
  damageFee: number;
  status: string;
  conditionOut: string | null;
  conditionIn: string | null;
  cleaningNeeded: boolean;
  damageNotes: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ══════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════ */

const STATUS_OPTIONS = [
  'reserved',
  'confirmed',
  'picked_up',
  'in_use',
  'returned',
  'inspected',
  'closed',
  'overdue',
] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  reserved:  { bg: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-500' },
  confirmed: { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500' },
  picked_up: { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500' },
  in_use:    { bg: 'bg-indigo-50',   text: 'text-indigo-700',  dot: 'bg-indigo-500' },
  returned:  { bg: 'bg-teal-50',     text: 'text-teal-700',    dot: 'bg-teal-500' },
  inspected: { bg: 'bg-gray-100',    text: 'text-gray-700',    dot: 'bg-gray-500' },
  closed:    { bg: 'bg-zinc-100',    text: 'text-zinc-700',    dot: 'bg-zinc-500' },
  overdue:   { bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500' },
};

const ACTIVE_STATUSES = ['reserved', 'confirmed', 'picked_up', 'in_use'];
const PENDING_RETURN_STATUSES = ['picked_up', 'in_use'];

const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'active',   label: 'Active' },
  { key: 'overdue',  label: 'Overdue' },
  { key: 'returned', label: 'Returned' },
  { key: 'closed',   label: 'Closed' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const EMPTY_FORM = {
  clientId: '',
  rentalItemId: '',
  startDate: '',
  endDate: '',
  rentalPrice: '',
  deposit: '',
  notes: '',
};

/* ══════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════ */

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function formatPeriod(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function fmtCurrency(n: number): string {
  return `$${(n || 0).toFixed(2)}`;
}

function daysBetween(target: string | null | undefined): number | null {
  if (!target) return null;
  const t = new Date(target);
  const now = new Date();
  t.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.ceil((t.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function daysColor(days: number | null): string {
  if (days === null) return 'text-gray-400';
  if (days < 0) return 'text-red-600';
  if (days < 3) return 'text-amber-600';
  return 'text-emerald-600';
}

function daysLabel(days: number | null): string {
  if (days === null) return '—';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `${days}d left`;
}

function isOverdue(r: RentalOrder): boolean {
  if (r.status === 'overdue') return true;
  if (r.status === 'returned' || r.status === 'inspected' || r.status === 'closed') return false;
  const days = daysBetween(r.endDate);
  return days !== null && days < 0;
}

/* ══════════════════════════════════════════════════════════
   Status pill (custom palette per spec)
   ══════════════════════════════════════════════════════════ */

function StatusPill({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.reserved;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${colors.bg} ${colors.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════
   New Rental Modal
   ══════════════════════════════════════════════════════════ */

function NewRentalModal({
  clients,
  items,
  onClose,
  onSave,
}: {
  clients: Client[];
  items: RentalItem[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update<K extends keyof typeof form>(field: K, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Pre-fill rental price when item is selected
  useEffect(() => {
    if (!form.rentalItemId) return;
    const it = items.find((i) => i.id === form.rentalItemId);
    if (it && !form.rentalPrice) {
      setForm((prev) => ({ ...prev, rentalPrice: String(it.rentalPrice) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.rentalItemId]);

  async function handleSubmit() {
    if (!form.clientId) { setError('Please select a client'); return; }
    if (!form.rentalItemId) { setError('Please select a rental item'); return; }
    if (!form.startDate) { setError('Start date is required'); return; }
    if (!form.endDate) { setError('End date is required'); return; }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setError('End date must be after start date');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave({
        clientId: form.clientId,
        rentalItemId: form.rentalItemId,
        startDate: form.startDate,
        endDate: form.endDate,
        rentalPrice: form.rentalPrice ? parseFloat(form.rentalPrice) : 0,
        deposit: form.deposit ? parseFloat(form.deposit) : 0,
        notes: form.notes || null,
      });
    } catch {
      setError('Failed to create rental. Please try again.');
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
        onClick={handleSubmit}
        disabled={saving || !form.clientId || !form.rentalItemId || !form.startDate || !form.endDate}
      >
        {saving ? 'Creating...' : 'Create Rental'}
      </button>
    </>
  );

  return (
    <AdminModal isOpen onClose={onClose} title="New Rental Order" size="lg" footer={footer}>
      <div className="space-y-6">
        {error && (
          <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] text-sm font-medium px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Section 1: Client */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-2">Client</h3>
          <select className={inputCls} value={form.clientId} onChange={(e) => update('clientId', e.target.value)}>
            <option value="">Select client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.clientId})
              </option>
            ))}
          </select>
        </div>

        {/* Section 2: Rental Item */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-2">Rental Item</h3>
          <select className={inputCls} value={form.rentalItemId} onChange={(e) => update('rentalItemId', e.target.value)}>
            <option value="">Select available item...</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.itemId}){i.size ? ` — ${i.size}` : ''}{i.color ? ` / ${i.color}` : ''} — {fmtCurrency(i.rentalPrice)}
              </option>
            ))}
          </select>
          {items.length === 0 && (
            <p className="mt-2 text-xs text-amber-600">No items currently available for rental.</p>
          )}
        </div>

        {/* Section 3: Rental Period */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-2">Rental Period</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start Date</label>
              <input
                type="date"
                className={inputCls}
                value={form.startDate}
                onChange={(e) => update('startDate', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input
                type="date"
                className={inputCls}
                value={form.endDate}
                onChange={(e) => update('endDate', e.target.value)}
                min={form.startDate || undefined}
              />
            </div>
          </div>
        </div>

        {/* Section 4: Pricing */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-2">Pricing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Rental Price ($)</label>
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
              <label className={labelCls}>Deposit ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={form.deposit}
                onChange={(e) => update('deposit', e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Section 5: Notes */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-strong)] mb-2">Notes</h3>
          <textarea
            className={inputCls}
            rows={3}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Internal notes about this rental..."
          />
        </div>
      </div>
    </AdminModal>
  );
}

/* ══════════════════════════════════════════════════════════
   Detail Drawer (View / Edit / Mark Returned)
   ══════════════════════════════════════════════════════════ */

function RentalDetailDrawer({
  rental,
  onClose,
  onSaved,
}: {
  rental: RentalOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    status: rental.status,
    startDate: rental.startDate.slice(0, 10),
    endDate: rental.endDate.slice(0, 10),
    rentalPrice: String(rental.rentalPrice),
    deposit: String(rental.deposit),
    totalPaid: String(rental.totalPaid),
    lateFee: String(rental.lateFee),
    damageFee: String(rental.damageFee),
    conditionOut: rental.conditionOut || '',
    conditionIn: rental.conditionIn || '',
    cleaningNeeded: rental.cleaningNeeded,
    damageNotes: rental.damageNotes || '',
    notes: rental.notes || '',
  });

  const days = daysBetween(rental.endDate);

  async function save(patch?: Record<string, unknown>) {
    setSaving(true);
    setError('');
    try {
      const body = patch || {
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate,
        rentalPrice: parseFloat(form.rentalPrice) || 0,
        deposit: parseFloat(form.deposit) || 0,
        totalPaid: parseFloat(form.totalPaid) || 0,
        lateFee: parseFloat(form.lateFee) || 0,
        damageFee: parseFloat(form.damageFee) || 0,
        conditionOut: form.conditionOut || null,
        conditionIn: form.conditionIn || null,
        cleaningNeeded: form.cleaningNeeded,
        damageNotes: form.damageNotes || null,
        notes: form.notes || null,
      };
      const res = await fetch(`/api/admin/rentals/${rental.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      onSaved();
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  async function markReturned() {
    if (!confirm('Mark this rental as returned? Return date will be set to today.')) return;
    await save({ status: 'returned' });
  }

  async function remove() {
    if (!confirm(`Delete rental ${rental.rentalId}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/rentals/${rental.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      onSaved();
      onClose();
    } catch {
      setError('Failed to delete.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2
              className="text-lg font-semibold text-[color:var(--aw-text-strong)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {rental.rentalId}
            </h2>
            <p className="text-sm text-gray-500">{rental.client?.name || 'Unknown client'}</p>
          </div>
          <div className="flex items-center gap-2">
            {!editing && PENDING_RETURN_STATUSES.includes(rental.status) && (
              <button
                onClick={markReturned}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-emerald-700 border border-emerald-200 hover:bg-emerald-50 transition-colors disabled:opacity-50"
              >
                Mark Returned
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] text-sm font-medium px-4 py-3 rounded-lg">{error}</div>
          )}

          {/* Status */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Status</p>
            {editing ? (
              <select
                className="input-field text-sm py-2"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            ) : (
              <StatusPill status={rental.status} />
            )}
          </div>

          {/* Item */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Rental Item</p>
            <p className="text-sm text-[color:var(--aw-text-strong)] font-medium">
              {rental.rentalItem?.name || '—'}
              {rental.rentalItem?.itemId && (
                <span className="text-gray-400 ml-2 font-normal">({rental.rentalItem.itemId})</span>
              )}
            </p>
            {(rental.rentalItem?.size || rental.rentalItem?.color) && (
              <p className="text-xs text-gray-500 mt-0.5">
                {[rental.rentalItem?.size, rental.rentalItem?.color].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* Period */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Start Date</p>
              {editing ? (
                <input
                  type="date"
                  className="input-field text-sm py-2"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              ) : (
                <p className="text-sm text-gray-700">{formatDate(rental.startDate)}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">End Date</p>
              {editing ? (
                <input
                  type="date"
                  className="input-field text-sm py-2"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              ) : (
                <p className="text-sm text-gray-700">
                  {formatDate(rental.endDate)}
                  <span className={`ml-2 text-xs font-medium ${daysColor(days)}`}>({daysLabel(days)})</span>
                </p>
              )}
            </div>
          </div>

          {rental.returnDate && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Returned On</p>
              <p className="text-sm text-emerald-700 font-medium">{formatDate(rental.returnDate)}</p>
            </div>
          )}

          {/* Pricing */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Pricing</p>
            <div className="bg-[color:var(--aw-bg)] rounded-lg p-4 space-y-2">
              {(['rentalPrice', 'deposit', 'totalPaid', 'lateFee', 'damageFee'] as const).map((key) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                  {editing ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input-field text-sm py-1 max-w-[140px]"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  ) : (
                    <span className="font-semibold text-[color:var(--aw-text-strong)]">
                      {fmtCurrency(rental[key] as number)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Condition / Notes */}
          {(editing || rental.conditionOut || rental.conditionIn || rental.damageNotes) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Condition</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">Out</label>
                  {editing ? (
                    <input
                      className="input-field text-sm py-2 mt-1"
                      value={form.conditionOut}
                      onChange={(e) => setForm((f) => ({ ...f, conditionOut: e.target.value }))}
                      placeholder="e.g. excellent, minor wear..."
                    />
                  ) : (
                    <p className="text-sm text-gray-700">{rental.conditionOut || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500">In</label>
                  {editing ? (
                    <input
                      className="input-field text-sm py-2 mt-1"
                      value={form.conditionIn}
                      onChange={(e) => setForm((f) => ({ ...f, conditionIn: e.target.value }))}
                      placeholder="e.g. excellent, minor wear..."
                    />
                  ) : (
                    <p className="text-sm text-gray-700">{rental.conditionIn || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500">Damage Notes</label>
                  {editing ? (
                    <textarea
                      className="input-field text-sm py-2 mt-1"
                      rows={2}
                      value={form.damageNotes}
                      onChange={(e) => setForm((f) => ({ ...f, damageNotes: e.target.value }))}
                    />
                  ) : (
                    <p className="text-sm text-gray-700">{rental.damageNotes || '—'}</p>
                  )}
                </div>
                {editing && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.cleaningNeeded}
                      onChange={(e) => setForm((f) => ({ ...f, cleaningNeeded: e.target.checked }))}
                    />
                    Cleaning required
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Notes</p>
            {editing ? (
              <textarea
                className="input-field text-sm py-2"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-[color:var(--aw-bg)] rounded-lg p-3">
                {rental.notes || '—'}
              </p>
            )}
          </div>

          {/* Footer actions */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
            {editing ? (
              <>
                <button
                  className="btn-outline text-sm px-4 py-2"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary text-sm px-4 py-2"
                  onClick={() => save()}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button
                  className="text-sm font-medium text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                  onClick={remove}
                  disabled={saving}
                >
                  Delete Rental
                </button>
                <button className="btn-primary text-sm px-4 py-2" onClick={() => setEditing(true)}>
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════════ */

export default function RentalOrdersPage() {
  const [rentals, setRentals] = useState<RentalOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [items, setItems] = useState<RentalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selected, setSelected] = useState<RentalOrder | null>(null);
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      fetch('/api/admin/rentals').then((r) => {
        if (!r.ok) throw new Error('Failed to load rentals');
        return r.json();
      }),
      fetch('/api/admin/clients').then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/rental-items?available=true').then((r) => r.ok ? r.json() : []).catch(() => []),
    ])
      .then(([r, c, i]) => {
        setRentals(Array.isArray(r) ? r : []);
        setClients(Array.isArray(c) ? c : []);
        setItems(Array.isArray(i) ? i : []);
      })
      .catch((e) => setError(e.message || 'Failed to load rentals.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const active = rentals.filter((r) =>
      ['reserved', 'confirmed', 'picked_up', 'in_use'].includes(r.status)
    ).length;

    const overdue = rentals.filter(isOverdue).length;

    const pendingReturns = rentals.filter((r) =>
      PENDING_RETURN_STATUSES.includes(r.status)
    ).length;

    // Revenue this month — sum of totalPaid for rentals starting this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const revenue = rentals
      .filter((r) => new Date(r.startDate) >= monthStart)
      .reduce((sum, r) => sum + (r.totalPaid || 0), 0);

    return { active, overdue, pendingReturns, revenue };
  }, [rentals]);

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    let list = rentals;

    if (tab === 'active') {
      list = list.filter((r) => ACTIVE_STATUSES.includes(r.status) && !isOverdue(r));
    } else if (tab === 'overdue') {
      list = list.filter(isOverdue);
    } else if (tab === 'returned') {
      list = list.filter((r) => r.status === 'returned' || r.status === 'inspected');
    } else if (tab === 'closed') {
      list = list.filter((r) => r.status === 'closed');
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.rentalId.toLowerCase().includes(q) ||
        (r.client?.name || '').toLowerCase().includes(q) ||
        (r.rentalItem?.name || '').toLowerCase().includes(q) ||
        (r.rentalItem?.itemId || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [rentals, tab, search]);

  /* ── Quick "Mark Returned" action ── */
  async function quickMarkReturned(id: string, rentalId: string) {
    if (!confirm(`Mark ${rentalId} as returned?`)) return;
    try {
      const res = await fetch(`/api/admin/rentals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'returned' }),
      });
      if (!res.ok) throw new Error('Failed');
      load();
    } catch {
      alert('Failed to mark as returned.');
    }
  }

  async function createRental(data: Record<string, unknown>) {
    const res = await fetch('/api/admin/rentals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create rental');
    setShowNewModal(false);
    load();
  }

  /* ── Table columns ── */
  const columns = useMemo(
    () => [
      {
        key: 'rentalId',
        label: 'Rental ID',
        render: (_v: unknown, r: RentalOrder) => (
          <span className="font-semibold text-[color:var(--aw-text-strong)]">{r.rentalId}</span>
        ),
      },
      {
        key: 'client',
        label: 'Client',
        render: (_v: unknown, r: RentalOrder) => (
          <div>
            <p className="text-sm text-gray-900">{r.client?.name || '—'}</p>
            {r.client?.clientId && (
              <p className="text-xs text-gray-400">{r.client.clientId}</p>
            )}
          </div>
        ),
      },
      {
        key: 'rentalItem',
        label: 'Item',
        render: (_v: unknown, r: RentalOrder) => (
          <div>
            <p className="text-sm text-gray-900">{r.rentalItem?.name || '—'}</p>
            {r.rentalItem?.itemId && (
              <p className="text-xs text-gray-400">{r.rentalItem.itemId}</p>
            )}
          </div>
        ),
      },
      {
        key: 'period',
        label: 'Period',
        render: (_v: unknown, r: RentalOrder) => (
          <span className="text-sm text-gray-700">{formatPeriod(r.startDate, r.endDate)}</span>
        ),
      },
      {
        key: 'daysRemaining',
        label: 'Days Left',
        render: (_v: unknown, r: RentalOrder) => {
          // For returned/closed rentals, show "—"
          if (['returned', 'inspected', 'closed'].includes(r.status)) {
            return <span className="text-xs text-gray-400">—</span>;
          }
          const days = daysBetween(r.endDate);
          return (
            <span className={`text-sm font-medium ${daysColor(days)}`}>
              {daysLabel(days)}
            </span>
          );
        },
      },
      {
        key: 'status',
        label: 'Status',
        render: (_v: unknown, r: RentalOrder) => <StatusPill status={r.status} />,
      },
      {
        key: 'deposit',
        label: 'Deposit',
        align: 'right' as const,
        render: (_v: unknown, r: RentalOrder) => (
          <span className="text-sm font-medium text-gray-700">{fmtCurrency(r.deposit)}</span>
        ),
      },
      {
        key: 'totalPaid',
        label: 'Total Paid',
        align: 'right' as const,
        render: (_v: unknown, r: RentalOrder) => (
          <span className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{fmtCurrency(r.totalPaid)}</span>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        align: 'right' as const,
        render: (_v: unknown, r: RentalOrder) => (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setSelected(r); }}
              className="text-xs font-medium text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 px-2.5 py-1.5 rounded transition-colors"
            >
              View
            </button>
            {PENDING_RETURN_STATUSES.includes(r.status) && (
              <button
                onClick={(e) => { e.stopPropagation(); quickMarkReturned(r.id, r.rentalId); }}
                className="text-xs font-medium text-emerald-700 hover:bg-emerald-50 px-2.5 py-1.5 rounded transition-colors"
              >
                Return
              </button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="min-h-screen bg-[color:var(--aw-bg)]">
      <AdminPageHeader
        title="Rental Orders"
        subtitle="Active rentals, returns & deposits"
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Orders', href: '/admin/orders' },
          { label: 'Rentals' },
        ]}
      >
        <button className="btn-primary text-sm px-5 py-2.5" onClick={() => setShowNewModal(true)}>
          + New Rental
        </button>
      </AdminPageHeader>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Active Rentals"
            value={stats.active}
            color="#1B2A5B"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l-1 12H6L5 9z" />
              </svg>
            }
          />
          <StatCard
            label="Overdue"
            value={stats.overdue}
            color="#C41E3A"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Revenue (This Month)"
            value={fmtCurrency(stats.revenue)}
            color="#2D8E5A"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Pending Returns"
            value={stats.pendingReturns}
            color="#D97706"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          />
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col lg:flex-row gap-3 mb-5">
          <div className="flex items-center gap-1 bg-white border border-gray-200/60 rounded-lg p-1 shadow-sm">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  tab === t.key
                    ? 'bg-[color:var(--aw-navy)] text-white shadow-sm'
                    : 'text-gray-500 hover:text-[color:var(--aw-text-strong)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            className="input-field text-sm py-2 flex-1 max-w-md"
            placeholder="Search by rental ID, client, or item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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

        {/* Empty / Table */}
        {!loading && !error && (
          <div className="bg-white rounded-lg border border-gray-200/60 shadow-sm overflow-hidden">
            {rentals.length === 0 ? (
              <AdminEmptyState
                title="No rental orders yet"
                description="Create your first rental order to start tracking pickups, returns & deposits."
                actionLabel="+ New Rental"
                onAction={() => setShowNewModal(true)}
              />
            ) : filtered.length === 0 ? (
              <AdminEmptyState
                title="No matching rentals"
                description="Try adjusting your search or filter."
              />
            ) : (
              <AdminTable<RentalOrder & Record<string, unknown>>
                columns={columns}
                data={filtered as (RentalOrder & Record<string, unknown>)[]}
                onRowClick={(r) => setSelected(r)}
              />
            )}
          </div>
        )}
      </div>

      {/* New Modal */}
      {showNewModal && (
        <NewRentalModal
          clients={clients}
          items={items}
          onClose={() => setShowNewModal(false)}
          onSave={createRental}
        />
      )}

      {/* Detail Drawer */}
      {selected && (
        <RentalDetailDrawer rental={selected} onClose={() => setSelected(null)} onSaved={load} />
      )}

      {/* Slide-in animation */}
      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}

/* ── StatusBadge re-export to silence unused-import warning ── */
void StatusBadge;
