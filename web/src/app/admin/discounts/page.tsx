'use client';

import { useCallback, useEffect, useState } from 'react';
import { PaginationFooter } from '@/components/admin';
import Link from 'next/link';
import { DISCOUNT_TYPE_LABELS, type DiscountType } from '@/lib/discounts';

interface Discount {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  enabled: boolean;
  usageCount: number;
  usageLimit: number | null;
  endsAt: string | null;
  description: string | null;
}

type DiscountSortColumn = 'createdAt' | 'code' | 'value' | 'enabled' | 'endsAt';

export default function DiscountsPage() {
  const [items, setItems] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [type, setType] = useState<DiscountType>('percent');
  const [value, setValue] = useState('10');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Search + pagination + sort
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<DiscountSortColumn>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortDir,
    });
    if (search.trim()) params.set('search', search.trim());
    const r = await fetch(`/api/admin/discounts?${params.toString()}`);
    const d = await r.json();
    setItems(d.items ?? []);
    setTotal(typeof d.total === 'number' ? d.total : (d.items?.length || 0));
    setTotalPages(typeof d.totalPages === 'number' ? d.totalPages : 1);
    setLoading(false);
  }, [page, pageSize, sortBy, sortDir, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  function toggleSort(col: DiscountSortColumn) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'createdAt' || col === 'value' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  async function create() {
    setCreating(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, type, value: Number(value), enabled: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCode('');
      setValue(type === 'percent' ? '10' : '25');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold mb-6" style={{ fontFamily: 'var(--font-heading)' }}>
        Discounts
      </h1>

      <section className="bg-white border border-[var(--aw-border-strong)] p-5 mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-[var(--aw-navy)]">
          Create a discount
        </h2>
        {err && <div className="bg-red-50 text-red-900 p-2 text-sm mb-3">{err}</div>}
        <div className="flex flex-wrap gap-2 items-end">
          <label>
            <span className="text-xs block mb-1">Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WELCOME10"
              className="border border-[var(--aw-border-strong)] px-3 py-2 text-sm font-mono"
            />
          </label>
          <label>
            <span className="text-xs block mb-1">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DiscountType)}
              className="border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
            >
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off</option>
              <option value="free_shipping">Free shipping</option>
            </select>
          </label>
          {type !== 'free_shipping' && (
            <label>
              <span className="text-xs block mb-1">
                Value {type === 'percent' ? '(%)' : '($)'}
              </span>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="border border-[var(--aw-border-strong)] px-3 py-2 text-sm w-24"
              />
            </label>
          )}
          <button
            onClick={create}
            disabled={creating || !code}
            className="px-4 py-2 text-sm bg-[var(--aw-navy)] text-white disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </section>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by code or description…"
        className="border border-[var(--aw-border-strong)] px-3 py-2 text-sm w-full max-w-md mb-4"
      />

      <div className="bg-white border border-[var(--aw-border-strong)] overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-[var(--aw-text-light)]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-sm text-[var(--aw-text-light)]">No discounts yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--aw-cream)] text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">
                  <button type="button" onClick={() => toggleSort('code')} className="inline-flex items-center gap-1 hover:text-[var(--aw-navy)]">
                    Code
                    {sortBy === 'code' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">
                  <button type="button" onClick={() => toggleSort('value')} className="inline-flex items-center gap-1 hover:text-[var(--aw-navy)]">
                    Value
                    {sortBy === 'value' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-left px-4 py-2">Usage</th>
                <th className="text-left px-4 py-2">
                  <button type="button" onClick={() => toggleSort('endsAt')} className="inline-flex items-center gap-1 hover:text-[var(--aw-navy)]">
                    Expires
                    {sortBy === 'endsAt' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="text-left px-4 py-2">
                  <button type="button" onClick={() => toggleSort('enabled')} className="inline-flex items-center gap-1 hover:text-[var(--aw-navy)]">
                    Status
                    {sortBy === 'enabled' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-t border-[var(--aw-border)]">
                  <td className="px-4 py-2 font-mono">{d.code}</td>
                  <td className="px-4 py-2 text-xs">{DISCOUNT_TYPE_LABELS[d.type]}</td>
                  <td className="px-4 py-2 text-xs">
                    {d.type === 'percent'
                      ? `${d.value}%`
                      : d.type === 'fixed'
                      ? `$${d.value.toFixed(2)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {d.usageCount}
                    {d.usageLimit ? ` / ${d.usageLimit}` : ''}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {d.endsAt ? new Date(d.endsAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {d.enabled ? (
                      <span className="text-green-700">Active</span>
                    ) : (
                      <span className="text-[var(--aw-text-light)]">Disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/admin/discounts/${d.id}`}
                      className="text-xs text-[var(--aw-navy)] underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PaginationFooter
        page={page}
        totalPages={totalPages}
        total={total}
        label="discount"
        onPageChange={setPage}
        loading={loading}
      />
    </div>
  );
}
