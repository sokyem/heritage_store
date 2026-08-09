'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Collection {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  image: string | null;
  season: string | null;
  isActive: boolean;
  sortOrder: number;
  _count?: { products: number };
}

const EMPTY_FORM = { name: '', slug: '', description: '', image: '', season: '', isActive: true, sortOrder: 0 };

const SEASONS: { value: string; label: string }[] = [
  { value: 'SS2026', label: 'Spring/Summer 2026' },
  { value: 'FW2026', label: 'Fall/Winter 2026' },
  { value: 'Resort2026', label: 'Resort 2026' },
  { value: 'Heritage', label: 'Heritage Collection' },
  { value: 'Bridal', label: 'Bridal & Ceremonial' },
  { value: 'AfricanPrint', label: 'African Print' },
  { value: 'RoyalSeries', label: 'Royal Series' },
  { value: 'Diaspora', label: 'Diaspora Collection' },
  { value: 'Everyday', label: 'Everyday Luxury' },
  { value: 'Festival', label: 'Festival & Events' },
  { value: 'Capsule', label: 'Capsule Collection' },
];

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<(typeof EMPTY_FORM & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleImageUpload(file: File) {
    if (!editing) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'collections');
      fd.append('type', 'image');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setEditing((prev) => (prev ? { ...prev, image: data.url } : prev));
    } catch (e: any) {
      alert(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/collections')
      .then((r) => r.json())
      .then((c) => setCollections(Array.isArray(c) ? c : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!editing || !editing.name) return;
    setSaving(true);
    const isNew = !editing.id;
    const url = isNew ? '/api/admin/collections' : `/api/admin/collections/${editing.id}`;
    const body = { ...editing, slug: editing.slug || editing.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') };
    try {
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Save failed');
      setEditing(null);
      load();
    } catch { setError('Failed to save collection'); }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this collection? Products will be unlinked.')) return;
    await fetch(`/api/admin/collections/${id}`, { method: 'DELETE' });
    load();
  }

  async function toggleActive(c: Collection) {
    setTogglingId(c.id);
    // optimistic
    setCollections((prev) => prev.map((x) => (x.id === c.id ? { ...x, isActive: !x.isActive } : x)));
    try {
      const res = await fetch(`/api/admin/collections/${c.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setCollections((prev) => prev.map((x) => (x.id === c.id ? { ...x, isActive: c.isActive } : x)));
      setError('Could not update status');
    } finally {
      setTogglingId(null);
    }
  }

  function editCollection(c: Collection) {
    setEditing({ id: c.id, name: c.name, slug: c.slug || '', description: c.description || '', image: c.image || '', season: c.season || '', isActive: c.isActive, sortOrder: c.sortOrder });
  }

  const seasonLabel = (v: string | null) => SEASONS.find((s) => s.value === v)?.label || v;

  const totalProducts = collections.reduce((s, c) => s + (c._count?.products || 0), 0);
  const active = collections.filter((c) => c.isActive).length;
  const sorted = [...collections].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="p-5 lg:p-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>Collections</h1>
          <p className="text-[13px] text-[color:var(--aw-text-muted)] mt-0.5">Curate African heritage collections.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ ...EMPTY_FORM })}>+ New Collection</button>
      </div>

      {/* Stat strip */}
      <dl className="grid grid-cols-3 gap-3 mb-5 max-w-md">
        <div className="aw-stat"><dt>Collections</dt><dd>{collections.length}</dd></div>
        <div className="aw-stat"><dt>Products</dt><dd>{totalProducts}</dd></div>
        <div className="aw-stat"><dt>Active</dt><dd>{active}</dd></div>
      </dl>

      {error && <div className="bg-[color:var(--aw-danger-soft)] text-[color:var(--aw-danger)] rounded-lg px-3 py-2 mb-4 text-sm">{error}</div>}

      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : collections.length === 0 ? (
        <div className="aw-panel p-10 text-center text-[color:var(--aw-text-muted)]">No collections yet. Create your first collection to organize products.</div>
      ) : (
        <div className="aw-panel">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[color:var(--aw-surface-muted)] text-[11px] uppercase tracking-wider text-[color:var(--aw-text-muted)]">
                <th className="font-semibold px-3 py-2.5 w-10"></th>
                <th className="font-semibold px-3 py-2.5">Collection</th>
                <th className="font-semibold px-3 py-2.5 hidden md:table-cell">Season</th>
                <th className="font-semibold px-3 py-2.5 text-center w-24">Products</th>
                <th className="font-semibold px-3 py-2.5 text-center w-24">Status</th>
                <th className="font-semibold px-3 py-2.5 text-right w-48">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--aw-border)]">
              {sorted.map((c) => (
                <tr key={c.id} className="hover:bg-[color:var(--aw-surface-muted)]/60 transition-colors">
                  <td className="px-3 py-2">
                    <div className="w-9 h-9 rounded-md bg-[color:var(--aw-surface-muted)] bg-cover bg-center flex items-center justify-center text-sm overflow-hidden"
                      style={c.image ? { backgroundImage: `url(${c.image})` } : {}}>
                      {!c.image && <span className="opacity-30">🎨</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-[13px] text-[color:var(--aw-text-strong)] leading-tight">{c.name}</div>
                    {c.slug && <div className="text-[11px] text-[color:var(--aw-text-faint)]">/{c.slug}</div>}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    {c.season
                      ? <span className="aw-pill bg-[color:var(--aw-info-soft)] text-[color:var(--aw-info)]">{seasonLabel(c.season)}</span>
                      : <span className="text-[color:var(--aw-text-faint)] text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="font-semibold text-[13px] text-[color:var(--aw-text-strong)]">{c._count?.products || 0}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleActive(c)}
                      disabled={togglingId === c.id}
                      title="Toggle active"
                      className={`aw-pill cursor-pointer disabled:opacity-50 ${c.isActive ? 'bg-[color:var(--aw-success-soft)] text-[color:var(--aw-success)]' : 'bg-black/5 text-[color:var(--aw-text-muted)]'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${c.isActive ? 'bg-[color:var(--aw-success)]' : 'bg-[color:var(--aw-text-faint)]'}`} />
                      {c.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={`/admin/products/collections/${c.id}`} className="btn-xs">Manage</Link>
                      <button className="btn-xs" onClick={() => editCollection(c)}>Edit</button>
                      <button className="btn-xs !border-[color:var(--aw-danger)]/30 !text-[color:var(--aw-danger)] hover:!bg-[color:var(--aw-danger-soft)]" onClick={() => remove(c.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ Edit Modal ══ */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl">
            <div className="border-b border-[color:var(--aw-border)] px-5 py-4 flex justify-between items-center">
              <h2 className="text-base font-bold text-[color:var(--aw-text-strong)]">{editing.id ? 'Edit Collection' : 'New Collection'}</h2>
              <button className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] text-2xl leading-none" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Name *</label><input className="input-field" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Slug</label><input className="input-field" placeholder="auto-generated from name" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></div>
              <div><label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Description</label><textarea className="input-field" rows={3} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Collection Image</label>
                  {editing.image && (
                    <div className="mb-2 relative w-full h-24 rounded-lg overflow-hidden border border-[color:var(--aw-border)] bg-[color:var(--aw-surface-muted)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={editing.image} alt="Collection" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setEditing({ ...editing, image: '' })}
                        className="absolute top-1 right-1 bg-white/90 hover:bg-white text-[color:var(--aw-danger)] text-xs font-semibold px-2 py-1 rounded shadow"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <input
                    className="input-field"
                    placeholder="Image URL or upload below"
                    value={editing.image}
                    onChange={(e) => setEditing({ ...editing, image: e.target.value })}
                  />
                  <label className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-[color:var(--aw-text-strong)] hover:text-[color:var(--aw-danger)] cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {uploading ? 'Uploading…' : 'Upload image'}
                  </label>
                </div>
                <div><label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Season / Theme</label>
                  <select className="input-field" value={editing.season} onChange={(e) => setEditing({ ...editing, season: e.target.value })}>
                    <option value="">Select...</option>
                    {SEASONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">Sort Order</label><input className="input-field" type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: parseInt(e.target.value) || 0 })} /></div>
                <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active</label></div>
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t border-[color:var(--aw-border)]">
                <button className="btn-xs" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn-primary" onClick={save} disabled={saving || !editing.name}>{saving ? 'Saving…' : editing.id ? 'Update' : 'Create'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
