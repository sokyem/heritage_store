'use client';

import { useEffect, useState, useCallback } from 'react';

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price: number;
  compareAtPrice: number | null;
  images: string | null;
  sizes: string | null;
  colors: string | null;
  materials: string | null;
  totalStock: number;
  isPublished: boolean;
  isFeatured: boolean;
  isNewArrival: boolean;
  collectionId: string | null;
}

const SUBCATEGORIES = [
  'necklace', 'choker', 'waist-beads', 'bracelet', 'bangle', 'anklet',
  'earrings', 'ear-cuff', 'ring', 'nose-ring', 'headpiece', 'crown',
  'arm-cuff', 'brooch', 'pendant', 'body-chain', 'cufflinks',
  'bag', 'clutch', 'belt', 'scarf', 'headwrap', 'hat', 'other',
];
const MATERIALS_LIST = [
  'African Brass', 'Copper', 'Gold', 'Gold-Plated', 'Silver', 'Bronze',
  'Cowrie Shells', 'African Trade Beads', 'Coral Beads', 'Krobo Beads',
  'Bone', 'Wood', 'Horn', 'Raffia', 'Leather',
  'Ankara Fabric', 'Kente Cloth', 'Mud Cloth',
  'Pearl', 'Crystal', 'Semi-Precious Stone', 'Amber', 'Turquoise',
  'Other',
];

const EMPTY_FORM = {
  name: '', description: '', category: 'jewelry', subcategory: 'necklace',
  price: 0, compareAtPrice: 0, images: '', sizes: '', colors: '', materials: '',
  totalStock: 0, isPublished: false, isFeatured: false, isNewArrival: false,
};

function fmtCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function JewelryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [subFilter, setSubFilter] = useState('');
  const [editing, setEditing] = useState<(typeof EMPTY_FORM & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/products?category=jewelry,accessories')
      .then((r) => { if (!r.ok) throw new Error('Failed to load'); return r.json(); })
      .then((d) => setProducts(Array.isArray(d) ? d : d.products || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.subcategory || '').toLowerCase().includes(q);
    const matchSub = !subFilter || p.subcategory === subFilter;
    return matchSearch && matchSub;
  });

  const totalValue = products.reduce((s, p) => s + p.price * p.totalStock, 0);
  const published = products.filter((p) => p.isPublished).length;

  const stats = [
    { label: 'Total Items', value: products.length, color: '#1B2A5B' },
    { label: 'Published', value: published, color: '#22C55E' },
    { label: 'Total Stock', value: products.reduce((s, p) => s + p.totalStock, 0), color: '#6366F1' },
    { label: 'Inventory Value', value: fmtCurrency(totalValue), color: '#F59E0B' },
  ];

  async function save() {
    if (!editing || !editing.name) return;
    setSaving(true);
    const isNew = !editing.id;
    const url = isNew ? '/api/admin/products' : `/api/admin/products/${editing.id}`;
    try {
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      if (!res.ok) throw new Error('Save failed');
      setEditing(null);
      load();
    } catch { setError('Failed to save product'); }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this product?')) return;
    await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    load();
  }

  async function togglePublish(p: Product) {
    await fetch(`/api/admin/products/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPublished: !p.isPublished }) });
    load();
  }

  function editProduct(p: Product) {
    setEditing({
      id: p.id, name: p.name, description: p.description || '', category: p.category,
      subcategory: p.subcategory || '', price: p.price, compareAtPrice: p.compareAtPrice || 0,
      images: p.images || '', sizes: p.sizes || '', colors: p.colors || '',
      materials: p.materials || '', totalStock: p.totalStock, isPublished: p.isPublished,
      isFeatured: p.isFeatured, isNewArrival: p.isNewArrival,
    });
  }

  return (
    <div className="p-5 lg:p-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>African Jewelry &amp; Accessories</h1>
          <p className="text-[13px] text-[color:var(--aw-text-muted)] mt-0.5">Handcrafted African jewelry, beadwork, and accessories</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ ...EMPTY_FORM })}>+ Add Item</button>
      </div>

      {/* Stats */}
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 max-w-2xl">
        {stats.map((s) => (
          <div key={s.label} className="aw-stat">
            <dt>{s.label}</dt>
            <dd style={{ color: s.color }}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input className="input-field text-base py-2.5 flex-1 max-w-md" placeholder="Search African jewelry & accessories..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input-field text-base py-2.5 max-w-xs" value={subFilter} onChange={(e) => setSubFilter(e.target.value)}>
          <option value="">All Types</option>
          {SUBCATEGORIES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {error && <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] rounded-lg px-4 py-3 mb-5 text-sm">{error}</div>}

      {/* Grid */}
      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : filtered.length === 0 ? (
        <div className="aw-panel p-10 text-center text-[color:var(--aw-text-muted)]">No African jewelry or accessories found. Add your first piece.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            let imgUrl: string | null = null;
            try { const imgs = JSON.parse(p.images || '[]'); imgUrl = imgs[0] || null; } catch { /* */ }
            return (
              <div key={p.id} className="card overflow-hidden">
                <div className="h-44 bg-[color:var(--aw-surface-muted)] flex items-center justify-center" style={imgUrl ? { backgroundImage: `url(${imgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
                  {!imgUrl && <span className="text-4xl opacity-30">�</span>}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-[15px] font-semibold text-[color:var(--aw-text-strong)] leading-tight">{p.name}</h3>
                      <p className="text-xs text-[color:var(--aw-text-muted)]">{p.sku} · {p.subcategory || 'uncategorized'}</p>
                    </div>
                    <div className="flex gap-1">
                      {p.isFeatured && <span className="text-xs px-1.5 py-0.5 rounded bg-[#F59E0B]/10 text-[color:var(--aw-warning)]">★</span>}
                      {p.isNewArrival && <span className="text-xs px-1.5 py-0.5 rounded bg-[#3B82F6]/10 text-[#3B82F6]">New</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-bold text-[color:var(--aw-text-strong)]">{fmtCurrency(p.price)}</span>
                    {p.compareAtPrice && p.compareAtPrice > p.price && <span className="text-sm text-[color:var(--aw-text-faint)] line-through">{fmtCurrency(p.compareAtPrice)}</span>}
                  </div>
                  <div className="flex items-center justify-between text-xs text-[color:var(--aw-text-muted)]">
                    <span>Stock: {p.totalStock}</span>
                    <button className={`px-2 py-0.5 rounded-full font-medium ${p.isPublished ? 'bg-[#22C55E]/10 text-[color:var(--aw-success)]' : 'bg-[#9CA3AF]/10 text-[color:var(--aw-text-faint)]'}`} onClick={() => togglePublish(p)}>{p.isPublished ? 'Published' : 'Draft'}</button>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-[color:var(--aw-border)]">
                    <button className="text-xs px-3 py-1.5 rounded-lg border border-[#E8E3DB] text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-surface-muted)] flex-1" onClick={() => editProduct(p)}>Edit</button>
                    <button className="text-xs px-3 py-1.5 rounded-lg border border-[#C41E3A] text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger)]/5" onClick={() => remove(p.id)}>Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ Edit/Create Modal ══ */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/20" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-xl bg-white rounded-xl shadow-xl my-8">
            <div className="sticky top-0 bg-white rounded-t-xl border-b border-[color:var(--aw-border)] px-6 py-5 flex justify-between items-center z-10">
              <h2 className="text-lg font-bold text-[color:var(--aw-text-strong)]">{editing.id ? 'Edit Item' : 'New Item'}</h2>
              <button className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] text-2xl" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Name *</label><input className="input-field text-base py-2.5 w-full" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Description</label><textarea className="input-field text-sm py-2 w-full" rows={3} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Category</label>
                  <select className="input-field text-sm py-2 w-full" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                    <option value="jewelry">African Jewelry</option>
                    <option value="accessories">Accessories</option>
                    <option value="beadwork">Beadwork</option>
                    <option value="headwear">Headwear &amp; Crowns</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Type</label>
                  <select className="input-field text-sm py-2 w-full" value={editing.subcategory} onChange={(e) => setEditing({ ...editing, subcategory: e.target.value })}>
                    {SUBCATEGORIES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Price *</label><input className="input-field text-sm py-2 w-full" type="number" step="0.01" value={editing.price || ''} onChange={(e) => setEditing({ ...editing, price: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Compare At</label><input className="input-field text-sm py-2 w-full" type="number" step="0.01" value={editing.compareAtPrice || ''} onChange={(e) => setEditing({ ...editing, compareAtPrice: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Stock</label><input className="input-field text-sm py-2 w-full" type="number" value={editing.totalStock || ''} onChange={(e) => setEditing({ ...editing, totalStock: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Materials</label><input className="input-field text-sm py-2 w-full" placeholder='e.g. ["Gold", "Pearl"]' value={editing.materials} onChange={(e) => setEditing({ ...editing, materials: e.target.value })} /><p className="text-xs text-[color:var(--aw-text-muted)] mt-1">Options: {MATERIALS_LIST.join(', ')}</p></div>
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Images (JSON array of URLs)</label><input className="input-field text-sm py-2 w-full" placeholder='["https://..."]' value={editing.images} onChange={(e) => setEditing({ ...editing, images: e.target.value })} /></div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isPublished} onChange={(e) => setEditing({ ...editing, isPublished: e.target.checked })} /> Published</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isFeatured} onChange={(e) => setEditing({ ...editing, isFeatured: e.target.checked })} /> Featured</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isNewArrival} onChange={(e) => setEditing({ ...editing, isNewArrival: e.target.checked })} /> New Arrival</label>
              </div>
              <div className="flex gap-3 justify-end pt-4 border-t border-[color:var(--aw-border)]">
                <button className="text-sm px-5 py-2.5 rounded-lg border border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn-primary text-sm px-6 py-2.5" onClick={save} disabled={saving || !editing.name}>{saving ? 'Saving…' : editing.id ? 'Update' : 'Create'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
