'use client';

import { useEffect, useState, useCallback } from 'react';
import { PaginationFooter } from '@/components/admin';

/* ── Types ─────────────────────────────────────────────────── */

interface Designer {
  id: string;
  name: string;
  businessName: string;
  email: string;
  phone: string;
  location: string;
  specialty: string;
  bio: string;
  portfolioUrl: string;
  maxCapacity: number;
  currentLoad: number;
  priceRange: string;
  status: 'active' | 'inactive' | 'on_leave' | 'probation';
  rating: number;
  completedOrders: number;
  avgDeliveryDays: number;
  tags: string[];
  assignedOrders: { orderId: string; item: string; status: string }[];
  // Assignment system fields
  userId?: string | null;
  user?: { id: string; email: string; name: string; role: string } | null;
  acceptanceRate?: number;
  onTimeRate?: number;
  totalOffered?: number;
  totalAccepted?: number;
  lastAssignedAt?: string | null;
  assignmentOffers?: { offerId: string; status: string; offeredAt: string; respondedAt: string | null; customOrder: { orderId: string; eventType: string | null } }[];
}

type DesignerForm = Omit<Designer, 'id' | 'rating' | 'completedOrders' | 'avgDeliveryDays' | 'currentLoad' | 'assignedOrders'>;

const EMPTY_FORM: DesignerForm = {
  name: '', businessName: '', email: '', phone: '', location: '',
  specialty: 'all', bio: '', portfolioUrl: '',
  maxCapacity: 5, priceRange: 'mid', status: 'active', tags: [],
};

const SPECIALTIES = ['bridal', 'evening', 'menswear', 'accessories', 'couture', 'all'] as const;
const PRICE_RANGES = ['budget', 'mid', 'premium', 'luxury'] as const;
const STATUSES = ['active', 'inactive', 'on_leave', 'probation'] as const;
const PERSONAL_FIELDS = ['name', 'businessName', 'email', 'phone', 'location'] as const;

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: 'Active',    color: '#2D8E5A', bg: '#E8F5E9' },
  inactive:  { label: 'Inactive',  color: '#8B7569', bg: '#F0EBE3' },
  on_leave:  { label: 'On Leave',  color: '#D4A017', bg: '#FFF8E1' },
  probation: { label: 'Probation', color: '#C41E3A', bg: '#FDECEA' },
};

const SPECIALTY_COLORS: Record<string, string> = {
  bridal: '#8E6BAE', evening: '#1B2A5B', menswear: '#4A7B8E',
  accessories: '#D4A574', couture: '#C41E3A', all: '#8B7569',
};

const INITIALS_BG = ['#1B2A5B', '#C41E3A', '#4A7B8E', '#8E6BAE', '#2D8E5A', '#D4A574'];

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function initialsColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return INITIALS_BG[Math.abs(h) % INITIALS_BG.length];
}

function capacityPercent(current: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(Math.round((current / max) * 100), 100);
}

function capacityColor(pct: number) {
  if (pct >= 80) return '#C41E3A';
  if (pct >= 60) return '#D4A017';
  return '#2D8E5A';
}

/* ── Component ─────────────────────────────────────────────── */

export default function DesignersPage() {
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<DesignerForm & { id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Designer | null>(null);
  const [tagsInput, setTagsInput] = useState('');

  type DesignerSortColumn = 'name' | 'designerId' | 'rating' | 'completedOrders' | 'currentLoad' | 'status';

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<DesignerSortColumn>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [aggStats, setAggStats] = useState<{
    total: number;
    active: number;
    available: number;
    avgRating: number;
    totalCompletedOrders: number;
  } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortDir,
    });
    if (search.trim()) params.set('search', search.trim());
    Promise.all([
      fetch(`/api/admin/designers?${params.toString()}`).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => null);
          throw new Error(err?.error || `Designers failed to load (${r.status})`);
        }
        return r.json();
      }),
      // Stats are global (all designers, not just this page) — fetched in parallel.
      fetch('/api/admin/designers/stats').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([data, stats]) => {
        if (Array.isArray(data)) {
          setDesigners(data);
          setTotalCount(data.length);
          setTotalPages(1);
        } else {
          setDesigners(Array.isArray(data.items) ? data.items : []);
          setTotalCount(typeof data.total === 'number' ? data.total : 0);
          setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1);
        }
        if (stats) setAggStats(stats);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load designers.'))
      .finally(() => setLoading(false));
  }, [page, pageSize, sortBy, sortDir, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  /* ── Stats (global, via /stats endpoint — independent of pagination) ──── */
  const totalDesigners = aggStats?.total ?? totalCount;
  const available = aggStats?.available ?? 0;
  const avgRating = aggStats?.avgRating ?? 0;
  const totalCompleted = aggStats?.totalCompletedOrders ?? 0;

  /* ── CRUD ─────────────────────────────────────────────── */
  function openAdd() {
    setEditing({ ...EMPTY_FORM });
    setTagsInput('');
  }

  function openEdit(d: Designer) {
    setEditing({
      id: d.id, name: d.name, businessName: d.businessName, email: d.email,
      phone: d.phone, location: d.location, specialty: d.specialty,
      bio: d.bio, portfolioUrl: d.portfolioUrl, maxCapacity: d.maxCapacity,
      priceRange: d.priceRange, status: d.status as DesignerForm['status'], tags: d.tags,
    });
    setTagsInput((d.tags || []).join(', '));
  }

  async function save() {
    if (!editing || !editing.name) return;
    setSaving(true);
    const body = { ...editing, tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean) };
    const isNew = !editing.id;
    const url = isNew ? '/api/admin/designers' : `/api/admin/designers/${editing.id}`;
    await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Remove this designer from the network?')) return;
    await fetch(`/api/admin/designers/${id}`, { method: 'DELETE' });
    load();
  }

  /* ── Stat cards ───────────────────────────────────────── */
  const statCards = [
    { label: 'Total Designers', value: totalDesigners, color: '#1B2A5B' },
    { label: 'Available', value: available, color: '#2D8E5A' },
    { label: 'Avg Rating', value: `★ ${avgRating}`, color: '#D4A017' },
    { label: 'Orders Completed', value: totalCompleted, color: '#1B2A5B' },
  ];

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Partner Designers</h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">Designer network management</p>
        </div>
        <button className="btn-primary text-base px-6 py-2.5" onClick={openAdd}>+ Add Designer</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {statCards.map(c => (
          <div key={c.label} className="bg-white rounded-lg p-5 shadow-sm border border-[color:var(--aw-border)]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-2">{c.label}</p>
            <p className="text-3xl font-semibold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search + sort toolbar */}
      <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm p-3 mb-5 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, ID, email, location, specialty…"
          className="input-field text-sm py-2 flex-1 min-w-[200px]"
        />
        <select
          className="input-field text-sm py-2 max-w-[180px]"
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value as DesignerSortColumn); setPage(1); }}
        >
          <option value="name">Sort: Name</option>
          <option value="designerId">Sort: Designer ID</option>
          <option value="rating">Sort: Rating</option>
          <option value="completedOrders">Sort: Orders done</option>
          <option value="currentLoad">Sort: Current load</option>
          <option value="status">Sort: Status</option>
        </select>
        <button
          type="button"
          onClick={() => { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); setPage(1); }}
          className="px-3 py-2 border border-[color:var(--aw-border)] rounded-md text-sm font-medium text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-bg)]"
          title="Toggle sort direction"
        >
          {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
      </div>

      {/* States */}
      {loading && <div className="loading-spinner mx-auto mt-8" />}
      {error && <div className="bg-[#FDECEA] text-[color:var(--aw-danger)] rounded-lg p-5 text-center text-base">{error} <button className="underline ml-2" onClick={load}>Retry</button></div>}

      {!loading && !error && designers.length === 0 && (
        <div className="text-center py-16">
          <p className="text-lg text-[color:var(--aw-text-muted)] mb-3">No partner designers yet</p>
          <button className="btn-primary text-base px-6 py-2.5" onClick={openAdd}>Add your first designer</button>
        </div>
      )}

      {/* Designer Grid */}
      {!loading && !error && designers.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {designers.map(d => {
            const pct = capacityPercent(d.currentLoad, d.maxCapacity);
            const sm = STATUS_META[d.status] || STATUS_META.inactive;
            return (
              <div key={d.id} className="bg-white rounded-xl p-6 shadow-sm border border-[color:var(--aw-border)] flex flex-col">
                {/* Top row */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: initialsColor(d.name) }}>{getInitials(d.name)}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[15px] font-semibold text-[color:var(--aw-text-strong)] truncate" style={{ fontFamily: 'var(--font-heading)' }}>{d.name}</h3>
                    <p className="text-sm text-[color:var(--aw-text-muted)] truncate">{d.businessName || '—'}</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: sm.color, backgroundColor: sm.bg }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sm.color }} />
                    {sm.label}
                  </span>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: SPECIALTY_COLORS[d.specialty] || '#8B7569' }}>
                    {d.specialty}
                  </span>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[color:var(--aw-cream)] text-[color:var(--aw-text-muted)] capitalize">{d.priceRange}</span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-sm mb-3">
                  <span className="text-[#D4A017] font-semibold">★ {d.rating.toFixed(1)}</span>
                  <span className="text-[color:var(--aw-text-muted)]">{d.completedOrders} completed</span>
                  <span className="text-[color:var(--aw-text-muted)]">{d.currentLoad}/{d.maxCapacity} load</span>
                </div>

                {/* Capacity bar */}
                <div className="mb-3">
                  <div className="w-full h-2 rounded-full bg-[color:var(--aw-cream)]">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: capacityColor(pct) }} />
                  </div>
                </div>

                {/* Location */}
                <p className="text-sm text-[color:var(--aw-text-muted)] mb-4">{d.location || '—'}</p>

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-2 border-t border-[color:var(--aw-border)]">
                  <button className="text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors" onClick={() => setViewing(d)}>View Profile</button>
                  <button className="text-[#2D8E5A] hover:bg-[#2D8E5A]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors">Assign Work</button>
                  <button className="text-[color:var(--aw-text-muted)] hover:bg-[#8B7569]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors ml-auto" onClick={() => openEdit(d)}>Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <PaginationFooter
        page={page}
        totalPages={totalPages}
        total={totalCount}
        label="designer"
        onPageChange={setPage}
        loading={loading}
      />

      {/* ── Add / Edit Modal ─────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl p-7 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-5" style={{ fontFamily: 'var(--font-heading)' }}>
              {editing.id ? 'Edit Designer' : 'Add Designer'}
            </h2>

            {/* 1. Personal Info */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Personal Info</p>
            <div className="space-y-3 mb-5">
              {PERSONAL_FIELDS.map(f => (
                <div key={f}>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1 capitalize">{f.replace(/([A-Z])/g, ' $1')}</label>
                  <input className="input-field text-base py-2.5" value={editing[f]}
                    onChange={e => setEditing({ ...editing, [f]: e.target.value })} />
                </div>
              ))}
            </div>

            {/* 2. Professional */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Professional</p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Specialty</label>
                <select className="input-field text-base py-2.5" value={editing.specialty}
                  onChange={e => setEditing({ ...editing, specialty: e.target.value })}>
                  {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Bio</label>
                <textarea className="input-field text-base py-2.5" rows={3} value={editing.bio || ''}
                  onChange={e => setEditing({ ...editing, bio: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Portfolio URL</label>
                <input className="input-field text-base py-2.5" value={editing.portfolioUrl || ''}
                  onChange={e => setEditing({ ...editing, portfolioUrl: e.target.value })} />
              </div>
            </div>

            {/* 3. Capacity */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Capacity</p>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Max Capacity</label>
                <input type="number" min={1} className="input-field text-base py-2.5" value={editing.maxCapacity}
                  onChange={e => setEditing({ ...editing, maxCapacity: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Price Range</label>
                <select className="input-field text-base py-2.5" value={editing.priceRange}
                  onChange={e => setEditing({ ...editing, priceRange: e.target.value })}>
                  {PRICE_RANGES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* 4. Status */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Status</p>
            <div className="mb-5">
              <select className="input-field text-base py-2.5" value={editing.status}
                onChange={e => setEditing({ ...editing, status: e.target.value as DesignerForm['status'] })}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>

            {/* 5. Tags */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Tags</p>
            <div className="mb-5">
              <input className="input-field text-base py-2.5" placeholder="e.g. fast turnaround, premium fabrics"
                value={tagsInput} onChange={e => setTagsInput(e.target.value)} />
              <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">Comma-separated</p>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center mt-6">
              {editing.id ? (
                <button className="text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger)]/10 text-sm font-medium px-3 py-1.5 rounded transition-colors"
                  onClick={() => { remove(editing.id!); setEditing(null); }}>Delete</button>
              ) : <span />}
              <div className="flex gap-3">
                <button className="btn-outline text-base px-5 py-2.5" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn-primary text-base px-5 py-2.5" onClick={save} disabled={saving || !editing.name}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Designer Detail Modal ────────────────────────── */}
      {viewing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl p-7 w-full max-w-2xl mx-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {/* Profile header */}
            <div className="flex items-start gap-5 mb-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
                style={{ backgroundColor: initialsColor(viewing.name) }}>{getInitials(viewing.name)}</div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>{viewing.name}</h2>
                <p className="text-base text-[color:var(--aw-text-muted)]">{viewing.businessName || '—'}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-white"
                    style={{ backgroundColor: SPECIALTY_COLORS[viewing.specialty] || '#8B7569' }}>{viewing.specialty}</span>
                  {(() => { const sm = STATUS_META[viewing.status] || STATUS_META.inactive; return (
                    <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: sm.color, backgroundColor: sm.bg }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sm.color }} />{sm.label}
                    </span>
                  ); })()}
                </div>
                {viewing.bio && <p className="text-sm text-[#2D2D2D] mt-3">{viewing.bio}</p>}
                {viewing.portfolioUrl && (
                  <a href={viewing.portfolioUrl} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-[color:var(--aw-text-strong)] underline mt-1 inline-block">Portfolio</a>
                )}
              </div>
            </div>

            {/* Performance Metrics */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Performance Metrics</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Rating', value: `★ ${viewing.rating.toFixed(1)}`, color: '#D4A017' },
                { label: 'Completed', value: viewing.completedOrders, color: '#1B2A5B' },
                { label: 'Avg Delivery', value: `${viewing.avgDeliveryDays}d`, color: '#4A7B8E' },
                { label: 'Current Load', value: `${viewing.currentLoad}/${viewing.maxCapacity}`, color: capacityColor(capacityPercent(viewing.currentLoad, viewing.maxCapacity)) },
              ].map(m => (
                <div key={m.label} className="bg-[color:var(--aw-bg)] rounded-lg p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">{m.label}</p>
                  <p className="text-2xl font-semibold" style={{ color: m.color }}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Assigned Orders */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Assigned Orders</p>
            {(!viewing.assignedOrders || viewing.assignedOrders.length === 0) ? (
              <p className="text-sm text-[color:var(--aw-text-muted)] mb-6">No orders currently assigned</p>
            ) : (
              <div className="bg-[color:var(--aw-bg)] rounded-lg p-4 mb-6 space-y-2">
                {viewing.assignedOrders.map(o => (
                  <div key={o.orderId} className="flex items-center justify-between py-1.5 border-b border-[color:var(--aw-border)] last:border-0">
                    <div>
                      <span className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{o.orderId}</span>
                      <span className="text-sm text-[color:var(--aw-text-muted)] ml-2">{o.item}</span>
                    </div>
                    <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-[color:var(--aw-navy)] text-white">{o.status}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Activity Timeline placeholder */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Activity Timeline</p>
            <div className="bg-[color:var(--aw-bg)] rounded-lg p-5 mb-6 text-center text-sm text-[color:var(--aw-text-muted)]">
              Timeline data will appear here as orders are processed
            </div>

            {/* Assignment Stats */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Assignment Stats</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Acceptance Rate', value: `${Math.round((viewing.acceptanceRate ?? 1) * 100)}%`, color: (viewing.acceptanceRate ?? 1) >= 0.7 ? '#2D8E5A' : '#C41E3A' },
                { label: 'Offers Received', value: viewing.totalOffered ?? 0, color: '#1B2A5B' },
                { label: 'Offers Accepted', value: viewing.totalAccepted ?? 0, color: '#2D8E5A' },
              ].map(m => (
                <div key={m.label} className="bg-[color:var(--aw-bg)] rounded-lg p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">{m.label}</p>
                  <p className="text-xl font-semibold" style={{ color: m.color }}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Account Link Status */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Platform Account</p>
            <div className={`rounded-lg p-4 mb-6 flex items-center gap-3 ${viewing.user ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <span className="text-lg">{viewing.user ? '✓' : '⚠'}</span>
              <div className="flex-1">
                {viewing.user ? (
                  <>
                    <p className="text-sm font-semibold text-green-800">Linked to {viewing.user.email}</p>
                    <p className="text-xs text-green-600">Designer can log in and receive offers</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-yellow-800">No account linked</p>
                    <p className="text-xs text-yellow-600">Designer cannot receive offers until linked to a user account with role &quot;designer&quot;</p>
                  </>
                )}
              </div>
            </div>

            {/* Recent Offers */}
            {viewing.assignmentOffers && viewing.assignmentOffers.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Recent Offers</p>
                <div className="bg-[color:var(--aw-bg)] rounded-lg p-4 mb-6 space-y-2">
                  {viewing.assignmentOffers.map(o => (
                    <div key={o.offerId} className="flex items-center justify-between py-1.5 border-b border-[color:var(--aw-border)] last:border-0">
                      <div>
                        <span className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{o.offerId}</span>
                        <span className="text-sm text-[color:var(--aw-text-muted)] ml-2">{o.customOrder.orderId} {o.customOrder.eventType ? `(${o.customOrder.eventType})` : ''}</span>
                      </div>
                      <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${
                        o.status === 'accepted' ? 'bg-green-100 text-green-700' :
                        o.status === 'declined' ? 'bg-red-100 text-red-700' :
                        o.status === 'expired' ? 'bg-gray-100 text-gray-500' :
                        'bg-blue-100 text-blue-700'
                      }`}>{o.status}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Detail contact / info */}
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Contact &amp; Details</p>
            <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
              <div><span className="text-[color:var(--aw-text-muted)]">Email:</span> <span className="text-[#2D2D2D] ml-1">{viewing.email || '—'}</span></div>
              <div><span className="text-[color:var(--aw-text-muted)]">Phone:</span> <span className="text-[#2D2D2D] ml-1">{viewing.phone || '—'}</span></div>
              <div><span className="text-[color:var(--aw-text-muted)]">Location:</span> <span className="text-[#2D2D2D] ml-1">{viewing.location || '—'}</span></div>
              <div><span className="text-[color:var(--aw-text-muted)]">Price Range:</span> <span className="text-[#2D2D2D] ml-1 capitalize">{viewing.priceRange}</span></div>
            </div>

            {/* Tags */}
            {viewing.tags && viewing.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {viewing.tags.map(t => (
                  <span key={t} className="text-xs font-medium px-2.5 py-1 rounded-full bg-[color:var(--aw-cream)] text-[color:var(--aw-text-muted)]">{t}</span>
                ))}
              </div>
            )}

            {/* Footer actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-[color:var(--aw-border)]">
              <button className="btn-outline text-base px-5 py-2.5" onClick={() => setViewing(null)}>Close</button>
              <button className="btn-primary text-base px-5 py-2.5" onClick={() => { openEdit(viewing); setViewing(null); }}>Edit Designer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
