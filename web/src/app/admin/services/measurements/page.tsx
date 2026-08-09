'use client';

import { useEffect, useState, useCallback } from 'react';

interface Client { id: string; clientId: string; name: string; }

interface MeasurementProfile {
  id: string;
  clientId: string;
  clientName: string;
  profileName: string;
  bust: number | null;
  waist: number | null;
  hip: number | null;
  shoulder: number | null;
  sleeve: number | null;
  length: number | null;
  inseam: number | null;
  neckline: number | null;
  armhole: number | null;
  backWidth: number | null;
  frontLength: number | null;
  skirtLength: number | null;
  trouserLength: number | null;
  fitPreference: 'slim' | 'regular' | 'relaxed';
  accuracy: number;
  measuredBy: string;
  notes: string | null;
  updatedAt: string;
  history?: { date: string; bust: number | null; waist: number | null; hip: number | null }[];
}

const CORE_FIELDS: { key: keyof MeasurementProfile; label: string }[] = [
  { key: 'bust', label: 'Bust' }, { key: 'waist', label: 'Waist' },
  { key: 'hip', label: 'Hip' }, { key: 'shoulder', label: 'Shoulder' },
  { key: 'sleeve', label: 'Sleeve' }, { key: 'length', label: 'Length' },
  { key: 'inseam', label: 'Inseam' }, { key: 'neckline', label: 'Neckline' },
];

const EXTENDED_FIELDS: { key: keyof MeasurementProfile; label: string }[] = [
  { key: 'armhole', label: 'Armhole' }, { key: 'backWidth', label: 'Back Width' },
  { key: 'frontLength', label: 'Front Length' }, { key: 'skirtLength', label: 'Skirt Length' },
  { key: 'trouserLength', label: 'Trouser Length' },
];

const EMPTY: Partial<MeasurementProfile> = {
  clientId: '', profileName: 'Default', measuredBy: '', fitPreference: 'regular',
  bust: null, waist: null, hip: null, shoulder: null, sleeve: null, length: null,
  inseam: null, neckline: null, armhole: null, backWidth: null, frontLength: null,
  skirtLength: null, trouserLength: null, accuracy: 85, notes: '',
};

const FIT_COLORS: Record<string, string> = {
  slim: '#6366f1', regular: '#1B2A5B', relaxed: '#8B7569',
};

function accuracyColor(v: number) {
  if (v >= 80) return '#16a34a';
  if (v >= 60) return '#d97706';
  return '#C41E3A';
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function trio(p: MeasurementProfile) {
  const b = p.bust ?? '—'; const w = p.waist ?? '—'; const h = p.hip ?? '—';
  return `${b}-${w}-${h}`;
}

export default function MeasurementsPage() {
  const [profiles, setProfiles] = useState<MeasurementProfile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [editing, setEditing] = useState<Partial<MeasurementProfile> | null>(null);
  const [detail, setDetail] = useState<MeasurementProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const qp = clientFilter ? `?clientId=${clientFilter}` : '';
    Promise.all([
      fetch(`/api/admin/measurements${qp}`).then((r) => { if (!r.ok) throw new Error('Failed to load measurements'); return r.json(); }),
      fetch('/api/admin/clients').then((r) => r.json()).catch(() => []),
    ])
      .then(([m, c]) => { setProfiles(m); setClients(c); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clientFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = profiles.filter((p) => {
    const q = search.toLowerCase();
    return p.clientName.toLowerCase().includes(q) || p.profileName.toLowerCase().includes(q) || p.measuredBy.toLowerCase().includes(q);
  });

  const active = profiles.filter((p) => {
    const d = new Date(p.updatedAt);
    return Date.now() - d.getTime() < 90 * 24 * 60 * 60 * 1000;
  }).length;
  const avgAcc = profiles.length ? Math.round(profiles.reduce((s, p) => s + p.accuracy, 0) / profiles.length) : 0;
  const recent = profiles.filter((p) => Date.now() - new Date(p.updatedAt).getTime() < 7 * 24 * 60 * 60 * 1000).length;

  async function save() {
    if (!editing || !editing.clientId || !editing.profileName) return;
    setSaving(true);
    const isNew = !editing.id;
    const url = isNew ? '/api/admin/measurements' : `/api/admin/measurements/${editing.id}`;
    try {
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      if (!res.ok) throw new Error('Save failed');
      setEditing(null);
      load();
    } catch { setError('Failed to save measurement'); }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this measurement profile?')) return;
    await fetch(`/api/admin/measurements/${id}`, { method: 'DELETE' });
    load();
  }

  function numField(key: keyof MeasurementProfile, label: string) {
    return (
      <div key={key}>
        <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">{label}</label>
        <input type="number" step="0.5" className="input-field text-base py-2" value={(editing as Record<string, number | null>)[key] ?? ''}
          onChange={(e) => setEditing({ ...editing!, [key]: e.target.value ? parseFloat(e.target.value) : null })} />
      </div>
    );
  }

  /* ---- Stats cards ---- */
  const stats = [
    { label: 'Total Profiles', value: profiles.length, color: '#1B2A5B' },
    { label: 'Active', value: active, color: '#16a34a' },
    { label: 'Avg Accuracy', value: `${avgAcc}%`, color: accuracyColor(avgAcc) },
    { label: 'Recent Updates', value: recent, color: '#d97706' },
  ];

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Measurements</h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">Client measurement profiles</p>
        </div>
        <button className="btn-primary text-base px-6 py-2.5" onClick={() => setEditing({ ...EMPTY })}>+ New Measurement</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="card bg-white rounded-lg border border-[color:var(--aw-border)] p-4">
            <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input className="input-field text-base py-2.5 flex-1 max-w-md" placeholder="Search by client, profile, or measurer..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input-field text-base py-2.5 max-w-xs" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">All Clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {error && <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] rounded-lg px-4 py-3 mb-5 text-sm">{error}</div>}

      {/* Table */}
      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-[color:var(--aw-border)] overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-[#E8E3DB] bg-[color:var(--aw-surface-muted)]">
                {['Client', 'Profile', 'Key Measurements', 'Fit', 'Accuracy', 'Measured By', 'Last Updated', ''].map((h) => (
                  <th key={h} className={`text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] ${h === '' ? 'text-right' : 'text-left'} px-5 py-4`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-surface-muted)] transition-colors">
                  <td className="px-5 py-4 text-[15px] font-semibold text-[color:var(--aw-text-strong)]">{p.clientName}</td>
                  <td className="px-5 py-4 text-[15px] text-[#2D2D2D]">{p.profileName}</td>
                  <td className="px-5 py-4 text-[15px] font-mono text-[#2D2D2D]">{trio(p)}</td>
                  <td className="px-5 py-4">
                    <span className="status-badge text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: FIT_COLORS[p.fitPreference] + '18', color: FIT_COLORS[p.fitPreference] }}>
                      {p.fitPreference}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[15px] font-semibold" style={{ color: accuracyColor(p.accuracy) }}>{p.accuracy}%</td>
                  <td className="px-5 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{p.measuredBy}</td>
                  <td className="px-5 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{fmtDate(p.updatedAt)}</td>
                  <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap">
                    <button className="text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors" onClick={() => setEditing(p)}>Edit</button>
                    <button className="text-[color:var(--aw-text-muted)] hover:bg-[#8B7569]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors" onClick={() => setDetail(p)}>Details</button>
                    <button className="text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger)]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors" onClick={() => remove(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-base text-[color:var(--aw-text-muted)]">No measurement profiles found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== New/Edit Modal ========== */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-[color:var(--aw-border)] px-7 py-5 rounded-t-xl">
              <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>
                {editing.id ? 'Edit Measurement Profile' : 'New Measurement Profile'}
              </h2>
            </div>
            <div className="px-7 py-6 space-y-6">
              {/* Section 1 – Client Selection */}
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Client Selection</h3>
                <select className="input-field text-base py-2.5 w-full" value={editing.clientId || ''} onChange={(e) => setEditing({ ...editing, clientId: e.target.value })}>
                  <option value="">Select a client...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.clientId})</option>)}
                </select>
              </div>

              {/* Section 2 – Profile Info */}
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Profile Info</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Profile Name</label>
                    <input className="input-field text-base py-2" value={editing.profileName || ''} onChange={(e) => setEditing({ ...editing, profileName: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Measured By</label>
                    <input className="input-field text-base py-2" value={editing.measuredBy || ''} onChange={(e) => setEditing({ ...editing, measuredBy: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Section 3 – Core Measurements */}
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Core Measurements <span className="text-[color:var(--aw-text-muted)] normal-case font-normal">(inches)</span></h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {CORE_FIELDS.map((f) => numField(f.key, f.label))}
                </div>
              </div>

              {/* Section 4 – Extended Measurements */}
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Extended Measurements <span className="text-[color:var(--aw-text-muted)] normal-case font-normal">(inches)</span></h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {EXTENDED_FIELDS.map((f) => numField(f.key, f.label))}
                </div>
              </div>

              {/* Section 5 – Fit Preference */}
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Fit Preference</h3>
                <div className="flex gap-6">
                  {(['slim', 'regular', 'relaxed'] as const).map((fp) => (
                    <label key={fp} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="fitPref" checked={editing.fitPreference === fp} onChange={() => setEditing({ ...editing, fitPreference: fp })}
                        className="w-4 h-4 accent-[#1B2A5B]" />
                      <span className="text-base text-[#2D2D2D] capitalize">{fp}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Section 6 – Notes */}
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Notes</h3>
                <textarea className="input-field text-base py-2.5 w-full" rows={3} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-[color:var(--aw-border)] px-7 py-4 flex justify-end gap-3 rounded-b-xl">
              <button className="btn-outline text-base px-5 py-2.5" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary text-base px-5 py-2.5" onClick={save} disabled={saving || !editing.clientId || !editing.profileName}>
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Detail Modal ========== */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-[color:var(--aw-border)] px-7 py-5 flex items-center justify-between rounded-t-xl">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>{detail.clientName}</h2>
                <p className="text-sm text-[color:var(--aw-text-muted)]">{detail.profileName} profile</p>
              </div>
              <button className="btn-outline text-sm px-4 py-2" onClick={() => setDetail(null)}>Close</button>
            </div>
            <div className="px-7 py-6 space-y-6">
              {/* Body-map-like card layout */}
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-4">Full Measurements</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[...CORE_FIELDS, ...EXTENDED_FIELDS].map((f) => {
                    const val = (detail as unknown as Record<string, unknown>)[f.key];
                    return (
                      <div key={f.key} className="rounded-lg border border-[color:var(--aw-border)] bg-[color:var(--aw-bg)] p-3 text-center">
                        <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">{f.label}</p>
                        <p className="text-xl font-bold text-[color:var(--aw-text-strong)]">{val != null ? `${val}"` : '—'}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Fit + Accuracy */}
              <div className="flex flex-wrap gap-4">
                <div className="rounded-lg border border-[color:var(--aw-border)] bg-[color:var(--aw-bg)] px-5 py-3">
                  <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Fit Preference</p>
                  <span className="status-badge text-sm font-semibold px-3 py-1 rounded-full capitalize" style={{ background: FIT_COLORS[detail.fitPreference] + '18', color: FIT_COLORS[detail.fitPreference] }}>{detail.fitPreference}</span>
                </div>
                <div className="rounded-lg border border-[color:var(--aw-border)] bg-[color:var(--aw-bg)] px-5 py-3">
                  <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Accuracy</p>
                  <p className="text-xl font-bold" style={{ color: accuracyColor(detail.accuracy) }}>{detail.accuracy}%</p>
                </div>
                <div className="rounded-lg border border-[color:var(--aw-border)] bg-[color:var(--aw-bg)] px-5 py-3">
                  <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Measured By</p>
                  <p className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{detail.measuredBy}</p>
                </div>
              </div>

              {/* AI Inconsistency Detection */}
              {detail.waist && detail.hip && detail.waist / detail.hip < 0.55 && (
                <div className="rounded-lg border border-[#d97706] bg-[#d97706]/10 px-5 py-3 flex items-start gap-3">
                  <span className="text-lg">&#9888;</span>
                  <div>
                    <p className="text-sm font-semibold text-[#d97706]">AI Inconsistency Alert</p>
                    <p className="text-sm text-[color:var(--aw-text-muted)]">Waist ({detail.waist}&quot;) seems unusually small relative to hip ({detail.hip}&quot;) &mdash; verify?</p>
                  </div>
                </div>
              )}

              {/* Measurement History */}
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-3">Measurement History</h3>
                {detail.history && detail.history.length > 0 ? (
                  <div className="space-y-2">
                    {detail.history.map((h, i) => {
                      const prev = detail.history![i + 1];
                      return (
                        <div key={i} className="flex items-center gap-4 rounded-lg border border-[color:var(--aw-border)] px-4 py-3 text-sm">
                          <span className="text-[color:var(--aw-text-muted)] min-w-[80px]">{fmtDate(h.date)}</span>
                          <span className="font-mono text-[#2D2D2D]">{h.bust ?? '—'}-{h.waist ?? '—'}-{h.hip ?? '—'}</span>
                          {prev && (
                            <span className="text-xs text-[color:var(--aw-text-muted)]">
                              {(['bust', 'waist', 'hip'] as const).map((k) => {
                                const diff = (h[k] ?? 0) - (prev[k] ?? 0);
                                if (diff === 0) return null;
                                return <span key={k} className={`ml-2 ${diff > 0 ? 'text-[color:var(--aw-danger)]' : 'text-[#16a34a]'}`}>{k} {diff > 0 ? '+' : ''}{diff}</span>;
                              })}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-[color:var(--aw-text-muted)]">No previous measurements recorded.</p>
                )}
              </div>

              {/* Notes */}
              {detail.notes && (
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-2">Notes</h3>
                  <p className="text-sm text-[#2D2D2D] bg-[color:var(--aw-bg)] rounded-lg p-4 border border-[color:var(--aw-border)]">{detail.notes}</p>
                </div>
              )}

              {/* Export placeholder */}
              <div className="flex gap-3 pt-2">
                <button className="btn-outline text-sm px-4 py-2" disabled title="Export feature coming soon">Export PDF</button>
                <button className="btn-accent text-sm px-4 py-2" disabled title="Email feature coming soon">Email to Client</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
