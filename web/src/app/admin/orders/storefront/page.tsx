'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminErrorBanner } from '@/components/admin/AdminErrorBanner';
import { PaginationFooter } from '@/components/admin';
import Link from 'next/link';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import StatCard from '@/components/admin/StatCard';
import StatusBadge from '@/components/admin/StatusBadge';
import AdminEmptyState from '@/components/admin/AdminEmptyState';
import { showErrorToast, showSuccessToast } from '@/components/Toast';
import { carrierTrackingUrl } from '@/lib/carrier-tracking';

interface StorefrontOrder {
  id: string;
  shortId: string;
  status: string;
  amount: number | null;
  currency: string;
  customNotes?: string | null;
  customer: { id?: string; email?: string | null; name?: string | null };
  product: { id: string; name: string; price: number; image: string | null } | null;
  payment: { id: string; status: string; amount: number; paymentMethod: string | null; last4: string | null; brand: string | null } | null;
  shipping: {
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string;
  };
  hasShippingAddress: boolean;
  shipment: {
    id: string;
    shipmentId: string;
    status: string;
    carrier: string | null;
    trackingNumber: string | null;
    hasLabel: boolean;
    labelUrl: string | null;
    shippedAt: string | null;
    actualDelivery: string | null;
    estimatedDelivery: string | null;
  } | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  pending: { color: '#D4A574', label: 'Pending Payment' },
  scheduled: { color: '#1B2A5B', label: 'Paid · Needs Fulfillment' },
  processing: { color: '#7B6B8E', label: 'Processing' },
  awaiting_collection: { color: '#D97706', label: 'Awaiting Collection' },
  shipped: { color: '#2D8E5A', label: 'Shipped' },
  delivered: { color: '#2D8E5A', label: 'Delivered' },
  cancelled: { color: '#C41E3A', label: 'Cancelled' },
  refunded: { color: '#8B7569', label: 'Refunded' },
  abandoned: { color: '#A8A29E', label: 'Abandoned (unpaid)' },
};

function statusStyle(s: string) {
  return STATUS_STYLES[s] || { color: '#8B7569', label: s };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type SortableColumn = 'createdAt' | 'updatedAt' | 'amount' | 'status';

export default function StorefrontOrdersPage() {
  const [orders, setOrders] = useState<StorefrontOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Pagination & sort (server-side)
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<SortableColumn>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Bulk-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCarrier, setBulkCarrier] = useState('UPS');
  const [bulkTracking, setBulkTracking] = useState('');
  const [showDangerMenu, setShowDangerMenu] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  const [bulkDeleteForce, setBulkDeleteForce] = useState(false);

  // Per-row quick actions
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [trackModal, setTrackModal] = useState<{ order: StorefrontOrder } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      const res = await fetch(`/api/admin/orders/storefront?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Failed to load storefront orders (${res.status})`);
      }
      const data = await res.json();
      // Accept the new paginated envelope. Fall back to a raw array for
      // any caller still pinned to the older shape during a rolling deploy.
      if (Array.isArray(data)) {
        setOrders(data);
        setTotal(data.length);
        setTotalPages(1);
      } else {
        setOrders(Array.isArray(data.items) ? data.items : []);
        setTotal(typeof data.total === 'number' ? data.total : 0);
        setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1);
      }
      setSelectedIds(new Set()); // clear selection on reload
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page, pageSize, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 whenever filters change so we don't land on an empty page.
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  function toggleSort(col: SortableColumn) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  }

  const stats = useMemo(() => ({
    // `total` is the full dataset size (across pages); the per-page counts
    // are derived from `orders`. This avoids the stats card pretending we
    // only have 25 orders just because the current page is short.
    total,
    needsFulfillment: orders.filter((o) => o.status === 'scheduled').length,
    inTransit: orders.filter((o) => o.status === 'shipped').length,
    revenue: orders.filter((o) => o.payment?.status === 'succeeded').reduce((s, o) => s + (o.amount || 0), 0),
  }), [orders, total]);

  // ── Bulk-select helpers ────────────────────────────────────
  const allVisibleIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const fulfillableSelected = useMemo(
    () => orders.filter((o) => selectedIds.has(o.id) && o.status === 'scheduled'),
    [orders, selectedIds],
  );
  const allChecked = orders.length > 0 && selectedIds.size === orders.length;
  const someChecked = selectedIds.size > 0 && selectedIds.size < orders.length;

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allChecked) setSelectedIds(new Set());
    else setSelectedIds(new Set(allVisibleIds));
  }

  async function handleBulkMarkShipped() {
    if (fulfillableSelected.length === 0) return;
    if (!confirm(`Mark ${fulfillableSelected.length} order${fulfillableSelected.length === 1 ? '' : 's'} as shipped? Customers will be notified.`)) return;

    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/orders/storefront/bulk-mark-shipped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: fulfillableSelected.map((o) => o.id),
          carrier: bulkCarrier,
          trackingNumber: bulkTracking.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk mark failed');
      showSuccessToast(
        `Shipped ${data.succeeded} of ${data.processed}`,
        data.failed?.length > 0
          ? `${data.failed.length} skipped (already shipped or error). Check console.`
          : 'All customers have been notified.',
      );
      setBulkTracking('');
      await load();
    } catch {
      showErrorToast('Bulk action failed', 'Please try again.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleCombine() {
    if (selectedIds.size < 2) return;
    if (!confirm(`Combine ${selectedIds.size} orders into ONE shipment + a single USPS label? They must all ship to the same address; all will be marked shipped.`)) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/shipping/combine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Combine failed');
      showSuccessToast(
        `Combined ${data.combinedOrders} orders → 1 label`,
        `${data.shipmentId} · ${data.totalWeightLb} lb · tracking ${data.trackingNumber}`,
      );
      await load();
    } catch (e) {
      showErrorToast('Combine failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBuyLabels() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Get a USPS label (via EasyPost) for ${selectedIds.size} order${selectedIds.size === 1 ? '' : 's'}? Each order gets its own label + tracking.`)) return;
    setBulkBusy(true);
    let made = 0, failed = 0;
    let firstError = '';
    try {
      for (const id of Array.from(selectedIds)) {
        try {
          const res = await fetch(`/api/admin/orders/storefront/${id}/create-label`, { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) made++;
          else { failed++; if (!firstError) firstError = data.error || 'failed'; }
        } catch { failed++; }
      }
      if (made > 0) {
        showSuccessToast(`${made} label${made === 1 ? '' : 's'} created`, failed ? `${failed} skipped — ${firstError}` : 'Tracking attached to each order.');
      } else {
        showErrorToast('No labels created', firstError || 'Check the shipping address and EasyPost config.');
      }
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    window.location.href = `/api/admin/orders/storefront/export?${params.toString()}`;
  }

  async function handleBulkCancel() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Cancel ${selectedIds.size} order${selectedIds.size === 1 ? '' : 's'}? This sets the status to "cancelled" — it does NOT issue Stripe refunds. Already-shipped/delivered/refunded orders will be skipped.`)) return;

    setBulkBusy(true);
    setShowDangerMenu(false);
    try {
      const res = await fetch('/api/admin/orders/storefront/bulk-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk cancel failed');
      showSuccessToast(
        `Cancelled ${data.cancelled} of ${data.processed}`,
        data.skipped?.length > 0 ? `${data.skipped.length} skipped (already terminal status)` : '',
      );
      await load();
    } catch {
      showErrorToast('Bulk cancel failed', 'Please try again.');
    } finally {
      setBulkBusy(false);
    }
  }

  function openBulkDelete() {
    setShowDangerMenu(false);
    setBulkDeleteConfirm('');
    setBulkDeleteForce(false);
    setBulkDeleteOpen(true);
  }

  async function handleBulkDelete() {
    if (bulkDeleteConfirm !== 'DELETE') return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/orders/storefront/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: Array.from(selectedIds),
          confirm: 'DELETE',
          force: bulkDeleteForce,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hard delete failed');
      showSuccessToast(
        `Deleted ${data.deleted} of ${data.processed}`,
        data.skipped?.length > 0
          ? `${data.skipped.length} skipped (paid orders need force=true or were not found)`
          : 'Order rows permanently removed.',
      );
      setBulkDeleteOpen(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete';
      showErrorToast('Hard delete failed', msg);
    } finally {
      setBulkBusy(false);
    }
  }

  // ── Per-row quick actions ──────────────────────────────────
  function printLabel(o: StorefrontOrder) {
    setOpenMenuId(null);
    if (!o.shipment) return;
    if (o.shipment.hasLabel) {
      // Stored label (USPS PDF / UPS PNG) streamed by the shipping label route.
      window.open(`/api/admin/shipping/${o.shipment.id}/label`, '_blank', 'noopener');
    } else if (o.shipment.labelUrl) {
      window.open(o.shipment.labelUrl, '_blank', 'noopener');
    } else {
      showErrorToast('No label yet', 'Use "Create label" first to buy USPS postage.');
    }
  }

  async function createLabel(o: StorefrontOrder) {
    setOpenMenuId(null);
    if (!confirm(`Get a USPS label (via EasyPost) for order ${o.shortId}? This purchases real postage and attaches tracking.`)) return;
    setRowBusyId(o.id);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${o.id}/create-label`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not create label');
      showSuccessToast('Label created', `${o.shortId} — tracking attached.`);
      await load();
    } catch (e) {
      showErrorToast('Could not create label', e instanceof Error ? e.message : 'Check the shipping address & EasyPost config.');
    } finally {
      setRowBusyId(null);
    }
  }

  async function markShipped(o: StorefrontOrder) {
    setOpenMenuId(null);
    if (!confirm(`Mark order ${o.shortId} as shipped? The customer will be notified.`)) return;
    setRowBusyId(o.id);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${o.id}/mark-shipped`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber: o.shipment?.trackingNumber || null,
          carrier: o.shipment?.carrier || 'USPS',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mark shipped');
      showSuccessToast('Marked shipped', `${o.shortId} — customer notified.`);
      await load();
    } catch (e) {
      showErrorToast('Could not mark shipped', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setRowBusyId(null);
    }
  }

  async function markDelivered(o: StorefrontOrder) {
    setOpenMenuId(null);
    if (!confirm(`Mark order ${o.shortId} as delivered? The customer will be notified.`)) return;
    setRowBusyId(o.id);
    try {
      const res = await fetch(`/api/admin/orders/storefront/${o.id}/mark-delivered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mark delivered');
      showSuccessToast('Marked delivered', `${o.shortId} — customer notified.`);
      await load();
    } catch (e) {
      showErrorToast('Could not mark delivered', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setRowBusyId(null);
    }
  }

  function openTracking(o: StorefrontOrder) {
    setOpenMenuId(null);
    setTrackModal({ order: o });
  }

  function renderActionsMenu(o: StorefrontOrder) {
    const sh = o.shipment;
    const canPrint = Boolean(sh && (sh.hasLabel || sh.labelUrl));
    const canTrack = Boolean(sh?.trackingNumber);
    const isPaid = !['pending', 'cancelled', 'refunded'].includes(o.status);
    const canCreateLabel = isPaid && !canPrint && o.hasShippingAddress;
    const canShip = o.status === 'scheduled' || o.status === 'processing' || o.status === 'awaiting_collection';
    const canDeliver = o.status === 'shipped';
    const busy = rowBusyId === o.id;
    const isOpen = openMenuId === o.id;

    const item =
      'group w-full text-left px-2.5 py-2 text-xs font-medium flex items-center gap-2.5 rounded-md transition-colors hover:bg-[color:var(--aw-surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';
    const chip =
      'grid place-items-center w-6 h-6 rounded-md text-[12px] shrink-0';
    const sectionLabel =
      'px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)]';

    return (
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={() => setOpenMenuId(isOpen ? null : o.id)}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 ${
            isOpen
              ? 'bg-[#0F1A3A] text-white ring-2 ring-[color:var(--aw-navy)]/30'
              : 'bg-[color:var(--aw-navy)] text-white hover:bg-[#0F1A3A] hover:shadow'
          }`}
        >
          {busy ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Working…
            </>
          ) : (
            <>
              Actions
              <span aria-hidden className={`text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
            </>
          )}
        </button>
        {isOpen && (
          <div
            className="absolute right-0 mt-1.5 w-60 bg-[color:var(--aw-surface)] border border-[color:var(--aw-border)] rounded-xl shadow-2xl p-1.5 z-30 origin-top-right"
            onMouseLeave={() => setOpenMenuId(null)}
          >
            <div className="px-2.5 py-2 mb-1 border-b border-[color:var(--aw-border)]">
              <p className="font-mono text-[11px] font-semibold text-[color:var(--aw-text-strong)]">{o.shortId}</p>
              <p className="text-[10px] text-[color:var(--aw-text-muted)] truncate">{o.customer.name || o.customer.email || '—'}</p>
            </div>

            <Link
              href={`/admin/orders/storefront/${o.id}`}
              className={`${item} text-[color:var(--aw-text-strong)]`}
              onClick={() => setOpenMenuId(null)}
            >
              <span className={`${chip} bg-[color:var(--aw-surface-muted)]`}>🔍</span>
              View details
            </Link>

            {canCreateLabel && (
              <button
                type="button"
                className="w-full text-left mt-0.5 px-2.5 py-2 text-xs font-semibold flex items-center gap-2.5 rounded-md bg-[#2D8E5A]/10 text-[#2D8E5A] hover:bg-[#2D8E5A]/20 transition-colors disabled:opacity-40"
                disabled={busy}
                onClick={() => createLabel(o)}
              >
                <span className={`${chip} bg-[#2D8E5A]/15 text-[#2D8E5A]`}>🏷️</span>
                Get Label
              </button>
            )}

            <p className={sectionLabel}>Label &amp; Tracking</p>
            <button type="button" className={`${item} text-[color:var(--aw-text-strong)]`} disabled={!canPrint} onClick={() => printLabel(o)}>
              <span className={`${chip} bg-[color:var(--aw-surface-muted)]`}>🏷️</span>
              Print label
            </button>
            <button type="button" className={`${item} text-[color:var(--aw-text-strong)]`} disabled={!canTrack} onClick={() => openTracking(o)}>
              <span className={`${chip} bg-[color:var(--aw-surface-muted)]`}>📍</span>
              Track package
            </button>

            <p className={sectionLabel}>Fulfillment</p>
            <button
              type="button"
              className={`${item} text-[#2D8E5A]`}
              disabled={!canShip || busy}
              onClick={() => markShipped(o)}
            >
              <span className={`${chip} bg-[#2D8E5A]/12 text-[#2D8E5A]`}>🚚</span>
              Mark shipped
            </button>
            <button
              type="button"
              className={`${item} text-[#1B2A5B]`}
              disabled={!canDeliver || busy}
              onClick={() => markDelivered(o)}
            >
              <span className={`${chip} bg-[#1B2A5B]/12 text-[#1B2A5B]`}>✅</span>
              Mark delivered
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10">
      <AdminPageHeader
        title="Storefront Orders"
        subtitle="Customer e-commerce orders from awulak.com"
        breadcrumbs={[{ label: 'Orders' }, { label: 'Storefront' }]}
      >
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[color:var(--aw-navy)] text-[color:var(--aw-text-strong)] rounded-md hover:bg-[color:var(--aw-navy)] hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            Export CSV
          </button>
        </div>
      </AdminPageHeader>

      <AdminErrorBanner message={loadError} onRetry={load} />

      {/* Stats — collapses to 2 columns on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Total Orders" value={stats.total} />
        <StatCard label="Needs Fulfillment" value={stats.needsFulfillment} color="var(--aw-danger)" />
        <StatCard label="In Transit" value={stats.inTransit} color="var(--aw-info)" />
        <StatCard label="Revenue (paid)" value={`$${stats.revenue.toFixed(2)}`} color="var(--aw-success)" />
      </div>

      {/* Filters */}
      <div className="bg-[color:var(--aw-surface)] border border-[color:var(--aw-border)] rounded-lg p-3 sm:p-4 mb-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
        <input
          type="text"
          placeholder="Search by ID, customer email, product..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field flex-1 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field sm:w-64 text-sm"
        >
          <option value="all">All orders (paid)</option>
          <option value="pending">Pending Payment (unpaid)</option>
          <option value="scheduled">Paid · Needs Fulfillment</option>
          <option value="processing">Processing</option>
          <option value="awaiting_collection">Awaiting Collection</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
          <option value="abandoned">Abandoned (unpaid)</option>
        </select>
      </div>

      {/* Orders */}
      {loading ? (
        <div className="bg-[color:var(--aw-surface)] border border-[color:var(--aw-border)] rounded-lg p-12 text-center">
          <div className="loading-spinner mx-auto mb-3" />
          <p className="text-sm text-[color:var(--aw-text-muted)]">Loading orders…</p>
        </div>
      ) : orders.length === 0 ? (
        <AdminEmptyState
          icon={<span className="text-3xl">📦</span>}
          title={search || statusFilter !== 'all' ? 'No matching orders' : 'No storefront orders yet'}
          description={
            search || statusFilter !== 'all'
              ? 'Try clearing your filters.'
              : "Orders from your awulak.com storefront will appear here as soon as customers check out."
          }
        />
      ) : (
        <>
          {/* DESKTOP TABLE */}
          <div className="bg-[color:var(--aw-surface)] border border-[color:var(--aw-border)] rounded-lg overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--aw-surface-muted)] text-[color:var(--aw-text-muted)] text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => { if (el) el.indeterminate = someChecked; }}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded border-[#D1D5DB]"
                        aria-label="Select all"
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold">Order</th>
                    <th className="text-left px-4 py-3 font-semibold">Customer</th>
                    <th className="text-left px-4 py-3 font-semibold">Product</th>
                    <th className="text-right px-4 py-3 font-semibold">
                      <button type="button" onClick={() => toggleSort('amount')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                        Amount
                        {sortBy === 'amount' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold">
                      <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                        Status
                        {sortBy === 'status' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold">Payment</th>
                    <th className="text-left px-4 py-3 font-semibold">
                      <button type="button" onClick={() => toggleSort('createdAt')} className="inline-flex items-center gap-1 hover:text-[color:var(--aw-text-strong)]">
                        Date
                        {sortBy === 'createdAt' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    </th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EBE3]">
                  {orders.map((o) => {
                    const s = statusStyle(o.status);
                    const isSelected = selectedIds.has(o.id);
                    return (
                      <tr
                        key={o.id}
                        className={`transition-colors ${isSelected ? 'bg-[color:var(--aw-surface-muted)]' : 'hover:bg-[color:var(--aw-surface-muted)]/50'}`}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(o.id)}
                            className="w-4 h-4 rounded border-[#D1D5DB]"
                            aria-label={`Select order ${o.shortId}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/orders/storefront/${o.id}`} className="font-mono text-xs font-semibold text-[color:var(--aw-text-strong)] hover:text-[color:var(--aw-danger)]">
                            {o.shortId}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[color:var(--aw-text-strong)] font-medium leading-tight">{o.customer.name || '—'}</p>
                          <p className="text-xs text-[color:var(--aw-text-muted)] mt-0.5">{o.customer.email || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-[color:var(--aw-text-strong)] max-w-xs">
                          <p className="font-medium leading-tight">
                            {o.product?.name || <span className="text-[color:var(--aw-text-muted)]">—</span>}
                          </p>
                          {o.customNotes && (
                            <p
                              className="text-[11px] text-[color:var(--aw-text-muted)] mt-1 leading-snug line-clamp-2"
                              title={o.customNotes}
                            >
                              📝 {o.customNotes}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-[color:var(--aw-text-strong)]">
                          ${(o.amount || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                            style={{ color: s.color, backgroundColor: `${s.color}1A` }}
                          >
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {o.payment ? (
                            <StatusBadge status={o.payment.status} />
                          ) : (
                            <span className="text-xs text-[color:var(--aw-text-muted)]">No payment</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-[color:var(--aw-text-muted)] whitespace-nowrap">{formatDate(o.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {renderActionsMenu(o)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <PaginationFooter
            page={page}
            totalPages={totalPages}
            total={total}
            label="order"
            onPageChange={setPage}
            loading={loading}
          />

          {/* MOBILE CARDS */}
          <div className="md:hidden space-y-2">
            {orders.map((o) => {
              const s = statusStyle(o.status);
              const isSelected = selectedIds.has(o.id);
              return (
                <div
                  key={o.id}
                  className={`bg-[color:var(--aw-surface)] border rounded-lg p-3 transition-colors ${isSelected ? 'border-[color:var(--aw-navy)]' : 'border-[color:var(--aw-border)]'}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(o.id)}
                      className="w-5 h-5 rounded border-[#D1D5DB] mt-1 shrink-0"
                      aria-label={`Select order ${o.shortId}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <Link href={`/admin/orders/storefront/${o.id}`} className="font-mono text-xs font-semibold text-[color:var(--aw-text-strong)]">
                          {o.shortId}
                        </Link>
                        <span className="text-base font-bold text-[color:var(--aw-text-strong)] shrink-0">${(o.amount || 0).toFixed(2)}</span>
                      </div>
                      <p className="text-sm font-medium text-[color:var(--aw-text-strong)] truncate">{o.customer.name || '—'}</p>
                      <p className="text-xs text-[color:var(--aw-text-muted)] truncate mb-2">{o.customer.email || '—'}</p>
                      <p className="text-xs text-[color:var(--aw-text-strong)] truncate mb-1">📦 {o.product?.name || '—'}</p>
                      {o.customNotes && (
                        <p className="text-[11px] text-[color:var(--aw-text-muted)] mb-2 leading-snug line-clamp-2" title={o.customNotes}>
                          📝 {o.customNotes}
                        </p>
                      )}
                      {o.shipment?.trackingNumber && (
                        <p className="text-[11px] text-[color:var(--aw-text-muted)] truncate mb-2 font-mono">
                          {o.shipment.carrier || 'Carrier'}: {o.shipment.trackingNumber}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span
                          className="inline-block px-2 py-1 rounded-full text-[10px] font-semibold"
                          style={{ color: s.color, backgroundColor: `${s.color}1A` }}
                        >
                          {s.label}
                        </span>
                        {renderActionsMenu(o)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Sticky Bulk Action Bar ───────────────────────────── */}
          {selectedIds.size > 0 && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-3xl z-40">
              <div className="bg-[#0F1A3A] text-white rounded-xl shadow-2xl p-4 sm:p-5 border border-white/10">
                <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#CE1126] text-white text-sm font-bold">
                      {selectedIds.size}
                    </span>
                    <div>
                      <p className="text-sm font-semibold leading-tight">selected</p>
                      <p className="text-[11px] text-white/60 leading-tight">
                        {fulfillableSelected.length} can be marked shipped
                      </p>
                    </div>
                  </div>

                  {fulfillableSelected.length > 0 && (
                    <div className="flex flex-1 flex-col sm:flex-row gap-2 w-full">
                      <select
                        value={bulkCarrier}
                        onChange={(e) => setBulkCarrier(e.target.value)}
                        className="bg-[color:var(--aw-surface)]/10 border border-white/20 text-white text-xs rounded px-2 py-1.5 outline-none focus:border-white/40"
                      >
                        <option className="text-[color:var(--aw-text-strong)]">UPS</option>
                        <option className="text-[color:var(--aw-text-strong)]">USPS</option>
                        <option className="text-[color:var(--aw-text-strong)]">FedEx</option>
                        <option className="text-[color:var(--aw-text-strong)]">DHL</option>
                        <option className="text-[color:var(--aw-text-strong)]">Other</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Tracking # (optional, applies to all)"
                        value={bulkTracking}
                        onChange={(e) => setBulkTracking(e.target.value)}
                        className="bg-[color:var(--aw-surface)]/10 border border-white/20 text-white text-xs rounded px-3 py-1.5 outline-none focus:border-white/40 flex-1 placeholder-white/40 min-w-0"
                      />
                      <button
                        onClick={handleBulkMarkShipped}
                        disabled={bulkBusy}
                        className="bg-[#2D8E5A] hover:bg-[#206E44] disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded transition-colors whitespace-nowrap"
                      >
                        {bulkBusy ? 'Working…' : `Ship ${fulfillableSelected.length} →`}
                      </button>
                    </div>
                  )}

                  {selectedIds.size >= 1 && (
                    <button
                      onClick={handleBuyLabels}
                      disabled={bulkBusy}
                      title="Get a USPS label (via EasyPost) for each selected order"
                      className="bg-[#0F6F3F] hover:bg-[#0C5733] disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      {bulkBusy ? 'Working…' : `Get ${selectedIds.size} label${selectedIds.size === 1 ? '' : 's'}`}
                    </button>
                  )}

                  {selectedIds.size >= 2 && (
                    <button
                      onClick={handleCombine}
                      disabled={bulkBusy}
                      title="Combine selected orders that ship to the same address into one shipment + one label"
                      className="bg-[#1B2A5B] hover:bg-[#2D4A8C] disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded transition-colors whitespace-nowrap shrink-0"
                    >
                      {bulkBusy ? 'Working…' : `Combine ${selectedIds.size} → 1 label`}
                    </button>
                  )}

                  {/* More ▾ menu — cancel + hard delete */}
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setShowDangerMenu((v) => !v)}
                      disabled={bulkBusy}
                      className="bg-[color:var(--aw-surface)]/10 hover:bg-[color:var(--aw-surface)]/15 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                    >
                      More ▾
                    </button>
                    {showDangerMenu && (
                      <div
                        className="absolute bottom-full right-0 mb-2 bg-[color:var(--aw-surface)] text-[color:var(--aw-text-strong)] rounded-lg shadow-xl border border-[color:var(--aw-border)] py-1 w-56 z-10"
                        onMouseLeave={() => setShowDangerMenu(false)}
                      >
                        <button
                          onClick={handleBulkCancel}
                          className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-[color:var(--aw-surface-muted)] flex items-center gap-2"
                        >
                          <span>🚫</span>
                          <div>
                            <div>Cancel selected</div>
                            <div className="text-[10px] text-[color:var(--aw-text-muted)] font-normal">Soft cancel · no Stripe refund</div>
                          </div>
                        </button>
                        <button
                          onClick={openBulkDelete}
                          className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-[color:var(--aw-danger-soft)] text-[color:var(--aw-danger)] flex items-center gap-2 border-t border-[color:var(--aw-border)]"
                        >
                          <span>🗑</span>
                          <div>
                            <div>Hard delete…</div>
                            <div className="text-[10px] text-[color:var(--aw-text-muted)] font-normal">Permanently removes rows</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs text-white/60 hover:text-white px-3 py-1.5 shrink-0"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Bulk Hard-Delete Modal ─────────────────────────── */}
          {bulkDeleteOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.55)' }}
              onClick={() => !bulkBusy && setBulkDeleteOpen(false)}
            >
              <div
                className="bg-[color:var(--aw-surface)] rounded-xl w-full max-w-md shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-[color:var(--aw-border)]">
                  <h2 className="text-lg font-semibold text-[color:var(--aw-danger)]">⚠ Permanently Delete {selectedIds.size} Order{selectedIds.size === 1 ? '' : 's'}?</h2>
                  <p className="text-sm text-[#5C3D2E] mt-2 leading-relaxed">
                    This permanently removes the order row + linked payment row + shipment from the database. <strong className="text-[color:var(--aw-danger)]">It cannot be undone.</strong>
                    <br /><br />
                    Use this only for test orders or spam. For real orders, <strong>Cancel + Refund</strong> instead.
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-[color:var(--aw-text-muted)] mb-1.5">
                      Type <code className="bg-[color:var(--aw-danger-soft)] text-[color:var(--aw-danger)] px-1.5 py-0.5 rounded font-mono">DELETE</code> to confirm
                    </label>
                    <input
                      type="text"
                      value={bulkDeleteConfirm}
                      onChange={(e) => setBulkDeleteConfirm(e.target.value)}
                      placeholder="DELETE"
                      autoComplete="off"
                      className="input-field w-full font-mono"
                    />
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer text-xs text-[#5C3D2E]">
                    <input
                      type="checkbox"
                      checked={bulkDeleteForce}
                      onChange={(e) => setBulkDeleteForce(e.target.checked)}
                      className="mt-0.5 w-4 h-4"
                    />
                    <span>
                      <strong>Also delete orders with successful Stripe payments.</strong>
                      <span className="block text-[color:var(--aw-text-muted)] text-[11px] mt-0.5">
                        Without this, paid orders are skipped. Checking this does NOT issue refunds — Stripe charges remain unless you refunded separately.
                      </span>
                    </span>
                  </label>
                </div>
                <div className="p-6 border-t border-[color:var(--aw-border)] flex gap-2 justify-end">
                  <button
                    onClick={() => setBulkDeleteOpen(false)}
                    disabled={bulkBusy}
                    className="px-4 py-2 text-sm border border-[#D1D5DB] text-[color:var(--aw-text-muted)] rounded-md hover:bg-[#F9FAFB]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkBusy || bulkDeleteConfirm !== 'DELETE'}
                    className="px-5 py-2 text-sm font-semibold bg-[color:var(--aw-danger)] text-white rounded-md hover:bg-[#9F162E] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bulkBusy ? 'Deleting…' : `Permanently delete ${selectedIds.size}`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Spacer so sticky bar doesn't cover the last row */}
      {selectedIds.size > 0 && <div className="h-32" />}

      {/* ─── Live Tracking Modal ──────────────────────────────── */}
      {trackModal && (
        <TrackingModal order={trackModal.order} onClose={() => setTrackModal(null)} />
      )}
    </div>
  );
}

// ─── Live tracking modal ──────────────────────────────────────────
// Calls the admin shipping `track` action (which queries UPS/USPS live and
// syncs the shipment row), then renders the latest status + event timeline.
interface TrackingEvent {
  status: string;
  description: string;
  location: string;
  date: string;
  time: string;
}
interface TrackingResult {
  trackingNumber: string;
  status: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  events: TrackingEvent[];
}

function TrackingModal({ order, onClose }: { order: StorefrontOrder; onClose: () => void }) {
  const sh = order.shipment;
  const trackingNumber = sh?.trackingNumber || '';
  const carrier = sh?.carrier || 'USPS';
  const externalUrl = carrierTrackingUrl(carrier, trackingNumber);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<TrackingResult | null>(null);

  const refresh = useCallback(async () => {
    if (!trackingNumber) {
      setError('No tracking number on this order yet.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'track', trackingNumber, carrier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Tracking lookup failed');
      setTracking(data.tracking as TrackingResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not fetch tracking.');
    } finally {
      setLoading(false);
    }
  }, [trackingNumber, carrier]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-[color:var(--aw-surface)] rounded-xl w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[color:var(--aw-border)] flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--aw-text-strong)]">Live Tracking · {order.shortId}</h3>
            <p className="text-xs text-[color:var(--aw-text-muted)] mt-0.5 font-mono">
              {carrier} · {trackingNumber || '—'}
            </p>
          </div>
          <button onClick={onClose} className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] text-xl leading-none">×</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center">
              <div className="loading-spinner mx-auto mb-3" />
              <p className="text-sm text-[color:var(--aw-text-muted)]">Fetching live status…</p>
            </div>
          ) : error ? (
            <div className="py-6 text-center">
              <p className="text-sm text-[color:var(--aw-danger)] mb-3">{error}</p>
              {externalUrl && (
                <a href={externalUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[color:var(--aw-navy)] underline">
                  Open on {carrier} website →
                </a>
              )}
            </div>
          ) : tracking ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-[color:var(--aw-surface-muted)] rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Status</p>
                  <p className="text-sm font-semibold text-[color:var(--aw-text-strong)] capitalize">{String(tracking.status).replace(/_/g, ' ').toLowerCase()}</p>
                </div>
                <div className="bg-[color:var(--aw-surface-muted)] rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">
                    {tracking.actualDelivery ? 'Delivered' : 'Est. delivery'}
                  </p>
                  <p className="text-sm font-semibold text-[color:var(--aw-text-strong)]">
                    {tracking.actualDelivery || tracking.estimatedDelivery || '—'}
                  </p>
                </div>
              </div>

              {tracking.events.length > 0 ? (
                <ol className="relative border-l border-[color:var(--aw-border)] ml-2">
                  {tracking.events.map((ev, i) => (
                    <li key={i} className="ml-4 pb-4 last:pb-0">
                      <span className={`absolute -left-1.5 w-3 h-3 rounded-full ${i === 0 ? 'bg-[#2D8E5A]' : 'bg-[color:var(--aw-border)]'}`} />
                      <p className="text-xs font-semibold text-[color:var(--aw-text-strong)]">{ev.description || ev.status}</p>
                      <p className="text-[11px] text-[color:var(--aw-text-muted)]">
                        {[ev.location, [ev.date, ev.time].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-[color:var(--aw-text-muted)] text-center py-4">No tracking events yet.</p>
              )}
            </>
          ) : null}
        </div>

        <div className="p-4 border-t border-[color:var(--aw-border)] flex items-center justify-between gap-2">
          {externalUrl ? (
            <a href={externalUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[color:var(--aw-navy)] underline">
              Open on {carrier} website →
            </a>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={refresh} disabled={loading} className="px-3 py-1.5 text-xs font-semibold border border-[color:var(--aw-navy)] text-[color:var(--aw-text-strong)] rounded-md hover:bg-[color:var(--aw-navy)] hover:text-white transition-colors disabled:opacity-50">
              ↻ Refresh
            </button>
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold bg-[color:var(--aw-navy)] text-white rounded-md">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
