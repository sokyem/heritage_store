'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DISCOUNT_TYPES, type DiscountType } from '@/lib/discounts';

interface Discount {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  minSubtotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usageCount: number;
  enabled: boolean;
  description: string | null;
  redemptions?: { id: string; customerEmail: string | null; amountOff: number; createdAt: string }[];
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export default function EditDiscount({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Discount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/discounts/${id}`)
      .then((r) => r.json())
      .then((data) => setD(data.item))
      .finally(() => setLoading(false));
  }, [id]);

  function update<K extends keyof Discount>(k: K, v: Discount[K]) {
    setD((s) => (s ? { ...s, [k]: v } : s));
  }

  async function save() {
    if (!d) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/discounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: d.code,
          type: d.type,
          value: d.value,
          minSubtotal: d.minSubtotal,
          startsAt: d.startsAt ? new Date(d.startsAt).toISOString() : null,
          endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
          usageLimit: d.usageLimit,
          perCustomerLimit: d.perCustomerLimit,
          enabled: d.enabled,
          description: d.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setMsg({ type: 'ok', text: 'Saved.' });
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this discount? Redemption history will also be removed.')) return;
    const res = await fetch(`/api/admin/discounts/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/admin/discounts');
  }

  if (loading) return <div className="p-8 text-sm">Loading…</div>;
  if (!d) return <div className="p-8 text-sm text-red-700">Not found</div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link href="/admin/discounts" className="text-xs text-[var(--aw-text-light)] underline">
        ← All discounts
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-6" style={{ fontFamily: 'var(--font-heading)' }}>
        {d.code}
      </h1>

      {msg && (
        <div
          className={`p-3 text-sm mb-4 ${
            msg.type === 'ok' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="bg-white border border-[var(--aw-border-strong)] p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs block mb-1">Code</span>
            <input
              value={d.code}
              onChange={(e) => update('code', e.target.value.toUpperCase())}
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block">
            <span className="text-xs block mb-1">Type</span>
            <select
              value={d.type}
              onChange={(e) => update('type', e.target.value as DiscountType)}
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
            >
              {DISCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {d.type !== 'free_shipping' && (
            <label className="block">
              <span className="text-xs block mb-1">
                Value {d.type === 'percent' ? '(%)' : '($)'}
              </span>
              <input
                type="number"
                value={d.value}
                onChange={(e) => update('value', Number(e.target.value))}
                className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
              />
            </label>
          )}
          <label className="block">
            <span className="text-xs block mb-1">Minimum subtotal ($)</span>
            <input
              type="number"
              value={d.minSubtotal ?? ''}
              onChange={(e) =>
                update('minSubtotal', e.target.value === '' ? null : Number(e.target.value))
              }
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs block mb-1">Starts at</span>
            <input
              type="datetime-local"
              value={toLocalInput(d.startsAt)}
              onChange={(e) =>
                update('startsAt', e.target.value ? new Date(e.target.value).toISOString() : null)
              }
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs block mb-1">Expires at</span>
            <input
              type="datetime-local"
              value={toLocalInput(d.endsAt)}
              onChange={(e) =>
                update('endsAt', e.target.value ? new Date(e.target.value).toISOString() : null)
              }
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs block mb-1">Total usage limit</span>
            <input
              type="number"
              value={d.usageLimit ?? ''}
              onChange={(e) =>
                update('usageLimit', e.target.value === '' ? null : Number(e.target.value))
              }
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs block mb-1">Per-customer limit</span>
            <input
              type="number"
              value={d.perCustomerLimit ?? ''}
              onChange={(e) =>
                update(
                  'perCustomerLimit',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs block mb-1">Description (internal)</span>
          <textarea
            value={d.description ?? ''}
            onChange={(e) => update('description', e.target.value)}
            rows={2}
            className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
          />
          Enabled
        </label>

        <div className="text-xs text-[var(--aw-text-light)]">
          Used {d.usageCount} time{d.usageCount === 1 ? '' : 's'} so far.
        </div>

        <div className="flex gap-2 pt-2 border-t border-[var(--aw-border)]">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-[var(--aw-navy)] text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={remove}
            className="px-4 py-2 text-sm border border-red-300 text-red-700 ml-auto"
          >
            Delete
          </button>
        </div>
      </div>

      {d.redemptions && d.redemptions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-[var(--aw-navy)]">
            Recent redemptions
          </h2>
          <div className="bg-white border border-[var(--aw-border-strong)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--aw-cream)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Customer</th>
                  <th className="text-left px-4 py-2">Amount off</th>
                  <th className="text-left px-4 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {d.redemptions.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--aw-border)]">
                    <td className="px-4 py-2 text-xs">{r.customerEmail ?? '—'}</td>
                    <td className="px-4 py-2 text-xs">${r.amountOff.toFixed(2)}</td>
                    <td className="px-4 py-2 text-xs">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
