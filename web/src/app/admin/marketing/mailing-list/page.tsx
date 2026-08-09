'use client';

import { useEffect, useState } from 'react';

interface Stats { customers: number; subscribers: number; total: number; optedOut: number }
interface Subscriber { id: string; email: string; name: string | null; source: string; status: string; createdAt: string }
interface Campaign {
  id: string; type: string; subject: string; audience: string; status: string;
  recipientCount: number; sentCount: number; failedCount: number; sentAt: string | null; createdAt: string;
}
interface ProductOption { id: string; name: string; isPublished: boolean }

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-[#D1FAE5] text-[#065F46]',
  sending: 'bg-[#FEF3C7] text-[#92400E]',
  failed: 'bg-[#FEE2E2] text-[#991B1B]',
  draft: 'bg-[#E5E7EB] text-[#374151]',
};

export default function MailingListPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Composer state
  const [audience, setAudience] = useState<'all' | 'customers' | 'subscribers'>('all');
  const [mode, setMode] = useState<'message' | 'product'>('message');
  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Shop now');
  const [productId, setProductId] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [mlRes, prodRes] = await Promise.all([
        fetch('/api/admin/mailing-list'),
        fetch('/api/admin/products?published=true'),
      ]);
      const ml = await mlRes.json();
      setStats(ml.stats || null);
      setSubscribers(ml.subscribers || []);
      setCampaigns(ml.campaigns || []);
      const prods = await prodRes.json().catch(() => []);
      setProducts(Array.isArray(prods) ? prods.map((p: ProductOption) => ({ id: p.id, name: p.name, isPublished: p.isPublished })) : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const audienceCount = stats
    ? audience === 'customers' ? stats.customers
      : audience === 'subscribers' ? stats.subscribers
        : stats.total
    : 0;

  async function send() {
    setResult(null);
    const label = mode === 'product'
      ? products.find((p) => p.id === productId)?.name || 'this product'
      : subject || 'this campaign';
    if (!confirm(`Send "${label}" to ${audienceCount} ${audienceCount === 1 ? 'person' : 'people'}? This cannot be undone.`)) return;

    setSending(true);
    try {
      const res = await fetch('/api/admin/mailing-list/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'product'
            ? { mode: 'product', audience, productId }
            : { mode: 'message', audience, subject, body: messageBody, ctaUrl, ctaLabel },
        ),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`✓ Sent to ${data.sent} of ${data.recipients}${data.failed ? ` (${data.failed} failed)` : ''}.`);
        setSubject(''); setMessageBody(''); setCtaUrl(''); setProductId('');
        load();
      } else {
        setResult(`✗ ${data.error || 'Failed to send.'}`);
      }
    } catch {
      setResult('✗ Something went wrong.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1B2A5B]">Mailing List</h1>
          <p className="text-sm text-[#8B7569] mt-1">Customers and newsletter sign-ups. Send new-arrival announcements and updates.</p>
        </div>
        <a
          href="/api/admin/mailing-list?export=csv"
          className="text-sm font-semibold rounded-lg border border-[#D1D5DB] px-4 py-2 text-[#1B2A5B] hover:bg-[#F9FAFB]"
        >Export CSV</a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total reach', value: stats?.total },
          { label: 'Customers', value: stats?.customers },
          { label: 'Subscribers', value: stats?.subscribers },
          { label: 'Unsubscribed', value: stats?.optedOut },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[#E5E7EB] bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-[#8B7569] mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-[#1B2A5B]">{loading ? '—' : s.value ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 mb-8">
        <h2 className="text-lg font-semibold text-[#1B2A5B] mb-4">Send a campaign</h2>

        <div className="flex flex-wrap gap-4 mb-4">
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wider text-[#8B7569] mb-1">Audience</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} className="rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm">
              <option value="all">Everyone ({stats?.total ?? 0})</option>
              <option value="customers">Customers only ({stats?.customers ?? 0})</option>
              <option value="subscribers">Subscribers only ({stats?.subscribers ?? 0})</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wider text-[#8B7569] mb-1">Type</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm">
              <option value="message">Written message</option>
              <option value="product">Announce a product</option>
            </select>
          </label>
        </div>

        {mode === 'message' ? (
          <div className="space-y-3">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm"
            />
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Write your message…"
              rows={6}
              className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-3">
              <input
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="Button link (optional) — e.g. https://www.awulak.com/collections"
                className="flex-1 min-w-[240px] rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm"
              />
              <input
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Button text"
                className="w-40 rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm"
              />
            </div>
          </div>
        ) : (
          <label className="text-sm block">
            <span className="block text-xs uppercase tracking-wider text-[#8B7569] mb-1">Product to announce</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm">
              <option value="">Select a published product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className="block text-xs text-[#8B7569] mt-2">Uses the product&apos;s photo, name, price and description in a &quot;New arrival&quot; email.</span>
          </label>
        )}

        <div className="flex items-center gap-4 mt-5">
          <button
            onClick={send}
            disabled={sending || audienceCount === 0}
            className="rounded-lg bg-[#1B2A5B] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#2D4A8C] transition-colors disabled:opacity-50"
          >
            {sending ? 'Sending…' : `Send to ${audienceCount}`}
          </button>
          {result && <span className="text-sm text-[#374151]">{result}</span>}
        </div>
      </div>

      {/* Recent campaigns */}
      <h2 className="text-lg font-semibold text-[#1B2A5B] mb-3">Recent campaigns</h2>
      {campaigns.length === 0 ? (
        <p className="text-sm text-[#8B7569] mb-8">No campaigns sent yet.</p>
      ) : (
        <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden mb-8 divide-y divide-[#F0EBE3]">
          {campaigns.map((c) => (
            <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#1B2A5B] truncate">{c.subject}</p>
                <p className="text-xs text-[#8B7569]">
                  {c.type === 'new_product' ? 'Product announcement' : 'Message'} · {c.audience} ·{' '}
                  {c.sentAt ? new Date(c.sentAt).toLocaleDateString() : new Date(c.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-[#374151]">{c.sentCount}/{c.recipientCount} sent</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${STATUS_COLORS[c.status] || STATUS_COLORS.draft}`}>{c.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent subscribers */}
      <h2 className="text-lg font-semibold text-[#1B2A5B] mb-3">Newsletter sign-ups</h2>
      {subscribers.length === 0 ? (
        <p className="text-sm text-[#8B7569]">No newsletter sign-ups yet.</p>
      ) : (
        <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden divide-y divide-[#F0EBE3]">
          {subscribers.map((s) => (
            <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#1B2A5B] truncate">{s.email}</p>
                <p className="text-xs text-[#8B7569]">{s.name || '—'} · via {s.source} · {new Date(s.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${s.status === 'subscribed' ? 'bg-[#D1FAE5] text-[#065F46]' : 'bg-[#FEE2E2] text-[#991B1B]'}`}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
