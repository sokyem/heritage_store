'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminErrorBanner } from '@/components/admin/AdminErrorBanner';
import { Icon, type IconName } from '@/components/admin';

type Range = 'day' | 'week' | 'month';

interface ClientLite { id: string; name: string | null; email: string | null; createdAt: string; vipTier?: string | null }
interface OrderLite { id: string; orderId: string; item?: string | null; status: string; totalPrice?: number | null; totalPaid?: number | null; createdAt: string; client: { name: string | null; email: string | null } | null }
interface CustomOrderLite { id: string; orderId: string; status: string; totalPrice?: number | null; createdAt: string; client: { name: string | null; email: string | null } | null }
interface ConsultLite { id: string; scheduledDate: string | null; scheduledTime: string | null; status: string; purpose?: string | null; createdAt: string; client: { name: string | null; email: string | null } | null }
interface ActivityLite { id: string; action: string; description: string; createdAt: string; performedBy?: string | null }

interface SnapshotData {
  range: Range;
  since: string;
  now: string;
  counts: {
    newClients: number;
    newAdminOrders: number;
    newCustomOrders: number;
    newRentals: number;
    newConsultations: number;
    newQuotes: number;
    newPayments: number;
    revenue: number;
    newActivity: number;
    newReturns: number;
    newConversationsWithMessages: number;
  };
  lists: {
    newClients: ClientLite[];
    newAdminOrders: OrderLite[];
    newCustomOrders: CustomOrderLite[];
    newConsultations: ConsultLite[];
    recentActivity: ActivityLite[];
  };
}

const RANGE_LABEL: Record<Range, string> = { day: 'Today', week: 'Last 7 days', month: 'Last 30 days' };

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtMoney(n: number) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function AdminSnapshotPage() {
  const [range, setRange] = useState<Range>('day');
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/snapshot?range=${range}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error || `Snapshot failed (${r.status})`);
        }
        return r.json();
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load snapshot'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const c = data?.counts;

  return (
    <div className="p-6 lg:p-10 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)]">Activity Snapshot</h1>
          <p className="text-sm text-[color:var(--aw-text-muted)] mt-1">
            Everything that happened on the site for the selected window — signups, orders, consultations, payments, and more.
          </p>
        </div>
        <div className="inline-flex rounded-[var(--aw-radius-md)] border border-[color:var(--aw-border-strong)] bg-[color:var(--aw-surface)] overflow-hidden shadow-[var(--aw-shadow-sm)]">
          {(['day', 'week', 'month'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`aw-focus px-4 py-2 text-sm font-semibold transition-colors ${range === r ? 'bg-[color:var(--aw-navy)] text-white' : 'text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-surface-muted)]'}`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      <AdminErrorBanner message={error} onRetry={() => setRange((r) => r)} />

      {loading ? (
        <div className="p-12 text-center text-[color:var(--aw-text-muted)]">Loading snapshot…</div>
      ) : !data || !c ? (
        <div className="p-12 text-center text-[color:var(--aw-text-muted)]">No snapshot data.</div>
      ) : (
        <>
          {/* Counter cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-8">
            <Stat label="New signups" value={c.newClients} icon="users" tint="var(--aw-info)" href="/admin/clients" />
            <Stat label="New orders" value={c.newAdminOrders} icon="package" tint="var(--aw-navy)" href="/admin/orders" />
            <Stat label="Custom requests" value={c.newCustomOrders} icon="custom" tint="var(--aw-warning)" href="/admin/orders/custom" />
            <Stat label="Consultations booked" value={c.newConsultations} icon="calendar" tint="var(--aw-success)" href="/admin/scheduling" />
            <Stat label="Payments" value={c.newPayments} icon="dollar" tint="var(--aw-success)" href="/admin/payments" sub={fmtMoney(c.revenue)} />
            <Stat label="Active threads" value={c.newConversationsWithMessages} icon="mail" tint={c.newConversationsWithMessages > 0 ? 'var(--aw-navy)' : 'var(--aw-text-faint)'} href="/admin/inbox" />
            <Stat label="Returns" value={c.newReturns} icon="returns" tint={c.newReturns > 0 ? 'var(--aw-danger)' : 'var(--aw-text-faint)'} href="/admin/returns" />
          </div>

          {/* Detail panels */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <Panel title="New signups" empty={data.lists.newClients.length === 0 ? 'No new signups in this window.' : undefined} href="/admin/clients">
              {data.lists.newClients.map((u) => (
                <Row key={u.id} title={u.name || u.email || 'Anonymous'} subtitle={u.email || ''} time={fmtTime(u.createdAt)} tag={u.vipTier && u.vipTier !== 'standard' ? u.vipTier.toUpperCase() : undefined} />
              ))}
            </Panel>

            <Panel title="New orders" empty={data.lists.newAdminOrders.length === 0 ? 'No new orders in this window.' : undefined} href="/admin/orders">
              {data.lists.newAdminOrders.map((o) => (
                <Row
                  key={o.id}
                  title={o.item || o.orderId}
                  subtitle={`${o.client?.name || o.client?.email || 'Guest'} · ${o.status}`}
                  time={fmtTime(o.createdAt)}
                  right={o.totalPrice ? fmtMoney(o.totalPrice) : ''}
                />
              ))}
            </Panel>

            <Panel title="Custom requests" empty={data.lists.newCustomOrders.length === 0 ? 'No custom requests in this window.' : undefined} href="/admin/orders/custom">
              {data.lists.newCustomOrders.map((o) => (
                <Row
                  key={o.id}
                  title={o.orderId}
                  subtitle={`${o.client?.name || o.client?.email || 'Guest'} · ${o.status.replace(/_/g, ' ')}`}
                  time={fmtTime(o.createdAt)}
                  right={o.totalPrice ? fmtMoney(o.totalPrice) : ''}
                />
              ))}
            </Panel>

            <Panel title="Consultations booked" empty={data.lists.newConsultations.length === 0 ? 'No consultations booked in this window.' : undefined} href="/admin/scheduling">
              {data.lists.newConsultations.map((c) => (
                <Row
                  key={c.id}
                  title={c.client?.name || c.client?.email || 'Guest'}
                  subtitle={`${c.purpose || 'Consultation'}${c.scheduledDate ? ` · ${new Date(c.scheduledDate).toLocaleDateString()}${c.scheduledTime ? ' ' + c.scheduledTime : ''}` : ''}`}
                  time={fmtTime(c.createdAt)}
                  tag={c.status}
                />
              ))}
            </Panel>
          </div>

          <Panel title="Recent activity feed" empty={data.lists.recentActivity.length === 0 ? 'No activity recorded.' : undefined}>
            {data.lists.recentActivity.map((a) => (
              <Row
                key={a.id}
                title={a.description}
                subtitle={`${a.action.replace(/_/g, ' ')}${a.performedBy ? ' · ' + a.performedBy : ''}`}
                time={fmtTime(a.createdAt)}
              />
            ))}
          </Panel>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon, tint, href, sub }: { label: string; value: number; icon: IconName; tint: string; href?: string; sub?: string }) {
  const inner = (
    <div className="aw-focus bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] p-4 shadow-[var(--aw-shadow-sm)] border border-[color:var(--aw-border)] hover:shadow-[var(--aw-shadow-md)] transition-shadow h-full">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)]">{label}</span>
        <span
          className="w-7 h-7 rounded-[var(--aw-radius-md)] flex items-center justify-center shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)`, color: tint }}
        >
          <Icon name={icon} className="w-4 h-4" />
        </span>
      </div>
      <div className="text-3xl font-semibold" style={{ color: tint }}>{value}</div>
      {sub && <div className="text-xs text-[color:var(--aw-text-muted)] mt-1">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Panel({ title, children, empty, href }: { title: string; children: React.ReactNode; empty?: string; href?: string }) {
  return (
    <div className="bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] shadow-[var(--aw-shadow-sm)] border border-[color:var(--aw-border)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--aw-border)]">
        <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{title}</h3>
        {href && (
          <Link href={href} className="text-xs text-[color:var(--aw-text-strong)] hover:underline inline-flex items-center gap-1">
            View all <Icon name="chevronRight" className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="divide-y divide-[color:var(--aw-border)]">
        {empty ? <div className="px-5 py-6 text-sm text-[color:var(--aw-text-muted)]">{empty}</div> : children}
      </div>
    </div>
  );
}

function Row({ title, subtitle, time, right, tag }: { title: string; subtitle?: string; time?: string; right?: string; tag?: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[color:var(--aw-text-strong)] truncate">{title}</div>
        {subtitle && <div className="text-xs text-[color:var(--aw-text-muted)] truncate mt-0.5">{subtitle}</div>}
      </div>
      <div className="flex flex-col items-end gap-1 text-right">
        {right && <span className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{right}</span>}
        {tag && <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-[var(--aw-radius-pill)] bg-[color:var(--aw-surface-muted)] text-[color:var(--aw-text-muted)]">{tag}</span>}
        {time && <span className="text-[11px] text-[color:var(--aw-text-faint)]">{time}</span>}
      </div>
    </div>
  );
}
