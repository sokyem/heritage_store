'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import {
  AdminErrorBanner,
  AdminPageHeader,
  SkeletonRow,
  buildCrumbs,
} from '@/components/admin';

const METHODS = ['Cash', 'Zelle', 'CashApp', 'Apple Pay', 'Bank Transfer'];
const TYPES = ['Deposit', 'Balance', 'Full Payment', 'Adjustment'];

interface Payment {
  id: string;
  paymentId: string;
  orderId: string;
  client: string;
  amount: number | null;
  method: string | null;
  date: string | null;
  paymentType: string | null;
  notes: string | null;
  order: { orderId: string; item: string; totalPrice: number | null; balance: number | null } | null;
}

interface Order {
  id: string;
  orderId: string;
  item: string;
  client: { name: string; clientId: string } | null;
  balance: number | null;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ orderId: '', amount: 0, method: 'Cash', paymentType: 'Deposit', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pRes, oRes] = await Promise.all([
        fetch('/api/admin/payments'),
        fetch('/api/admin/orders'),
      ]);
      if (!pRes.ok) {
        const err = await pRes.json().catch(() => null);
        throw new Error(err?.error || `Payments failed (${pRes.status})`);
      }
      if (!oRes.ok) {
        const err = await oRes.json().catch(() => null);
        throw new Error(err?.error || `Orders failed (${oRes.status})`);
      }
      const [p, o] = await Promise.all([pRes.json(), oRes.json()]);
      setPayments(Array.isArray(p) ? p : []);
      setOrders(Array.isArray(o) ? o : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function recordPayment() {
    if (!form.orderId || !form.amount) return;
    setSaving(true);
    const order = orders.find((o) => o.orderId === form.orderId);
    await fetch('/api/admin/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, client: order?.client?.name || '' }),
    });
    setSaving(false);
    setAdding(false);
    setForm({ orderId: '', amount: 0, method: 'Cash', paymentType: 'Deposit', notes: '' });
    load();
  }

  const totalCollected = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const pathname = usePathname();

  return (
    <div>
      <AdminPageHeader
        title="Payments"
        subtitle={`${payments.length} records · $${totalCollected.toLocaleString()} collected`}
        breadcrumbs={buildCrumbs(pathname || '/admin/payments')}
      >
        <button
          className="aw-focus inline-flex items-center gap-2 px-4 py-2 rounded-[var(--aw-radius-md)] bg-[color:var(--aw-navy)] text-white text-sm font-semibold hover:bg-[color:var(--aw-navy-dark)] transition-colors shadow-[var(--aw-shadow-sm)]"
          onClick={() => setAdding(true)}
        >
          + Record Payment
        </button>
      </AdminPageHeader>

      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        <AdminErrorBanner message={loadError} onRetry={load} />

        <div className="bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] shadow-[var(--aw-shadow-sm)] border border-[color:var(--aw-border)] overflow-x-auto">
          <table className="w-full min-w-[800px] aw-table-hover">
            <thead>
              <tr className="border-b border-[color:var(--aw-border)] bg-[color:var(--aw-surface-muted)]">
                {['ID', 'Order', 'Client', 'Amount', 'Method', 'Type', 'Date', 'Notes'].map((h) => (
                  <th key={h} className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRow cols={8} count={6} cellPadding="px-4 py-4" />
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-base text-[color:var(--aw-text-muted)]">
                    No manual payment records yet. Stripe/PayPal payments appear in Finance Overview.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-b border-[color:var(--aw-border)] last:border-0">
                    <td className="px-4 py-4 text-[15px] font-semibold text-[color:var(--aw-text-strong)]">{p.paymentId}</td>
                    <td className="px-4 py-4 text-[15px]">{p.order?.orderId || p.orderId}</td>
                    <td className="px-4 py-4 text-[15px]">{p.client}</td>
                    <td className="px-4 py-4 text-[15px] text-[color:var(--aw-success)] font-semibold">{p.amount != null ? `$${p.amount}` : '—'}</td>
                    <td className="px-4 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{p.method || '—'}</td>
                    <td className="px-4 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{p.paymentType || '—'}</td>
                    <td className="px-4 py-4 text-sm text-[color:var(--aw-text-muted)]">{p.date ? new Date(p.date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-4 text-sm text-[color:var(--aw-text-muted)]">{p.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      {/* Record Payment Modal */}
      {adding && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-xl p-7 w-full max-w-lg mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-5">Record Payment</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Order</label>
                <select className="input-field text-base py-2.5" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}>
                  <option value="">Select order...</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.orderId}>
                      {o.orderId} — {o.client?.name} — ${o.balance ?? 0} due
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Amount ($)</label>
                <input
                  className="input-field text-base py-2.5"
                  type="number"
                  value={form.amount || ''}
                  onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Method</label>
                  <select className="input-field text-base py-2.5" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                    {METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Type</label>
                  <select className="input-field text-base py-2.5" value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value })}>
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Notes</label>
                <textarea className="input-field text-base py-2.5" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-outline text-base px-5 py-2.5" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn-primary text-base px-5 py-2.5" onClick={recordPayment} disabled={saving || !form.orderId || !form.amount}>
                {saving ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
