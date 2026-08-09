'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

/* ── types ── */
interface CustomOrder {
  id: string;
  orderId: string;
  client?: { name: string } | null;
}

interface Fitting {
  id: string;
  customOrderId: string | null;
  clientId: string | null;
  type: 'initial' | 'standard' | 'final' | 'alteration';
  scheduledDate: string;
  scheduledTime: string | null;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
  location: string | null;
  fitter: string | null;
  notes: string | null;
  alterationsNeeded: string | null;
  customOrder?: {
    orderId?: string;
    client?: { name: string } | null;
  } | null;
}

type FittingForm = {
  customOrderId: string;
  type: string;
  scheduledDate: string;
  scheduledTime: string;
  duration: number;
  location: string;
  fitter: string;
  notes: string;
};

const EMPTY_FORM: FittingForm = {
  customOrderId: '',
  type: 'standard',
  scheduledDate: '',
  scheduledTime: '10:00',
  duration: 30,
  location: 'atelier',
  fitter: '',
  notes: '',
};

const STATUS_BG: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  no_show: 'bg-red-50 text-red-700 border-red-200',
  rescheduled: 'bg-amber-50 text-amber-700 border-amber-200',
};

const TYPE_LABELS: Record<string, string> = {
  initial: 'Initial',
  standard: 'Standard',
  final: 'Final',
  alteration: 'Alteration',
};

const DURATIONS = [15, 30, 45, 60, 90];
const LOCATIONS = ['atelier', 'client home', 'virtual'];

/* ── component ── */
export default function FittingsPage() {
  const [fittings, setFittings] = useState<Fitting[]>([]);
  const [customOrders, setCustomOrders] = useState<CustomOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<FittingForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [fRes, oRes] = await Promise.all([
        fetch('/api/admin/fittings'),
        fetch('/api/admin/custom-orders'),
      ]);
      if (!fRes.ok) throw new Error('Failed to load fittings');
      const fData = await fRes.json();
      setFittings(Array.isArray(fData) ? fData : []);
      if (oRes.ok) {
        const oData = await oRes.json();
        setCustomOrders(Array.isArray(oData) ? oData : []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── stats ── */
  const today = new Date();
  const stats = useMemo(() => {
    const total = fittings.length;
    const upcoming = fittings.filter(f => new Date(f.scheduledDate) >= today && f.status === 'scheduled').length;
    const completed = fittings.filter(f => f.status === 'completed').length;
    const noShows = fittings.filter(f => f.status === 'no_show').length;
    return { total, upcoming, completed, noShows };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fittings]);

  /* ── save ── */
  async function save() {
    if (!form.scheduledDate) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/fittings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customOrderId: form.customOrderId || null,
          type: form.type,
          scheduledDate: form.scheduledDate,
          scheduledTime: form.scheduledTime,
          duration: form.duration,
          location: form.location,
          fitter: form.fitter,
          notes: form.notes,
          status: 'scheduled',
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch {
      setError('Failed to schedule fitting');
    } finally {
      setSaving(false);
    }
  }

  const updateForm = (patch: Partial<FittingForm>) => setForm(prev => ({ ...prev, ...patch }));

  /* ── render helpers ── */
  function StatCard({ label, value }: { label: string; value: number }) {
    return (
      <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm p-5 flex-1 min-w-[140px]">
        <p className="text-sm text-[color:var(--aw-text-muted)] mb-1">{label}</p>
        <p className="text-2xl font-semibold text-[color:var(--aw-text-strong)]">{value}</p>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Fittings</h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">Fitting appointments</p>
        </div>
        <button className="btn-primary text-base px-6 py-2.5" onClick={() => { setForm(EMPTY_FORM); setModal(true); }}>+ Schedule Fitting</button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Upcoming" value={stats.upcoming} />
        <StatCard label="Completed" value={stats.completed} />
        <StatCard label="No-Shows" value={stats.noShows} />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">{error}</div>}

      {/* Table */}
      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-[color:var(--aw-border)] overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E8E3DB] bg-[color:var(--aw-surface-muted)]">
                {['Date', 'Time', 'Client', 'Order', 'Type', 'Fitter', 'Location', 'Status'].map(h => (
                  <th key={h} className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fittings.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[color:var(--aw-text-muted)]">No fittings scheduled</td></tr>
              ) : (
                fittings.map(f => (
                  <tr key={f.id} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-surface-muted)] transition-colors">
                    <td className="px-4 py-3 text-sm text-[#2D2D2D]">
                      {new Date(f.scheduledDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-[#2D2D2D]">
                      {f.scheduledTime || '--:--'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[color:var(--aw-text-strong)]">
                      {f.customOrder?.client?.name || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-sm text-[color:var(--aw-text-muted)]">
                      {f.customOrder?.orderId || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded bg-[color:var(--aw-cream)] text-[color:var(--aw-text-strong)] capitalize">
                        {TYPE_LABELS[f.type] || f.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#2D2D2D]">{f.fitter || '—'}</td>
                    <td className="px-4 py-3 text-sm text-[color:var(--aw-text-muted)] capitalize">{f.location || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_BG[f.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {f.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New Fitting Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setModal(false)}>
          <div className="bg-white rounded-xl p-7 w-full max-w-lg mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-5" style={{ fontFamily: 'var(--font-heading)' }}>Schedule Fitting</h2>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Custom Order */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Custom Order</label>
                <select className="input-field text-sm py-2" value={form.customOrderId} onChange={e => updateForm({ customOrderId: e.target.value })}>
                  <option value="">Select order...</option>
                  {customOrders.map(o => (
                    <option key={o.id} value={o.id}>{o.orderId} — {o.client?.name || 'Unknown'}</option>
                  ))}
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Type</label>
                <select className="input-field text-sm py-2" value={form.type} onChange={e => updateForm({ type: e.target.value })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Date</label>
                  <input type="date" className="input-field text-sm py-2" value={form.scheduledDate} onChange={e => updateForm({ scheduledDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Time</label>
                  <input type="time" className="input-field text-sm py-2" value={form.scheduledTime} onChange={e => updateForm({ scheduledTime: e.target.value })} />
                </div>
              </div>

              {/* Duration & Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Duration</label>
                  <select className="input-field text-sm py-2" value={form.duration} onChange={e => updateForm({ duration: Number(e.target.value) })}>
                    {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Location</label>
                  <select className="input-field text-sm py-2" value={form.location} onChange={e => updateForm({ location: e.target.value })}>
                    {LOCATIONS.map(l => <option key={l} value={l} className="capitalize">{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              {/* Fitter */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Fitter</label>
                <input className="input-field text-sm py-2" value={form.fitter} onChange={e => updateForm({ fitter: e.target.value })} placeholder="Fitter name" />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Notes</label>
                <textarea className="input-field text-sm py-2" rows={3} value={form.notes} onChange={e => updateForm({ notes: e.target.value })} placeholder="Additional notes..." />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-outline text-sm px-5 py-2" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-primary text-sm px-5 py-2" onClick={save} disabled={saving || !form.scheduledDate}>
                {saving ? 'Saving...' : 'Schedule Fitting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
