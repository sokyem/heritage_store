'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface UnifiedPayment {
  id: string;
  source: 'stripe' | 'paypal' | 'manual';
  amount: number;
  currency: string;
  status: string;
  method: string;
  customerName: string | null;
  customerEmail: string | null;
  orderRef: string | null;
  description: string | null;
  createdAt: string;
}

interface FinanceResponse {
  range: { from: string; to: string };
  source: string;
  totals: {
    grossRevenue: number;
    refunds: number;
    netRevenue: number;
    transactionCount: number;
    bySource: { stripe: number; paypal: number; manual: number };
  };
  payments: UnifiedPayment[];
}

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isoToInput(iso: string) {
  return iso.slice(0, 10);
}

function defaultFromIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

const SOURCE_STYLES: Record<UnifiedPayment['source'], string> = {
  stripe: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  paypal: 'bg-blue-50 text-blue-700 border-blue-200',
  manual: 'bg-amber-50 text-amber-700 border-amber-200',
};

const STATUS_STYLES: Record<string, string> = {
  succeeded: 'bg-green-50 text-green-700 border-green-200',
  paid: 'bg-green-50 text-green-700 border-green-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-gray-100 text-gray-700 border-gray-200',
  partially_refunded: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function FinancePage() {
  const [from, setFrom] = useState(defaultFromIso());
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<'all' | 'stripe' | 'paypal' | 'manual'>('all');
  const [data, setData] = useState<FinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from, to, source });
      const res = await fetch(`/api/admin/finance?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load finance data');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [from, to, source]);

  useEffect(() => { load(); }, [load]);

  const totals = data?.totals;

  const visiblePayments = useMemo(() => data?.payments ?? [], [data]);

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            Finance Overview
          </h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">
            Every Stripe, PayPal, and manual payment in one place.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[color:var(--aw-surface)] rounded-lg border border-[color:var(--aw-border)] shadow-sm p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">From</label>
          <input type="date" className="input-field text-sm py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">To</label>
          <input type="date" className="input-field text-sm py-2" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">Source</label>
          <select
            className="input-field text-sm py-2"
            value={source}
            onChange={(e) => setSource(e.target.value as 'all' | 'stripe' | 'paypal' | 'manual')}
          >
            <option value="all">All sources</option>
            <option value="stripe">Stripe (card)</option>
            <option value="paypal">PayPal</option>
            <option value="manual">Manual (Cash / Zelle / etc.)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">{error}</div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card label="Net Revenue" value={totals ? fmtUsd(totals.netRevenue) : '—'} accent="var(--aw-navy)" />
        <Card label="Gross Revenue" value={totals ? fmtUsd(totals.grossRevenue) : '—'} accent="var(--aw-success)" />
        <Card label="Refunds" value={totals ? fmtUsd(totals.refunds) : '—'} accent="var(--aw-danger)" />
        <Card label="Transactions" value={totals ? String(totals.transactionCount) : '—'} accent="var(--aw-text-muted)" />
      </div>

      {/* By source */}
      {totals && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <SmallCard label="Stripe" value={fmtUsd(totals.bySource.stripe)} accent="#6366F1" />
          <SmallCard label="PayPal" value={fmtUsd(totals.bySource.paypal)} accent="#3B82F6" />
          <SmallCard label="Manual" value={fmtUsd(totals.bySource.manual)} accent="var(--aw-warning)" />
        </div>
      )}

      {/* Table */}
      <div className="bg-[color:var(--aw-surface)] rounded-lg border border-[color:var(--aw-border)] shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E8E3DB] bg-[color:var(--aw-surface-muted)]">
              {['Date', 'Source', 'Customer', 'Method', 'Status', 'Description', 'Amount'].map((h) => (
                <th key={h} className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[color:var(--aw-text-muted)]">Loading…</td></tr>
            ) : visiblePayments.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[color:var(--aw-text-muted)]">No payments in this window.</td></tr>
            ) : (
              visiblePayments.map((p) => (
                <tr key={p.id} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-surface-muted)] transition-colors">
                  <td className="px-4 py-3 text-xs text-[color:var(--aw-text-muted)]">{new Date(p.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded border capitalize ${SOURCE_STYLES[p.source]}`}>
                      {p.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {p.customerName ? (
                      <>
                        <p className="text-[color:var(--aw-text-strong)] font-medium">{p.customerName}</p>
                        {p.customerEmail && <p className="text-xs text-[color:var(--aw-text-muted)]">{p.customerEmail}</p>}
                      </>
                    ) : <span className="text-[color:var(--aw-text-faint)]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#2D2D2D] capitalize">{p.method}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLES[p.status] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                      {p.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[color:var(--aw-text-muted)] max-w-xs truncate" title={p.description || ''}>
                    {p.description || (p.orderRef ? `Order ${p.orderRef.slice(-6)}` : '—')}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-[color:var(--aw-text-strong)] text-right">
                    {fmtUsd(p.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-[color:var(--aw-surface)] rounded-lg border border-[color:var(--aw-border)] shadow-sm p-5">
      <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1.5">{label}</p>
      <p className="text-2xl font-semibold" style={{ color: accent, fontFamily: 'var(--font-heading)' }}>{value}</p>
    </div>
  );
}

function SmallCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-[color:var(--aw-surface)] rounded-lg border border-[color:var(--aw-border)] shadow-sm p-4">
      <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">{label}</p>
      <p className="text-lg font-semibold" style={{ color: accent }}>{value}</p>
    </div>
  );
}
