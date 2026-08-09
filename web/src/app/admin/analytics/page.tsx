'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icon, type IconName } from '@/components/admin';

/* ══════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════ */

interface Stats {
  orders: { total: number; pending: number; completed: number; revenue: number };
  customOrders: { total: number; inProduction: number; pipeline: Record<string, number> };
  rentals: { total: number; active: number; revenue: number };
  clients: { total: number; vip: number; newThisMonth: number };
  consultations: { total: number; scheduled: number; completed: number };
  inventory: { totalFabrics: number; lowStock: number };
  quotes: { total: number; pending: number; accepted: number; conversionRate: number };
  designers: { total: number; active: number; avgLoad: number };
  products: { total: number; published: number; featured: number };
}

const EMPTY_STATS: Stats = {
  orders: { total: 0, pending: 0, completed: 0, revenue: 0 },
  customOrders: { total: 0, inProduction: 0, pipeline: {} },
  rentals: { total: 0, active: 0, revenue: 0 },
  clients: { total: 0, vip: 0, newThisMonth: 0 },
  consultations: { total: 0, scheduled: 0, completed: 0 },
  inventory: { totalFabrics: 0, lowStock: 0 },
  quotes: { total: 0, pending: 0, accepted: 0, conversionRate: 0 },
  designers: { total: 0, active: 0, avgLoad: 0 },
  products: { total: 0, published: 0, featured: 0 },
};

type TimeRange = '7d' | '30d' | '90d' | 'all';

function fmtCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/* ══════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════ */

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stats?range=${timeRange}`);
      if (res.ok) {
        const data = await res.json();
        setStats({ ...EMPTY_STATS, ...data });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [timeRange]);

  useEffect(() => { load(); }, [load]);

  /* ── KPI Cards ── */
  const kpis: Array<{ label: string; value: string | number; detail: string; color: string; icon: IconName }> = [
    { label: 'Total Revenue', value: fmtCurrency(stats.orders.revenue + stats.rentals.revenue), detail: `${stats.orders.completed} orders completed`, color: 'var(--aw-success)', icon: 'dollar' },
    { label: 'Active Orders', value: stats.orders.pending + stats.customOrders.inProduction, detail: `${stats.customOrders.inProduction} in production`, color: 'var(--aw-navy)', icon: 'package' },
    { label: 'Clients', value: stats.clients.total, detail: `${stats.clients.vip} VIP · ${stats.clients.newThisMonth} new`, color: 'var(--aw-info)', icon: 'users' },
    { label: 'Consultations', value: stats.consultations.total, detail: `${stats.consultations.scheduled} upcoming`, color: 'var(--aw-warning)', icon: 'calendar' },
    { label: 'Quote Conversion', value: `${stats.quotes.conversionRate}%`, detail: `${stats.quotes.accepted} accepted of ${stats.quotes.total}`, color: 'var(--aw-info)', icon: 'analytics' },
    { label: 'Inventory Alerts', value: stats.inventory.lowStock, detail: `${stats.inventory.totalFabrics} fabric types`, color: stats.inventory.lowStock > 0 ? 'var(--aw-danger)' : 'var(--aw-success)', icon: 'alert' },
  ];

  /* ── Pipeline breakdown ── */
  const pipelineMax = Math.max(...Object.values(stats.customOrders.pipeline || {}), 1);

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Analytics</h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">Business performance overview</p>
        </div>
        <div className="flex gap-1 bg-[color:var(--aw-surface-muted)] rounded-[var(--aw-radius-md)] p-1">
          {([['7d', '7 Days'], ['30d', '30 Days'], ['90d', '90 Days'], ['all', 'All Time']] as [TimeRange, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`aw-focus px-3 py-1.5 rounded-[var(--aw-radius-sm)] text-xs font-medium transition-colors ${timeRange === key ? 'bg-[color:var(--aw-surface)] text-[color:var(--aw-text-strong)] shadow-[var(--aw-shadow-sm)]' : 'text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'}`}
              onClick={() => setTimeRange(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner mx-auto mt-12" />
      ) : (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {kpis.map((k) => (
              <div key={k.label} className="bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] border border-[color:var(--aw-border)] shadow-[var(--aw-shadow-sm)] p-5 hover:shadow-[var(--aw-shadow-md)] transition-shadow">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <span className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)]">{k.label}</span>
                  <span
                    className="w-9 h-9 rounded-[var(--aw-radius-md)] flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${k.color} 12%, transparent)`, color: k.color }}
                  >
                    <Icon name={k.icon} className="w-5 h-5" />
                  </span>
                </div>
                <p className="text-3xl font-bold mb-1" style={{ color: k.color }}>{k.value}</p>
                <p className="text-xs text-[color:var(--aw-text-muted)]">{k.detail}</p>
              </div>
            ))}
          </div>

          {/* Two column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Custom Order Pipeline */}
            <div className="bg-[color:var(--aw-surface)] rounded-lg border border-[color:var(--aw-border)] p-6">
              <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-4">Custom Order Pipeline</h3>
              {Object.keys(stats.customOrders.pipeline || {}).length === 0 ? (
                <p className="text-sm text-[color:var(--aw-text-muted)]">No custom orders data</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.customOrders.pipeline).map(([stage, count]) => (
                    <div key={stage}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[color:var(--aw-text-muted)]">{stage.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</span>
                        <span className="font-semibold text-[color:var(--aw-text-strong)]">{count}</span>
                      </div>
                      <div className="w-full h-2 bg-[color:var(--aw-cream)] rounded-full overflow-hidden">
                        <div className="h-full bg-[color:var(--aw-navy)] rounded-full transition-all" style={{ width: `${(count / pipelineMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Revenue Breakdown */}
            <div className="bg-[color:var(--aw-surface)] rounded-lg border border-[color:var(--aw-border)] p-6">
              <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-4">Revenue Sources</h3>
              <div className="space-y-4">
                {[
                  { label: 'Orders', value: stats.orders.revenue, color: '#1B2A5B' },
                  { label: 'Rentals', value: stats.rentals.revenue, color: '#8B5CF6' },
                ].map((s) => {
                  const total = stats.orders.revenue + stats.rentals.revenue || 1;
                  const pct = Math.round((s.value / total) * 100);
                  return (
                    <div key={s.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-[color:var(--aw-text-muted)]">{s.label}</span>
                        <span className="font-semibold" style={{ color: s.color }}>{fmtCurrency(s.value)} ({pct}%)</span>
                      </div>
                      <div className="w-full h-3 bg-[color:var(--aw-cream)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Product Stats */}
            <div className="bg-[color:var(--aw-surface)] rounded-lg border border-[color:var(--aw-border)] p-6">
              <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-4">Products</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: 'Total', value: stats.products.total, color: '#1B2A5B' },
                  { label: 'Published', value: stats.products.published, color: '#22C55E' },
                  { label: 'Featured', value: stats.products.featured, color: '#F59E0B' },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Designer Performance */}
            <div className="bg-[color:var(--aw-surface)] rounded-lg border border-[color:var(--aw-border)] p-6">
              <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-4">Designer Team</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: 'Total', value: stats.designers.total, color: '#1B2A5B' },
                  { label: 'Active', value: stats.designers.active, color: '#22C55E' },
                  { label: 'Avg Load', value: `${stats.designers.avgLoad}%`, color: '#F59E0B' },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
