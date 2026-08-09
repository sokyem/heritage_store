'use client';

import { useEffect, useState, useCallback } from 'react';
import { PaginationFooter } from '@/components/admin';

/* ══════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════ */

interface Client { id: string; clientId: string; name: string; }

interface LineItem { description: string; quantity: number; unitPrice: number; total: number; }

interface Quote {
  id: string;
  quoteId: string;
  clientId: string;
  client: { name: string; clientId: string } | null;
  lineItems: string; // JSON
  materialsTotal: number;
  laborTotal: number;
  fittingFee: number;
  rushFee: number;
  deliveryFee: number;
  discount: number;
  discountType: string | null;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  convertedToOrderId: string | null;
  accessToken: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  depositPercent: number;
  depositAmount: number;
  depositPaidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ══════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════ */

const STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#6B728018', text: '#6B7280' },
  sent: { bg: '#3B82F618', text: '#3B82F6' },
  viewed: { bg: '#6366F118', text: '#6366F1' },
  accepted: { bg: '#22C55E18', text: '#22C55E' },
  rejected: { bg: '#C41E3A18', text: '#C41E3A' },
  expired: { bg: '#9CA3AF18', text: '#9CA3AF' },
  converted: { bg: '#059669​18', text: '#059669' },
};

const EMPTY_LINE: LineItem = { description: '', quantity: 1, unitPrice: 0, total: 0 };

const EMPTY_FORM = {
  clientId: '',
  lineItems: [{ ...EMPTY_LINE }] as LineItem[],
  materialsTotal: 0,
  laborTotal: 0,
  fittingFee: 0,
  rushFee: 0,
  deliveryFee: 0,
  discount: 0,
  discountType: 'fixed' as string,
  tax: 0,
  validUntil: '',
  notes: '',
  terms: 'Quote valid for 14 days. 50% deposit required to begin production.',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ══════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════ */

type QuoteSortColumn = 'quoteId' | 'updatedAt' | 'total' | 'status' | 'validUntil';

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<typeof EMPTY_FORM & { id?: string } | null>(null);
  const [detail, setDetail] = useState<Quote | null>(null);
  const [saving, setSaving] = useState(false);
  const [depositPercent, setDepositPercent] = useState(50);
  const [sendBusy, setSendBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Server-side pagination + sort
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<QuoteSortColumn>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/admin/settings/business')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const dp = d?.value?.depositPercent;
        if (typeof dp === 'number') setDepositPercent(dp);
      })
      .catch(() => { /* keep default */ });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortDir,
    });
    if (statusFilter) params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    Promise.all([
      fetch(`/api/admin/quotes?${params}`).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => null);
          throw new Error(err?.error || `Quotes failed to load (${r.status})`);
        }
        return r.json();
      }),
      fetch('/api/admin/clients').then((r) => r.json()).catch(() => []),
    ])
      .then(([q, c]) => {
        if (Array.isArray(q)) {
          setQuotes(q);
          setTotal(q.length);
          setTotalPages(1);
        } else {
          setQuotes(Array.isArray(q.items) ? q.items : []);
          setTotal(typeof q.total === 'number' ? q.total : 0);
          setTotalPages(typeof q.totalPages === 'number' ? q.totalPages : 1);
        }
        setClients(c);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load quotes'))
      .finally(() => setLoading(false));
  }, [statusFilter, search, page, pageSize, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  function toggleSort(col: QuoteSortColumn) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'updatedAt' || col === 'total' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  // Auto-open the "New Invoice" form when other admin pages link here with prefill data:
  //   /admin/quotes?new=1&clientId=...&item=...&total=...&notes=...
  // We read window.location directly to avoid Next.js Suspense requirements for useSearchParams.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.get('new')) return;
    const clientId = sp.get('clientId') || '';
    const item = sp.get('item') || 'Custom item';
    const totalParam = sp.get('total');
    const total = totalParam ? Math.max(0, parseFloat(totalParam) || 0) : 0;
    const notes = sp.get('notes') || '';

    setEditing({
      ...EMPTY_FORM,
      clientId,
      notes,
      lineItems: [{ description: item, quantity: 1, unitPrice: total, total }],
    });
    // Strip the query string so a refresh doesn't re-open the form
    window.history.replaceState({}, '', '/admin/quotes');
  }, []);

  // Server already applied search + status filter. Keep `filtered` as an
  // alias so the table template doesn't need to change.
  const filtered = quotes;

  /* ── Calculated totals (visible-page only; total is the full row count) ── */
  const totalQuoted = quotes.reduce((s, q) => s + q.total, 0);
  const accepted = quotes.filter((q) => q.status === 'accepted' || q.status === 'converted').length;
  const pending = quotes.filter((q) => q.status === 'sent' || q.status === 'viewed').length;

  const stats = [
    { label: 'Total Quotes', value: total || quotes.length, color: '#1B2A5B' },
    { label: 'Pending', value: pending, color: '#F59E0B' },
    { label: 'Accepted', value: accepted, color: '#22C55E' },
    { label: 'Total Quoted', value: fmtCurrency(totalQuoted), color: '#6366F1' },
  ];

  /* ── Line items calc ── */
  function recalcForm(form: typeof EMPTY_FORM & { id?: string }) {
    const items = form.lineItems.map((li) => ({ ...li, total: li.quantity * li.unitPrice }));
    const subtotal = items.reduce((s, li) => s + li.total, 0) + form.materialsTotal + form.laborTotal + form.fittingFee + form.rushFee + form.deliveryFee;
    const discountAmt = form.discountType === 'percentage' ? subtotal * (form.discount / 100) : form.discount;
    const total = subtotal - discountAmt + form.tax;
    return { ...form, lineItems: items, subtotal, total };
  }

  function updateLine(index: number, field: keyof LineItem, value: string | number) {
    if (!editing) return;
    const items = [...editing.lineItems];
    items[index] = { ...items[index], [field]: value };
    setEditing(recalcForm({ ...editing, lineItems: items }));
  }

  function addLine() {
    if (!editing) return;
    setEditing(recalcForm({ ...editing, lineItems: [...editing.lineItems, { ...EMPTY_LINE }] }));
  }

  function removeLine(index: number) {
    if (!editing) return;
    const items = editing.lineItems.filter((_, i) => i !== index);
    setEditing(recalcForm({ ...editing, lineItems: items.length ? items : [{ ...EMPTY_LINE }] }));
  }

  /* ── Save ── */
  async function save() {
    if (!editing || !editing.clientId) return;
    setSaving(true);
    const form = recalcForm(editing);
    const body = { ...form, lineItems: JSON.stringify(form.lineItems) };
    const isNew = !form.id;
    const url = isNew ? '/api/admin/quotes' : `/api/admin/quotes/${form.id}`;
    try {
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Save failed');
      setEditing(null);
      load();
    } catch { setError('Failed to save quote'); }
    setSaving(false);
  }

  /* ── Send quote to client ── */
  async function sendQuote(id: string) {
    setSendBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/quotes/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      // Refresh the detail view with updated quote
      if (data.quote) setDetail(data.quote);
      load();
      // Auto-copy link
      if (data.quoteUrl && navigator.clipboard) {
        try { await navigator.clipboard.writeText(data.quoteUrl); } catch {}
      }
      alert(`Sent! Share link copied to clipboard:\n${data.quoteUrl}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSendBusy(null);
    }
  }

  /* ── Copy share link ── */
  async function copyShareLink(q: Quote) {
    if (!q.accessToken) return;
    const url = `${window.location.origin}/quote/${q.id}?t=${q.accessToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(q.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  /* ── Status change ── */
  async function changeStatus(id: string, status: string) {
    await fetch(`/api/admin/quotes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
    if (detail?.id === id) setDetail(null);
  }

  /* ── Edit existing ── */
  function editQuote(q: Quote) {
    let items: LineItem[] = [];
    try { items = JSON.parse(q.lineItems); } catch { items = [{ ...EMPTY_LINE }]; }
    setEditing({
      id: q.id,
      clientId: q.clientId,
      lineItems: items.length ? items : [{ ...EMPTY_LINE }],
      materialsTotal: q.materialsTotal,
      laborTotal: q.laborTotal,
      fittingFee: q.fittingFee,
      rushFee: q.rushFee,
      deliveryFee: q.deliveryFee,
      discount: q.discount,
      discountType: q.discountType || 'fixed',
      tax: q.tax,
      validUntil: q.validUntil || '',
      notes: q.notes || '',
      terms: q.terms || EMPTY_FORM.terms,
    });
    setDetail(null);
  }

  /* ── Delete ── */
  async function remove(id: string) {
    if (!confirm('Delete this quote?')) return;
    await fetch(`/api/admin/quotes/${id}`, { method: 'DELETE' });
    setDetail(null);
    load();
  }

  /* ── Parse line items helper ── */
  function parseItems(q: Quote): LineItem[] {
    try { return JSON.parse(q.lineItems); } catch { return []; }
  }

  /* ══════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════ */

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Quotes &amp; Pricing</h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">Create and manage client quotes</p>
        </div>
        <button className="btn-primary text-base px-6 py-2.5" onClick={() => setEditing({ ...EMPTY_FORM, lineItems: [{ ...EMPTY_LINE }], terms: `Quote valid for 14 days. ${depositPercent}% deposit required to begin production.` })}>+ New Quote</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="card bg-[color:var(--aw-surface)] rounded-lg border border-[color:var(--aw-border)] p-4">
            <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input className="input-field text-base py-2.5 flex-1 max-w-md" placeholder="Search quotes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input-field text-base py-2.5 max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {error && <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] rounded-lg px-4 py-3 mb-5 text-sm">{error}</div>}

      {/* ── Table ── */}
      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : (
        <div className="bg-[color:var(--aw-surface)] rounded-lg shadow-sm border border-[color:var(--aw-border)] overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-[#E8E3DB] bg-[color:var(--aw-surface-muted)]">
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">
                  <button type="button" onClick={() => toggleSort('quoteId')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Quote ID
                    {sortBy === 'quoteId' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">Client</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">Items</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">
                  <button type="button" onClick={() => toggleSort('total')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Total
                    {sortBy === 'total' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">
                  <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Status
                    {sortBy === 'status' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">
                  <button type="button" onClick={() => toggleSort('validUntil')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Valid Until
                    {sortBy === 'validUntil' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">
                  <button type="button" onClick={() => toggleSort('updatedAt')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                    Created
                    {sortBy === 'updatedAt' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-right px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-[color:var(--aw-text-muted)]">No quotes found</td></tr>
              ) : filtered.map((q) => {
                const items = parseItems(q);
                const sc = STATUS_COLORS[q.status] || STATUS_COLORS.draft;
                return (
                  <tr key={q.id} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-surface-muted)] transition-colors cursor-pointer" onClick={() => setDetail(q)}>
                    <td className="px-5 py-4 text-[15px] font-semibold text-[color:var(--aw-text-strong)]">{q.quoteId}</td>
                    <td className="px-5 py-4 text-[15px]">{q.client?.name || '—'}</td>
                    <td className="px-5 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{items.length} item{items.length !== 1 ? 's' : ''}</td>
                    <td className="px-5 py-4 text-[15px] font-semibold text-[color:var(--aw-text-strong)]">{fmtCurrency(q.total)}</td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: sc.bg, color: sc.text }}>{q.status}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-[color:var(--aw-text-muted)]">{q.validUntil || '—'}</td>
                    <td className="px-5 py-4 text-sm text-[color:var(--aw-text-muted)]">{fmtDate(q.createdAt)}</td>
                    <td className="px-5 py-4 text-right">
                      <button className="text-xs text-[color:var(--aw-text-strong)] hover:underline mr-3" onClick={(e) => { e.stopPropagation(); editQuote(q); }}>Edit</button>
                      <button className="text-xs text-[color:var(--aw-danger)] hover:underline" onClick={(e) => { e.stopPropagation(); remove(q.id); }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PaginationFooter
        page={page}
        totalPages={totalPages}
        total={total}
        label="quote"
        onPageChange={setPage}
        loading={loading}
      />

      {/* ══ Detail Drawer ══ */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setDetail(null)} />
          <div className="relative w-full max-w-xl bg-[color:var(--aw-surface)] shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-[color:var(--aw-surface)] border-b border-[color:var(--aw-border)] px-6 py-5 flex justify-between items-center z-10">
              <div>
                <h2 className="text-lg font-bold text-[color:var(--aw-text-strong)]">{detail.quoteId}</h2>
                <p className="text-sm text-[color:var(--aw-text-muted)]">{detail.client?.name}</p>
              </div>
              <button className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] text-2xl" onClick={() => setDetail(null)}>×</button>
            </div>
            <div className="p-6 space-y-6">
              {/* Status Actions */}
              <div className="flex flex-wrap gap-2">
                {(detail.status === 'draft' || detail.status === 'sent') && (
                  <button
                    className="btn-primary text-xs px-4 py-2 disabled:opacity-50"
                    disabled={sendBusy === detail.id}
                    onClick={() => sendQuote(detail.id)}
                  >
                    {sendBusy === detail.id ? 'Sending…' : detail.sentAt ? '✉ Re-send to Client' : '✉ Send to Client'}
                  </button>
                )}
                {detail.accessToken && (
                  <button
                    className="text-xs px-4 py-2 rounded-lg bg-[color:var(--aw-navy)]/10 text-[color:var(--aw-text-strong)] font-semibold hover:bg-[color:var(--aw-navy)]/20"
                    onClick={() => copyShareLink(detail)}
                  >
                    {copied === detail.id ? '✓ Copied' : '🔗 Copy Share Link'}
                  </button>
                )}
                {(detail.status === 'sent' || detail.status === 'viewed') && (
                  <>
                    <button className="text-xs px-4 py-2 rounded-lg bg-[#22C55E]/10 text-[color:var(--aw-success)] font-semibold hover:bg-[#22C55E]/20" onClick={() => changeStatus(detail.id, 'accepted')}>Mark Accepted</button>
                    <button className="text-xs px-4 py-2 rounded-lg bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] font-semibold hover:bg-[color:var(--aw-danger)]/20" onClick={() => changeStatus(detail.id, 'rejected')}>Mark Declined</button>
                  </>
                )}
              </div>

              {/* Timeline */}
              {(detail.sentAt || detail.viewedAt || detail.acceptedAt || detail.depositPaidAt || detail.rejectedAt) && (
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-2">Activity</h3>
                  <ul className="text-xs text-[color:var(--aw-text-muted)] space-y-1">
                    {detail.sentAt && <li>✉ Sent {fmtDate(detail.sentAt)}</li>}
                    {detail.viewedAt && <li>👁 Client viewed {fmtDate(detail.viewedAt)}</li>}
                    {detail.acceptedAt && <li>✓ Accepted {fmtDate(detail.acceptedAt)}</li>}
                    {detail.depositPaidAt && <li className="text-[#2D8E5A] font-semibold">💳 Deposit paid {fmtDate(detail.depositPaidAt)} — {fmtCurrency(detail.depositAmount)}</li>}
                    {detail.rejectedAt && <li className="text-[color:var(--aw-danger)]">✗ Declined {fmtDate(detail.rejectedAt)}</li>}
                  </ul>
                </div>
              )}

              {/* Line items */}
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-3">Line Items</h3>
                <div className="border border-[color:var(--aw-border)] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-[color:var(--aw-surface-muted)]"><th className="text-left px-3 py-2 text-xs text-[color:var(--aw-text-muted)]">Description</th><th className="text-right px-3 py-2 text-xs text-[color:var(--aw-text-muted)]">Qty</th><th className="text-right px-3 py-2 text-xs text-[color:var(--aw-text-muted)]">Price</th><th className="text-right px-3 py-2 text-xs text-[color:var(--aw-text-muted)]">Total</th></tr></thead>
                    <tbody>
                      {parseItems(detail).map((li, i) => (
                        <tr key={i} className="border-t border-[color:var(--aw-border)]">
                          <td className="px-3 py-2">{li.description || '—'}</td>
                          <td className="px-3 py-2 text-right">{li.quantity}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(li.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtCurrency(li.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="space-y-2 text-sm">
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-2">Cost Breakdown</h3>
                {[
                  ['Materials', detail.materialsTotal],
                  ['Labor', detail.laborTotal],
                  ['Fitting Fee', detail.fittingFee],
                  ['Rush Fee', detail.rushFee],
                  ['Delivery Fee', detail.deliveryFee],
                ].filter(([, v]) => (v as number) > 0).map(([label, val]) => (
                  <div key={label as string} className="flex justify-between"><span className="text-[color:var(--aw-text-muted)]">{label as string}</span><span>{fmtCurrency(val as number)}</span></div>
                ))}
                {detail.discount > 0 && <div className="flex justify-between text-[color:var(--aw-danger)]"><span>Discount</span><span>-{fmtCurrency(detail.discount)}</span></div>}
                {detail.tax > 0 && <div className="flex justify-between"><span className="text-[color:var(--aw-text-muted)]">Tax</span><span>{fmtCurrency(detail.tax)}</span></div>}
                <div className="flex justify-between border-t border-[color:var(--aw-border)] pt-2 font-bold text-[color:var(--aw-text-strong)]"><span>Total</span><span>{fmtCurrency(detail.total)}</span></div>
              </div>

              {detail.notes && <div><h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-1">Notes</h3><p className="text-sm text-[color:var(--aw-text-muted)]">{detail.notes}</p></div>}
              {detail.terms && <div><h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-1">Terms</h3><p className="text-sm text-[color:var(--aw-text-muted)] whitespace-pre-line">{detail.terms}</p></div>}

              <div className="flex gap-3 pt-4 border-t border-[color:var(--aw-border)]">
                <button className="btn-primary text-sm px-5 py-2" onClick={() => editQuote(detail)}>Edit Quote</button>
                <button className="text-sm px-5 py-2 rounded-lg border border-[#C41E3A] text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger)]/5" onClick={() => remove(detail.id)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Create / Edit Modal ══ */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/20" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-3xl bg-[color:var(--aw-surface)] rounded-xl shadow-xl my-8">
            <div className="sticky top-0 bg-[color:var(--aw-surface)] rounded-t-xl border-b border-[color:var(--aw-border)] px-6 py-5 flex justify-between items-center z-10">
              <h2 className="text-lg font-bold text-[color:var(--aw-text-strong)]">{editing.id ? 'Edit Quote' : 'New Quote'}</h2>
              <button className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] text-2xl" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="p-6 space-y-6">
              {/* Client */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Client *</label>
                <select className="input-field text-base py-2.5 w-full" value={editing.clientId} onChange={(e) => setEditing({ ...editing, clientId: e.target.value })}>
                  <option value="">Select Client</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.clientId})</option>)}
                </select>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)]">Line Items</h3>
                  <button className="text-xs text-[color:var(--aw-text-strong)] font-semibold hover:underline" onClick={addLine}>+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {editing.lineItems.map((li, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <input className="input-field col-span-5 text-sm py-2" placeholder="Description" value={li.description} onChange={(e) => updateLine(i, 'description', e.target.value)} />
                      <input className="input-field col-span-2 text-sm py-2 text-right" type="number" placeholder="Qty" value={li.quantity || ''} onChange={(e) => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)} />
                      <input className="input-field col-span-2 text-sm py-2 text-right" type="number" placeholder="Price" value={li.unitPrice || ''} onChange={(e) => updateLine(i, 'unitPrice', parseFloat(e.target.value) || 0)} />
                      <div className="col-span-2 text-right text-sm font-semibold text-[color:var(--aw-text-strong)]">{fmtCurrency(li.quantity * li.unitPrice)}</div>
                      <button className="col-span-1 text-[color:var(--aw-danger)] text-xs hover:underline" onClick={() => removeLine(i)}>×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Costs */}
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-3">Additional Costs</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { key: 'materialsTotal', label: 'Materials' },
                    { key: 'laborTotal', label: 'Labor' },
                    { key: 'fittingFee', label: 'Fitting Fee' },
                    { key: 'rushFee', label: 'Rush Fee' },
                    { key: 'deliveryFee', label: 'Delivery Fee' },
                    { key: 'tax', label: 'Tax' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs text-[color:var(--aw-text-muted)] mb-1">{label}</label>
                      <input className="input-field text-sm py-2 w-full" type="number" value={(editing as unknown as Record<string, number>)[key] || ''} onChange={(e) => setEditing(recalcForm({ ...editing, [key]: parseFloat(e.target.value) || 0 }))} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Discount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[color:var(--aw-text-muted)] mb-1">Discount</label>
                  <input className="input-field text-sm py-2 w-full" type="number" value={editing.discount || ''} onChange={(e) => setEditing(recalcForm({ ...editing, discount: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="block text-xs text-[color:var(--aw-text-muted)] mb-1">Discount Type</label>
                  <select className="input-field text-sm py-2 w-full" value={editing.discountType} onChange={(e) => setEditing(recalcForm({ ...editing, discountType: e.target.value }))}>
                    <option value="fixed">Fixed ($)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
              </div>

              {/* Valid Until + Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[color:var(--aw-text-muted)] mb-1">Valid Until</label>
                  <input className="input-field text-sm py-2 w-full" type="date" value={editing.validUntil} onChange={(e) => setEditing({ ...editing, validUntil: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[color:var(--aw-text-muted)] mb-1">Notes</label>
                <textarea className="input-field text-sm py-2 w-full" rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-[color:var(--aw-text-muted)] mb-1">Terms &amp; Conditions</label>
                <textarea className="input-field text-sm py-2 w-full" rows={3} value={editing.terms} onChange={(e) => setEditing({ ...editing, terms: e.target.value })} />
              </div>

              {/* Total Preview */}
              <div className="bg-[color:var(--aw-surface-muted)] rounded-lg p-4 text-right">
                <span className="text-sm text-[color:var(--aw-text-muted)] mr-4">Total:</span>
                <span className="text-xl font-bold text-[color:var(--aw-text-strong)]">{fmtCurrency(editing.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0) + editing.materialsTotal + editing.laborTotal + editing.fittingFee + editing.rushFee + editing.deliveryFee - editing.discount + editing.tax)}</span>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-[color:var(--aw-border)]">
                <button className="text-sm px-5 py-2.5 rounded-lg border border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn-primary text-sm px-6 py-2.5" onClick={save} disabled={saving || !editing.clientId}>{saving ? 'Saving…' : editing.id ? 'Update Quote' : 'Create Quote'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
