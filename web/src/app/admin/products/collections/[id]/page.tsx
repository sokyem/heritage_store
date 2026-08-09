'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { resolveStorefrontImage } from '@/lib/storefront-media';

interface AdminProductLite {
  id: string;
  name: string;
  sku: string;
  price: number;
  images: string | null;
  slug: string | null;
  category?: string | null;
  isPublished: boolean;
  collectionId: string | null;
  collection?: { name: string; slug?: string } | null;
}

// images is a JSON string — either ["url", ...] or [{ url, ... }, ...].
function firstImage(images: string | null): string {
  if (!images) return '';
  try {
    const v = JSON.parse(images);
    if (!Array.isArray(v) || v.length === 0) return '';
    const first = v[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && typeof first.url === 'string') return first.url;
    return '';
  } catch {
    return '';
  }
}

type ViewMode = 'grid' | 'list';
type Tab = 'in' | 'out' | 'all';

export default function ManageCollectionProductsPage() {
  const params = useParams<{ id: string }>();
  const collectionId = params?.id;

  const [collectionName, setCollectionName] = useState('');
  const [products, setProducts] = useState<AdminProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>('grid');
  const [tab, setTab] = useState<Tab>('in');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true);
    try {
      const [collRes, prodRes] = await Promise.all([
        fetch(`/api/admin/collections/${collectionId}`),
        fetch('/api/admin/products'),
      ]);
      const collData = await collRes.json();
      const prodData = await prodRes.json();
      setCollectionName(collData?.name || 'Collection');
      const list = Array.isArray(prodData) ? prodData : prodData.products || [];
      setProducts(list);
    } catch {
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Assign/clear a product's collection via the existing products PUT,
  // optimistic with revert on failure.
  async function setMembership(productId: string, inCollection: boolean) {
    if (!collectionId) return;
    const newCollectionId = inCollection ? collectionId : null;
    setSavingId(productId);
    setError(null);
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, collectionId: newCollectionId } : p))
    );
    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId: newCollectionId }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, collectionId: inCollection ? null : collectionId } : p
        )
      );
      setError('Could not update that product. Please try again.');
    } finally {
      setSavingId(null);
    }
  }

  const inCount = useMemo(
    () => products.filter((p) => p.collectionId === collectionId).length,
    [products, collectionId]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const isIn = p.collectionId === collectionId;
      if (tab === 'in' && !isIn) return false;
      if (tab === 'out' && isIn) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [products, collectionId, tab, search]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'in', label: `In this collection (${inCount})` },
    { key: 'out', label: 'Add products' },
    { key: 'all', label: 'All products' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link
        href="/admin/products/collections"
        className="text-sm text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] mb-3 inline-block"
      >
        ← Back to Collections
      </Link>

      <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1">
        {collectionName ? `Manage: ${collectionName}` : 'Manage Collection'}
      </h1>
      <p className="text-sm text-[color:var(--aw-text-muted)] mb-6">
        Add or remove products in this collection
      </p>

      {error && (
        <div className="mb-4 p-3 bg-[color:var(--aw-danger-soft)] text-[color:var(--aw-danger)] rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Toolbar: tabs + search + view toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex gap-1 border-b border-[color:var(--aw-border)] flex-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-[color:var(--aw-navy)] text-[color:var(--aw-text-strong)]'
                  : 'border-transparent text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or SKU…"
          className="input-field text-sm py-2 sm:max-w-[220px]"
        />
        <div className="flex rounded-md border border-[color:var(--aw-border)] overflow-hidden shrink-0">
          <button
            onClick={() => setView('grid')}
            className={`px-3 py-2 text-sm ${
              view === 'grid'
                ? 'bg-[color:var(--aw-navy)] text-white'
                : 'text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-bg)]'
            }`}
          >
            ▦ Grid
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-2 text-sm ${
              view === 'list'
                ? 'bg-[color:var(--aw-navy)] text-white'
                : 'text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-bg)]'
            }`}
          >
            ☰ List
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[color:var(--aw-text-muted)]">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-[color:var(--aw-text-muted)]">
          {tab === 'in'
            ? 'No products in this collection yet. Use “Add products” to add some.'
            : search
            ? 'No products match your search.'
            : 'No products found.'}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {visible.map((p) => {
            const isIn = p.collectionId === collectionId;
            const img = resolveStorefrontImage(firstImage(p.images), { category: p.category, slug: p.slug });
            const inOther = !isIn && !!p.collectionId;
            return (
              <div key={p.id} className="card overflow-hidden flex flex-col">
                <div className="relative h-40 w-full bg-[color:var(--aw-bg)] flex items-center justify-center">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[color:var(--aw-text-faint)] text-xs">No image</span>
                  )}
                  {!p.isPublished && (
                    <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[color:var(--aw-warning-soft)] text-[color:var(--aw-warning)]">
                      Draft
                    </span>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] line-clamp-1">
                    {p.name}
                  </h3>
                  <p className="text-xs text-[color:var(--aw-text-faint)] mb-1">
                    {p.sku} · ${p.price.toFixed(2)}
                  </p>
                  {inOther && (
                    <p className="text-[11px] text-[color:var(--aw-text-muted)] mb-2">
                      In: {p.collection?.name}
                    </p>
                  )}
                  <button
                    onClick={() => setMembership(p.id, !isIn)}
                    disabled={savingId === p.id}
                    className={`mt-auto text-xs font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 ${
                      isIn
                        ? 'bg-[color:var(--aw-danger-soft)] text-[color:var(--aw-danger)] hover:bg-[#FECACA]'
                        : 'bg-[color:var(--aw-navy)] text-white hover:opacity-90'
                    }`}
                  >
                    {savingId === p.id ? '…' : isIn ? 'Remove' : inOther ? 'Move here' : 'Add'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card divide-y divide-[color:var(--aw-border)]">
          {visible.map((p) => {
            const isIn = p.collectionId === collectionId;
            const img = resolveStorefrontImage(firstImage(p.images), { category: p.category, slug: p.slug });
            const inOther = !isIn && !!p.collectionId;
            return (
              <div key={p.id} className="flex items-center gap-3 p-3">
                <div className="h-12 w-12 shrink-0 rounded bg-[color:var(--aw-bg)] overflow-hidden flex items-center justify-center">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[color:var(--aw-text-faint)] text-[10px]">—</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[color:var(--aw-text-strong)] truncate">
                    {p.name}
                    {!p.isPublished && (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[color:var(--aw-warning-soft)] text-[color:var(--aw-warning)]">
                        Draft
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[color:var(--aw-text-faint)]">
                    {p.sku} · ${p.price.toFixed(2)}
                    {inOther && <span className="ml-2">· In: {p.collection?.name}</span>}
                  </p>
                </div>
                <button
                  onClick={() => setMembership(p.id, !isIn)}
                  disabled={savingId === p.id}
                  className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 ${
                    isIn
                      ? 'bg-[color:var(--aw-danger-soft)] text-[color:var(--aw-danger)] hover:bg-[#FECACA]'
                      : 'bg-[color:var(--aw-navy)] text-white hover:opacity-90'
                  }`}
                >
                  {savingId === p.id ? '…' : isIn ? 'Remove' : inOther ? 'Move here' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
