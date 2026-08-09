'use client';

import { useEffect, useState, useCallback } from 'react';

interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  images: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  isNewArrival: boolean;
}

interface FeaturedPlacement {
  id: string;
  productId: string;
  section: string;
  position: number;
  title: string | null;
  subtitle: string | null;
  ctaText: string | null;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  product?: { name: string; sku: string; price: number; images: string | null };
}

const SECTIONS = [
  { key: 'homepage_hero', label: 'Homepage Hero', description: 'Large hero banner section' },
  { key: 'homepage_grid', label: 'Homepage Grid', description: 'Featured product grid' },
  { key: 'new_arrivals', label: 'New Arrivals', description: 'Latest African designs' },
  { key: 'trending', label: 'Trending', description: 'Popular African pieces' },
  { key: 'editor_pick', label: "Editor's Pick", description: 'Curated by our stylist' },
  { key: 'traditional_collection', label: 'Traditional Collection', description: 'Heritage African pieces' },
  { key: 'african_jewelry', label: 'African Jewelry', description: 'Handcrafted jewelry showcase' },
  { key: 'ceremony_ready', label: 'Ceremony Ready', description: 'Wedding & event pieces' },
];

const EMPTY_FORM = { productId: '', section: 'homepage_grid', position: 0, title: '', subtitle: '', ctaText: 'Shop Now', isActive: true, startDate: '', endDate: '' };

export default function FeaturedPage() {
  const [placements, setPlacements] = useState<FeaturedPlacement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<(typeof EMPTY_FORM & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('all');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch('/api/admin/featured').then((r) => r.json()).catch(() => []),
      fetch('/api/admin/products').then((r) => r.json()).then((d) => Array.isArray(d) ? d : d.products || []).catch(() => []),
    ])
      .then(([f, p]) => { setPlacements(f); setProducts(p); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = activeSection === 'all' ? placements : placements.filter((p) => p.section === activeSection);
  const activeCount = placements.filter((p) => p.isActive).length;

  async function save() {
    if (!editing || !editing.productId || !editing.section) return;
    setSaving(true);
    const isNew = !editing.id;
    const url = isNew ? '/api/admin/featured' : `/api/admin/featured/${editing.id}`;
    try {
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      if (!res.ok) throw new Error('Save failed');
      setEditing(null);
      load();
    } catch { setError('Failed to save placement'); }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Remove this featured placement?')) return;
    await fetch(`/api/admin/featured/${id}`, { method: 'DELETE' });
    load();
  }

  async function toggle(f: FeaturedPlacement) {
    await fetch(`/api/admin/featured/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !f.isActive }) });
    load();
  }

  function editPlacement(f: FeaturedPlacement) {
    setEditing({
      id: f.id, productId: f.productId, section: f.section, position: f.position,
      title: f.title || '', subtitle: f.subtitle || '', ctaText: f.ctaText || '',
      isActive: f.isActive, startDate: f.startDate || '', endDate: f.endDate || '',
    });
  }

  return (
    <div className="p-5 lg:p-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>Featured &amp; Merchandising</h1>
          <p className="text-[13px] text-[color:var(--aw-text-muted)] mt-0.5">Curate what customers see — African luxury, front and center</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ ...EMPTY_FORM })}>+ Add Featured</button>
      </div>

      {/* Section filters */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeSection === 'all' ? 'bg-[color:var(--aw-navy)] text-white' : 'bg-[color:var(--aw-surface-muted)] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-border-strong)]'}`} onClick={() => setActiveSection('all')}>All ({placements.length})</button>
        {SECTIONS.map((s) => {
          const c = placements.filter((p) => p.section === s.key).length;
          return (
            <button key={s.key} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeSection === s.key ? 'bg-[color:var(--aw-navy)] text-white' : 'bg-[color:var(--aw-surface-muted)] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-border-strong)]'}`} onClick={() => setActiveSection(s.key)}>
              {s.label} ({c})
            </button>
          );
        })}
      </div>

      {error && <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] rounded-lg px-4 py-3 mb-5 text-sm">{error}</div>}

      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : filtered.length === 0 ? (
        <div className="aw-panel p-10 text-center text-[color:var(--aw-text-muted)]">No featured placements{activeSection !== 'all' ? ` in ${SECTIONS.find((s) => s.key === activeSection)?.label}` : ''}. Add products to showcase on your storefront.</div>
      ) : (
        <div className="space-y-6">
          {/* Group by section when showing all */}
          {activeSection === 'all' ? (
            SECTIONS.map((sec) => {
              const items = filtered.filter((f) => f.section === sec.key).sort((a, b) => a.position - b.position);
              if (!items.length) return null;
              return (
                <div key={sec.key}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{sec.label}</h3>
                    <span className="text-xs text-[color:var(--aw-text-muted)]">— {sec.description}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map((f) => <PlacementCard key={f.id} f={f} onToggle={toggle} onEdit={editPlacement} onRemove={remove} />)}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.sort((a, b) => a.position - b.position).map((f) => <PlacementCard key={f.id} f={f} onToggle={toggle} onEdit={editPlacement} onRemove={remove} />)}
            </div>
          )}
        </div>
      )}

      {/* ══ Create/Edit Modal ══ */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl">
            <div className="border-b border-[color:var(--aw-border)] px-6 py-5 flex justify-between items-center">
              <h2 className="text-lg font-bold text-[color:var(--aw-text-strong)]">{editing.id ? 'Edit Placement' : 'Add Featured Product'}</h2>
              <button className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] text-2xl" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Product *</label>
                <select className="input-field text-base py-2.5 w-full" value={editing.productId} onChange={(e) => setEditing({ ...editing, productId: e.target.value })}>
                  <option value="">Select Product</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Section *</label>
                  <select className="input-field text-sm py-2 w-full" value={editing.section} onChange={(e) => setEditing({ ...editing, section: e.target.value })}>
                    {SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Position</label><input className="input-field text-sm py-2 w-full" type="number" value={editing.position} onChange={(e) => setEditing({ ...editing, position: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Custom Title</label><input className="input-field text-sm py-2 w-full" placeholder="Override product name" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Subtitle</label><input className="input-field text-sm py-2 w-full" value={editing.subtitle} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} /></div>
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">CTA Text</label><input className="input-field text-sm py-2 w-full" value={editing.ctaText} onChange={(e) => setEditing({ ...editing, ctaText: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Start Date</label><input className="input-field text-sm py-2 w-full" type="date" value={editing.startDate} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">End Date</label><input className="input-field text-sm py-2 w-full" type="date" value={editing.endDate} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /><span className="text-sm text-[color:var(--aw-text-muted)]">Active</span></div>
              <div className="flex gap-3 justify-end pt-4 border-t border-[color:var(--aw-border)]">
                <button className="text-sm px-5 py-2.5 rounded-lg border border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn-primary text-sm px-6 py-2.5" onClick={save} disabled={saving || !editing.productId}>{saving ? 'Saving…' : editing.id ? 'Update' : 'Add'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Placement Card ── */
function PlacementCard({ f, onToggle, onEdit, onRemove }: {
  f: FeaturedPlacement;
  onToggle: (f: FeaturedPlacement) => void;
  onEdit: (f: FeaturedPlacement) => void;
  onRemove: (id: string) => void;
}) {
  let imgUrl: string | null = null;
  try { const imgs = JSON.parse(f.product?.images || '[]'); imgUrl = imgs[0] || null; } catch { /* */ }

  return (
    <div className="card overflow-hidden">
      <div className="h-32 bg-[color:var(--aw-surface-muted)] relative" style={imgUrl ? { backgroundImage: `url(${imgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
        {!imgUrl && <div className="flex items-center justify-center h-full"><span className="text-3xl opacity-20">★</span></div>}
        <div className="absolute top-2 left-2 flex gap-1">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/90 text-[color:var(--aw-text-strong)]">#{f.position}</span>
        </div>
        <div className="absolute top-2 right-2">
          <button className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.isActive ? 'bg-[#22C55E]/90 text-white' : 'bg-[#9CA3AF]/90 text-white'}`} onClick={(e) => { e.stopPropagation(); onToggle(f); }}>{f.isActive ? 'Active' : 'Off'}</button>
        </div>
      </div>
      <div className="p-3">
        <h4 className="text-sm font-semibold text-[color:var(--aw-text-strong)] truncate">{f.title || f.product?.name || '—'}</h4>
        <p className="text-xs text-[color:var(--aw-text-muted)]">{f.product?.sku} · ${f.product?.price}</p>
        {f.subtitle && <p className="text-xs text-[color:var(--aw-text-muted)] mt-1 truncate">{f.subtitle}</p>}
        <div className="flex gap-2 mt-2 pt-2 border-t border-[color:var(--aw-border)]">
          <button className="text-xs text-[color:var(--aw-text-strong)] hover:underline" onClick={() => onEdit(f)}>Edit</button>
          <button className="text-xs text-[color:var(--aw-danger)] hover:underline" onClick={() => onRemove(f.id)}>Remove</button>
        </div>
      </div>
    </div>
  );
}
