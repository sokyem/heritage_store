'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon, SkeletonStat, SkeletonBlock, type IconName } from '@/components/admin';

// ─── Types ───────────────────────────────────────────────────────

interface PipelineStage {
  label: string;
  count: number;
}

interface ScheduleItem {
  id: string;
  consultId?: string;
  orderId?: string | null;
  clientName: string;
  type: string;
  purpose?: string;
  scheduledDate: string;
  scheduledTime: string | null;
  status: string;
}

interface DesignerItem {
  id: string;
  designerId: string;
  name: string;
  specialty: string | null;
  currentLoad: number;
  maxCapacity: number;
  rating: number;
  completedOrders: number;
  status: string;
}

interface ActivityItem {
  id: string;
  action: string;
  description: string;
  orderId: string | null;
  performedBy: string | null;
  createdAt: string;
}

interface AlertItem {
  type: string;
  message: string;
  severity: 'warning' | 'info' | 'urgent';
}

interface UnifiedRecentOrder {
  id: string;
  ref: string;
  type: 'storefront' | 'studio' | 'custom';
  customer: string;
  summary: string;
  status: string;
  amount: number;
  updatedAt: string;
  href: string;
}

interface DashboardStats {
  revenue: number;
  revenueByType?: {
    storefront: number;
    studio: number;
    custom: number;
  };
  activeOrders: number;
  activeOrdersByType?: {
    storefront: number;
    studio: number;
    custom: number;
  };
  pendingCustom: number;
  todayConsultations: number;
  lowStockCount: number;
  recentOrders: UnifiedRecentOrder[];
  customOrdersByStatus: Record<string, number>;
  pipeline: PipelineStage[];
  upcomingConsultations: ScheduleItem[];
  upcomingFittings: ScheduleItem[];
  topDesigners: DesignerItem[];
  recentActivity: ActivityItem[];
  alerts: AlertItem[];
  storefront?: {
    total: number;
    active?: number;
    unfulfilled: number;
    inTransit: number;
    revenue: number;
  };
}

const ORDER_TYPE_STYLES: Record<UnifiedRecentOrder['type'], { label: string; bg: string; fg: string }> = {
  storefront: { label: 'Storefront', bg: '#E0F2FE', fg: '#0369A1' },
  studio:     { label: 'Studio',     bg: '#FEF3C7', fg: '#92400E' },
  custom:     { label: 'Custom',     bg: '#EDE9FE', fg: '#5B21B6' },
};

// ─── Constants ───────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, IconName> = {
  status_change: 'refresh',
  note_added: 'edit',
  payment_received: 'dollar',
  designer_assigned: 'designer',
  fitting_scheduled: 'fitting',
};

const SEVERITY_BORDER: Record<string, string> = {
  urgent: 'var(--aw-danger)',
  warning: 'var(--aw-warning)',
  info: 'var(--aw-info)',
};

// ─── Helpers ─────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatCurrency(amount: number | null | undefined): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Skeleton primitives now come from '@/components/admin' so the shimmer
// animation matches every other admin page.

// ─── Dashboard Component ─────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = () => {
      fetch('/api/admin/stats')
        .then(async (r) => {
          if (!r.ok) return null;
          const data = await r.json().catch(() => null);
          // Only accept a well-formed payload; an error body like
          // `{ error: '...' }` would otherwise crash downstream readers.
          if (!data || typeof data !== 'object' || typeof data.revenue !== 'number') {
            return null;
          }
          return data as DashboardStats;
        })
        .then((data) => {
          if (data) setStats(data);
        })
        .catch(() => {
          /* keep previous stats (or null) so UI shows the failure card */
        })
        .finally(() => setLoading(false));
    };

    loadStats();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="p-8 lg:p-10 max-w-7xl">
        <span className="aw-skeleton block h-7 w-48 mb-2" />
        <span className="aw-skeleton block h-4 w-64 mb-8" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonStat key={i} />)}
        </div>
        <SkeletonBlock className="mb-8" lines={5} />
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <SkeletonBlock lines={6} />
          <SkeletonBlock lines={6} />
        </div>
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <SkeletonBlock lines={5} />
          <SkeletonBlock lines={5} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 text-center text-[color:var(--aw-text-muted)]">
        Failed to load dashboard. Please refresh the page.
      </div>
    );
  }

  const lowStockCount = stats.lowStockCount ?? 0;
  const unfulfilled = stats.storefront?.unfulfilled ?? 0;
  const metricCards: Array<{
    label: string;
    value: string | number;
    color: string;
    icon: IconName;
    href?: string;
  }> = [
    { label: 'Total Revenue',         value: formatCurrency(stats.revenue),       color: 'var(--aw-success)', icon: 'dollar' },
    { label: 'Unfulfilled Orders',    value: unfulfilled,                          color: unfulfilled > 0 ? 'var(--aw-danger)' : 'var(--aw-success)', icon: 'cart',     href: '/admin/orders/storefront?status=scheduled' },
    { label: 'Active Orders',         value: stats.activeOrders ?? 0,              color: 'var(--aw-navy)',    icon: 'package',  href: '/admin/orders/storefront' },
    { label: 'Pending Requests',      value: stats.pendingCustom ?? 0,             color: 'var(--aw-warning)', icon: 'mail',     href: '/admin/orders/custom' },
    { label: "Today's Consultations", value: stats.todayConsultations ?? 0,        color: 'var(--aw-info)',    icon: 'calendar', href: '/admin/services/consultations' },
    { label: 'Low Stock Alerts',      value: lowStockCount,                        color: lowStockCount > 0 ? 'var(--aw-danger)' : 'var(--aw-success)', icon: 'alert', href: '/admin/inventory' },
  ];

  const revenueByType = stats.revenueByType;
  const activeByType = stats.activeOrdersByType;
  const breakdownCards = revenueByType && activeByType ? [
    { key: 'storefront', label: 'Storefront', revenue: revenueByType.storefront, orders: activeByType.storefront, href: '/admin/orders/storefront', color: ORDER_TYPE_STYLES.storefront.fg },
    { key: 'studio',     label: 'Studio',     revenue: revenueByType.studio,     orders: activeByType.studio,     href: '/admin/orders',            color: ORDER_TYPE_STYLES.studio.fg },
    { key: 'custom',     label: 'Custom',     revenue: revenueByType.custom,     orders: activeByType.custom,     href: '/admin/orders/custom',     color: ORDER_TYPE_STYLES.custom.fg },
  ] : [];

  const pipelineMax = Math.max(...(stats.pipeline ?? []).map((s) => s.count), 1);

  const scheduleItems: (ScheduleItem & { itemType: 'consultation' | 'fitting' })[] = [
    ...(stats.upcomingConsultations ?? []).map((c) => ({ ...c, itemType: 'consultation' as const })),
    ...(stats.upcomingFittings ?? []).map((f) => ({ ...f, itemType: 'fitting' as const })),
  ]
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
    .slice(0, 8);

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-7xl">
      {/* Header — leaves room for mobile burger button at top-left */}
      <h1
        className="text-xl sm:text-2xl font-semibold mb-1 lg:ml-0 ml-10 text-[color:var(--aw-text-strong)]"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        Command Center
      </h1>
      <p className="text-sm sm:text-base text-[color:var(--aw-text-muted)] mb-6 sm:mb-8">
        Business overview &mdash; {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </p>

      {/* ─── Row 1: Key Metrics ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {metricCards.map((c) => {
          const inner = (
            <>
              <div className="flex items-center justify-between mb-2 gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)]">
                  {c.label}
                </p>
                <span
                  className="w-8 h-8 rounded-[var(--aw-radius-md)] flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `color-mix(in srgb, ${c.color} 12%, transparent)`, color: c.color }}
                >
                  <Icon name={c.icon} className="w-4 h-4" />
                </span>
              </div>
              <p className="text-3xl font-semibold" style={{ color: c.color }}>
                {c.value}
              </p>
            </>
          );
          return c.href ? (
            <a
              key={c.label}
              href={c.href}
              className="aw-focus bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] p-5 shadow-[var(--aw-shadow-sm)] border border-[color:var(--aw-border)] hover:shadow-[var(--aw-shadow-md)] hover:border-[color:var(--aw-navy)]/30 transition-all cursor-pointer block"
            >
              {inner}
            </a>
          ) : (
            <div
              key={c.label}
              className="bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] p-5 shadow-[var(--aw-shadow-sm)] border border-[color:var(--aw-border)] hover:shadow-[var(--aw-shadow-md)] transition-shadow"
            >
              {inner}
            </div>
          );
        })}
      </div>

      {/* ─── Row 1b: Revenue / Orders by type ───────────────────── */}
      {breakdownCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {breakdownCards.map((b) => (
            <a
              key={b.key}
              href={b.href}
              className="aw-focus bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] p-5 shadow-[var(--aw-shadow-sm)] border border-[color:var(--aw-border)] hover:shadow-[var(--aw-shadow-md)] hover:border-[color:var(--aw-navy)]/30 transition-all block"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: b.color }}>
                  {b.label}
                </p>
                <span className="text-xs text-[color:var(--aw-text-muted)]">
                  {b.orders} active
                </span>
              </div>
              <p className="text-2xl font-semibold text-[color:var(--aw-text-strong)]">
                {formatCurrency(b.revenue)}
              </p>
              <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">Lifetime revenue</p>
            </a>
          ))}
        </div>
      )}

      {/* ─── Row 2: AI Summary Card ─────────────────────────────── */}
      <div
        className="rounded-[var(--aw-radius-lg)] p-4 sm:p-6 mb-6 sm:mb-8 shadow-[var(--aw-shadow-md)] bg-[color:var(--aw-navy)]"
      >
        <div className="flex items-center gap-2 mb-4">
          <span
            className="w-7 h-7 rounded-full bg-[color:var(--aw-surface)]/10 flex items-center justify-center text-white"
            aria-hidden
          >
            <Icon name="snapshot" className="w-4 h-4" />
          </span>
          <h2
            className="text-sm font-semibold uppercase tracking-wider text-white opacity-80"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            AI Assistant &mdash; What Needs Attention
          </h2>
        </div>
        {stats.alerts.length === 0 ? (
          <p className="text-white opacity-70 text-[15px]">
            Everything looks good! No urgent items right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {stats.alerts.map((alert, i) => {
              const ALERT_LINKS: Record<string, string> = {
                storefront_unfulfilled: '/admin/orders/storefront?status=scheduled',
                overdue: '/admin/orders',
                consultations: '/admin/services/consultations',
                deposit: '/admin/orders/custom',
                low_stock: '/admin/inventory',
                fittings: '/admin/services/fittings',
                pending: '/admin/orders/custom',
              };
              const href = ALERT_LINKS[alert.type];
              const borderColor = SEVERITY_BORDER[alert.severity] || 'var(--aw-info)';
              const content = (
                <div
                  className="flex items-start gap-3 text-white text-[15px] pl-3 border-l-2"
                  style={{ borderColor }}
                >
                  <span className="opacity-90">{alert.message}</span>
                  {href && <Icon name="chevronRight" className="w-3.5 h-3.5 ml-auto opacity-40 shrink-0 mt-1" />}
                </div>
              );
              return (
                <li key={i}>
                  {href ? (
                    <a href={href} className="block hover:bg-[color:var(--aw-surface)]/5 rounded px-2 -mx-2 py-1.5 transition-colors">
                      {content}
                    </a>
                  ) : <div className="py-1.5 px-2 -mx-2">{content}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ─── Row 3: Pipeline + Activity ─────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
        {/* Order Pipeline */}
        <div className="bg-[color:var(--aw-surface)] rounded-lg p-4 sm:p-6 shadow-sm border border-[color:var(--aw-border)]">
          <h2
            className="text-sm font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-5"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Order Pipeline
          </h2>
          <div className="space-y-3">
            {stats.pipeline.map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <span className="text-xs font-medium text-[#2D2D2D] w-24 shrink-0 text-right">
                  {stage.label}
                </span>
                <div className="flex-1 h-6 bg-[color:var(--aw-surface-muted)] rounded-full overflow-hidden relative">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max((stage.count / pipelineMax) * 100, stage.count > 0 ? 8 : 0)}%`,
                      background: 'linear-gradient(90deg, #1B2A5B, #2D4A8B)',
                    }}
                  />
                  {stage.count > 0 && (
                    <span
                      className="absolute inset-y-0 flex items-center text-xs font-bold"
                      style={{
                        left: `${Math.max((stage.count / pipelineMax) * 100, 8) + 2}%`,
                        color: '#1B2A5B',
                      }}
                    >
                      {stage.count}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-[color:var(--aw-surface)] rounded-lg p-6 shadow-sm border border-[color:var(--aw-border)]">
          <h2
            className="text-sm font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-5"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Recent Activity
          </h2>
          {stats.recentActivity.length === 0 ? (
            <div className="text-center py-8">
              <Icon name="application" className="w-8 h-8 mx-auto mb-2 text-[color:var(--aw-text-faint)]" />
              <p className="text-[color:var(--aw-text-muted)] text-[15px]">No recent activity yet</p>
              <p className="text-[color:var(--aw-text-faint)] text-sm mt-1">Activities will appear here as orders progress</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[320px] overflow-y-auto">
              {stats.recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 py-2 border-b border-[color:var(--aw-border)] last:border-0"
                >
                  <span className="text-[color:var(--aw-text-muted)] shrink-0 mt-0.5">
                    <Icon
                      name={ACTIVITY_ICONS[activity.action] || 'application'}
                      className="w-4 h-4"
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-[#2D2D2D] leading-snug truncate">
                      {activity.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {activity.orderId && (
                        <span className="text-xs font-medium text-[color:var(--aw-text-strong)]">
                          {activity.orderId}
                        </span>
                      )}
                      <span className="text-xs text-[color:var(--aw-text-faint)]">
                        {timeAgo(activity.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Row 4: Schedule + Designers ────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Upcoming Schedule */}
        <div className="bg-[color:var(--aw-surface)] rounded-lg p-6 shadow-sm border border-[color:var(--aw-border)]">
          <div className="flex items-center justify-between mb-5">
            <h2
              className="text-sm font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Upcoming Schedule (7 days)
            </h2>
            <Link
              href="/admin/services/consultations"
              className="text-xs font-medium text-[color:var(--aw-text-strong)] hover:underline"
            >
              View all
            </Link>
          </div>
          {scheduleItems.length === 0 ? (
            <div className="text-center py-8">
              <Icon name="calendar" className="w-8 h-8 mx-auto mb-2 text-[color:var(--aw-text-faint)]" />
              <p className="text-[color:var(--aw-text-muted)] text-[15px]">No upcoming appointments</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[320px] overflow-y-auto">
              {scheduleItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 border-b border-[color:var(--aw-border)] last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[color:var(--aw-text-strong)] truncate">
                      {item.clientName}
                    </p>
                    <p className="text-xs text-[color:var(--aw-text-muted)] mt-0.5">
                      {formatDate(item.scheduledDate)}
                      {item.scheduledTime ? ` at ${item.scheduledTime}` : ''}
                    </p>
                  </div>
                  <span
                    className="text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded shrink-0 ml-3"
                    style={{
                      background: item.itemType === 'consultation' ? '#1B2A5B' : '#7B6B8E',
                      color: '#fff',
                    }}
                  >
                    {item.itemType === 'consultation' ? 'Consult' : 'Fitting'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Designers */}
        <div className="bg-[color:var(--aw-surface)] rounded-lg p-6 shadow-sm border border-[color:var(--aw-border)]">
          <h2
            className="text-sm font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-5"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Top Designers
          </h2>
          {stats.topDesigners.length === 0 ? (
            <div className="text-center py-8">
              <Icon name="designer" className="w-8 h-8 mx-auto mb-2 text-[color:var(--aw-text-faint)]" />
              <p className="text-[color:var(--aw-text-muted)] text-[15px]">No active designers</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stats.topDesigners.map((designer) => {
                const loadPct = designer.maxCapacity > 0
                  ? Math.round((designer.currentLoad / designer.maxCapacity) * 100)
                  : 0;
                const loadColor = loadPct >= 80 ? '#C41E3A' : loadPct >= 50 ? '#D4A574' : '#2D8E5A';

                return (
                  <div key={designer.id} className="py-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="min-w-0">
                        <span className="text-[14px] font-semibold text-[color:var(--aw-text-strong)]">
                          {designer.name}
                        </span>
                        {designer.specialty && (
                          <span className="text-xs text-[color:var(--aw-text-muted)] ml-2">{designer.specialty}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-[#D4A574]">
                          {'★'.repeat(Math.round(designer.rating))}
                          {'☆'.repeat(5 - Math.round(designer.rating))}
                        </span>
                        <span className="text-xs text-[color:var(--aw-text-muted)]">
                          {designer.completedOrders} done
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[color:var(--aw-surface-muted)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${loadPct}%`, background: loadColor }}
                        />
                      </div>
                      <span className="text-xs text-[color:var(--aw-text-muted)] w-16 text-right shrink-0">
                        {designer.currentLoad}/{designer.maxCapacity}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Row 4b: Recent Orders (unified across all three types) ─ */}
      <div className="bg-[color:var(--aw-surface)] rounded-lg p-4 sm:p-6 shadow-sm border border-[color:var(--aw-border)] mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-sm font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Recent Orders
          </h2>
          <Link href="/admin/orders" className="text-xs font-medium text-[color:var(--aw-text-strong)] hover:underline">
            View all
          </Link>
        </div>
        {!stats.recentOrders || stats.recentOrders.length === 0 ? (
          <div className="text-center py-8">
            <Icon name="cart" className="w-8 h-8 mx-auto mb-2 text-[color:var(--aw-text-faint)]" />
            <p className="text-[color:var(--aw-text-muted)] text-[15px]">No orders yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] border-b border-[color:var(--aw-border)]">
                  <th className="py-2.5 pr-4 font-semibold">Order</th>
                  <th className="py-2.5 pr-4 font-semibold">Type</th>
                  <th className="py-2.5 pr-4 font-semibold">Customer</th>
                  <th className="py-2.5 pr-4 font-semibold">Status</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Amount</th>
                  <th className="py-2.5 font-semibold text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((o) => {
                  const style = ORDER_TYPE_STYLES[o.type];
                  return (
                    <tr key={`${o.type}-${o.id}`} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-surface-muted)] transition-colors">
                      <td className="py-3 pr-4">
                        <Link href={o.href} className="text-sm font-semibold text-[color:var(--aw-text-strong)] hover:underline">
                          {o.ref}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className="inline-block text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded"
                          style={{ background: style.bg, color: style.fg }}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-sm text-[#2D2D2D] truncate max-w-[180px]">
                        {o.customer}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[color:var(--aw-text-muted)] capitalize">
                        {o.status.replace(/_/g, ' ')}
                      </td>
                      <td className="py-3 pr-4 text-sm font-semibold text-[color:var(--aw-text-strong)] text-right">
                        {formatCurrency(o.amount)}
                      </td>
                      <td className="py-3 text-xs text-[color:var(--aw-text-muted)] text-right whitespace-nowrap">
                        {timeAgo(o.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Row 5: Quick Actions ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'New Custom Order', href: '/admin/orders/custom', icon: '✂️', desc: 'Start a bespoke order' },
          { label: 'Schedule Consultation', href: '/admin/services/consultations', icon: '📅', desc: 'Book a client session' },
          { label: 'Add Jewelry', href: '/admin/products/jewelry', icon: '📿', desc: 'African jewelry catalog' },
          { label: 'Add Product', href: '/admin/products', icon: '🏷️', desc: 'Apparel & accessories' },
        ].map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="bg-[color:var(--aw-surface)] rounded-lg p-5 shadow-sm border border-[color:var(--aw-border)] hover:shadow-md hover:border-[color:var(--aw-navy)] transition-all group block"
          >
            <span className="text-2xl block mb-2">{action.icon}</span>
            <p
              className="text-[14px] font-semibold text-[color:var(--aw-text-strong)] group-hover:text-[color:var(--aw-danger)] transition-colors"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {action.label}
            </p>
            <p className="text-xs text-[color:var(--aw-text-muted)] mt-0.5">{action.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
