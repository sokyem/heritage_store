'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AdminErrorBanner,
  AdminPageHeader,
  PaginationFooter,
  SearchToolbar,
  SortableHeader,
  SkeletonRow,
  buildCrumbs,
} from '@/components/admin';
import { usePathname } from 'next/navigation';
import { showErrorToast, showSuccessToast } from '@/components/Toast';

interface Client {
  id: string;
  clientId: string;
  name: string;
  phone: string | null;
  instagram: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
  _count?: { orders: number };
}

const EMPTY: Partial<Client> = { name: '', phone: '', instagram: '', email: '', city: '', notes: '' };

export default function ClientsPage() {
  type SortableColumn = 'clientId' | 'name' | 'createdAt' | 'vipTier';

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Client> | null>(null);
  const [saving, setSaving] = useState(false);

  // Server-side pagination + sort
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<SortableColumn>('clientId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortDir,
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/clients?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Clients failed to load (${res.status})`);
      }
      const data = await res.json();
      // Accept the new paginated envelope; fall back to bare array if an
      // older API version is still in front of us during a rolling deploy.
      if (Array.isArray(data)) {
        setClients(data);
        setTotal(data.length);
        setTotalPages(1);
      } else {
        setClients(Array.isArray(data.items) ? data.items : []);
        setTotal(typeof data.total === 'number' ? data.total : 0);
        setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortDir, search]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 whenever the search changes so we don't sit on an
  // empty page after narrowing the query.
  useEffect(() => { setPage(1); }, [search]);

  function toggleSort(col: SortableColumn) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'createdAt' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  // Server already filtered; this is just a no-op alias for readability.
  const filtered = clients;

  async function save() {
    if (!editing || !editing.name) return;
    setSaving(true);
    const isNew = !editing.id;
    const url = isNew ? '/api/admin/clients' : `/api/admin/clients/${editing.id}`;
    const method = isNew ? 'POST' : 'PUT';
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Save failed (${res.status})`);
      }
      showSuccessToast(isNew ? 'Customer added' : 'Customer updated', editing.name || '');
      setEditing(null);
      load();
    } catch (err) {
      showErrorToast('Save failed', err instanceof Error ? err.message : 'Could not save customer');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this client?')) return;
    try {
      const res = await fetch(`/api/admin/clients/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Delete failed (${res.status})`);
      }
      load();
    } catch (err) {
      showErrorToast('Delete failed', err instanceof Error ? err.message : 'Could not delete customer');
    }
  }

  const pathname = usePathname();

  return (
    <div>
      <AdminPageHeader
        title="Customers"
        subtitle={`${total || clients.length} total · ${clients.length} on this page`}
        breadcrumbs={buildCrumbs(pathname || '/admin/clients')}
      >
        <button
          className="aw-focus inline-flex items-center gap-2 px-3 py-2 rounded-[var(--aw-radius-md)] border border-[color:var(--aw-border-strong)] bg-white text-[color:var(--aw-text-strong)] text-sm font-semibold hover:bg-[color:var(--aw-cream)] transition-colors"
          onClick={() => {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            const qs = params.toString();
            window.location.href = `/api/admin/clients/export${qs ? `?${qs}` : ''}`;
          }}
        >
          Export CSV
        </button>
        <button className="aw-focus inline-flex items-center gap-2 px-4 py-2 rounded-[var(--aw-radius-md)] bg-[color:var(--aw-navy)] text-white text-sm font-semibold hover:bg-[color:var(--aw-navy-dark)] transition-colors shadow-[var(--aw-shadow-sm)]" onClick={() => setEditing({ ...EMPTY })}>
          + Add Customer
        </button>
      </AdminPageHeader>

      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        <SearchToolbar
          value={search}
          onChange={setSearch}
          placeholder="Search by name, ID, email, phone, or Instagram…"
        />

        <AdminErrorBanner message={loadError} onRetry={load} />

        <div className="bg-[color:var(--aw-surface)] rounded-[var(--aw-radius-lg)] shadow-[var(--aw-shadow-sm)] border border-[color:var(--aw-border)] overflow-hidden">
          <table className="w-full aw-table-hover">
            <thead>
              <tr className="border-b border-[color:var(--aw-border)] bg-[color:var(--aw-surface-muted)]">
                <SortableHeader column="clientId" label="ID" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHeader column="name" label="Name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">Phone</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">Instagram</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">City</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">Orders</th>
                <th className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRow cols={7} count={6} cellPadding="px-4 py-4" />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-base text-[color:var(--aw-text-muted)]">
                    No customers found
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-b border-[color:var(--aw-border)] last:border-0">
                    <td className="px-4 py-4 text-[15px] font-semibold text-[color:var(--aw-text-strong)]">{c.clientId}</td>
                    <td className="px-4 py-4 text-[15px] text-[color:var(--aw-text)]">{c.name}</td>
                    <td className="px-4 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{c.phone || '—'}</td>
                    <td className="px-4 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{c.instagram || '—'}</td>
                    <td className="px-4 py-4 text-[15px] text-[color:var(--aw-text-muted)]">{c.city || '—'}</td>
                    <td className="px-4 py-4 text-[15px] font-medium text-[color:var(--aw-text-strong)]">{c._count?.orders ?? 0}</td>
                    <td className="px-4 py-4 text-right space-x-2">
                      <button
                        className="aw-focus text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-surface-muted)] text-sm font-medium px-3 py-1.5 rounded-[var(--aw-radius-sm)] transition-colors"
                        onClick={() => setEditing(c)}
                      >
                        Edit
                      </button>
                      <button
                        className="aw-focus text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger-soft)] text-sm font-medium px-3 py-1.5 rounded-[var(--aw-radius-sm)] transition-colors"
                        onClick={() => remove(c.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          totalPages={totalPages}
          total={total}
          label="customer"
          onPageChange={setPage}
          loading={loading}
        />

      {/* Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl p-7 w-full max-w-lg mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-5">{editing.id ? 'Edit Client' : 'New Client'}</h2>
            <div className="space-y-4">
              {(['name', 'phone', 'instagram', 'email', 'city'] as const).map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1 capitalize">{field}</label>
                  <input
                    className="input-field text-base py-2.5"
                    value={(editing as Record<string, string>)[field] || ''}
                    onChange={(e) => setEditing({ ...editing, [field]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Notes</label>
                <textarea
                  className="input-field text-base py-2.5"
                  rows={2}
                  value={editing.notes || ''}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-outline text-base px-5 py-2.5" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary text-base px-5 py-2.5" onClick={save} disabled={saving || !editing.name}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
