'use client';

/* ══════════════════════════════════════════════════════════════════
   AWULA_K — Marketing / Storefront Control
   Manage homepage featured placements, banners, and collections.
   ══════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminPageHeader,
  AdminCard,
  AdminModal,
  StatCard,
  AdminEmptyState,
} from '@/components/admin';

/* ══════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════ */

interface AdminProductLite {
  id: string;
  sku: string;
  name: string;
  price: number;
  images: string | null;
  category: string;
  isPublished?: boolean;
  slug?: string | null;
}

interface FeaturedPlacement {
  id: string;
  productId: string;
  section: string;
  position: number;
  title: string | null;
  subtitle: string | null;
  ctaText: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  product?: AdminProductLite;
}

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  images: string | null;
  linkUrl: string | null;
  position: string;
  sortOrder: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
}

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

type TabKey = 'featured' | 'banners' | 'collections';

/* ══════════════════════════════════════════════════════════
   Constants & helpers
   ══════════════════════════════════════════════════════════ */

const FEATURED_SECTIONS = [
  { key: 'homepage_hero', label: 'Homepage Hero' },
  { key: 'homepage_grid', label: 'Homepage Grid' },
  { key: 'new_arrivals', label: 'New Arrivals' },
  { key: 'trending', label: 'Trending' },
  { key: 'editor_pick', label: "Editor's Pick" },
] as const;

const BANNER_POSITIONS = [
  { key: 'hero', label: 'Hero Banner' },
  { key: 'announcement', label: 'Announcement Bar' },
  { key: 'promo_strip', label: 'Promo Strip' },
] as const;

const sectionLabel = (key: string) =>
  FEATURED_SECTIONS.find((s) => s.key === key)?.label || key;

const positionLabel = (key: string) =>
  BANNER_POSITIONS.find((p) => p.key === key)?.label || key;

function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === 'string');
  } catch {
    if (typeof raw === 'string' && raw.startsWith('http')) return [raw];
  }
  return [];
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function toDateInput(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ══════════════════════════════════════════════════════════
   Empty form templates
   ══════════════════════════════════════════════════════════ */

const EMPTY_FEATURED = {
  productId: '',
  section: 'homepage_hero',
  position: 0,
  title: '',
  subtitle: '',
  ctaText: '',
  startDate: '',
  endDate: '',
  isActive: true,
};

const EMPTY_BANNER = {
  title: '',
  subtitle: '',
  imageUrl: '',
  images: [] as string[],
  linkUrl: '',
  position: 'hero',
  sortOrder: 0,
  isActive: true,
  startDate: '',
  endDate: '',
};

// A banner's images are stored as a JSON array; older rows may only have a
// single imageUrl. Normalize either form to a string[].
function parseBannerImages(images?: string | null, fallback?: string | null): string[] {
  if (images) {
    try {
      const a = JSON.parse(images);
      if (Array.isArray(a)) return a.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    } catch {}
  }
  return fallback ? [fallback] : [];
}

const EMPTY_COLLECTION = {
  name: '',
  slug: '',
  description: '',
  image: '',
  season: '',
  sortOrder: 0,
  isActive: true,
};

/* ══════════════════════════════════════════════════════════
   Reusable UI bits
   ══════════════════════════════════════════════════════════ */

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span className="relative inline-block w-9 h-5">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={`absolute inset-0 rounded-full transition-colors ${
            checked ? 'bg-[color:var(--aw-navy)]' : 'bg-gray-300'
          }`}
        />
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
      {label && <span className="text-sm text-gray-600">{label}</span>}
    </label>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-1.5">
      {children}
      {required && <span className="text-[color:var(--aw-danger)] ml-0.5">*</span>}
    </label>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Page Component
   ══════════════════════════════════════════════════════════ */

export default function MarketingPage() {
  const [tab, setTab] = useState<TabKey>('featured');

  const [featured, setFeatured] = useState<FeaturedPlacement[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [products, setProducts] = useState<AdminProductLite[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Modal state
  const [featuredForm, setFeaturedForm] = useState<typeof EMPTY_FEATURED & { id?: string } | null>(null);
  const [bannerForm, setBannerForm] = useState<typeof EMPTY_BANNER & { id?: string } | null>(null);
  const [collectionForm, setCollectionForm] = useState<typeof EMPTY_COLLECTION & { id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [uploading, setUploading] = useState(false);

  /* ── Load all data ── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, b, c, p] = await Promise.all([
        fetch('/api/admin/featured').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/admin/banners').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/admin/collections').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/admin/products').then((r) => (r.ok ? r.json() : [])),
      ]);
      setFeatured(Array.isArray(f) ? f : []);
      setBanners(Array.isArray(b) ? b : []);
      setCollections(Array.isArray(c) ? c : []);
      setProducts(Array.isArray(p) ? p : []);
    } catch (err) {
      console.error(err);
      setError('Failed to load marketing data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /* ── Toast helper ── */
  function flashToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  /* ── Image upload helper ──
     Sends a file picked from the admin's computer to /api/admin/upload
     (Cloudinary) and returns the hosted URL. Returns null on failure. */
  async function uploadImage(file: File): Promise<string | null> {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return null;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'image');
      fd.append('folder', 'marketing');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data.url as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  }

  /* ── Stats ── */
  const stats = useMemo(() => {
    const activeBanners = banners.filter((b) => b.isActive).length;
    const featuredCount = featured.filter((f) => f.isActive).length;
    const activeCollections = collections.filter((c) => c.isActive).length;
    const newArrivals = featured.filter((f) => f.section === 'new_arrivals' && f.isActive).length;
    return { activeBanners, featuredCount, activeCollections, newArrivals };
  }, [banners, featured, collections]);

  /* ══════════════════════════════════════════════════════════
     Featured Placements — CRUD
     ══════════════════════════════════════════════════════════ */

  async function saveFeatured() {
    if (!featuredForm) return;
    if (!featuredForm.productId) {
      setError('Please select a product');
      return;
    }
    if (!featuredForm.section) {
      setError('Please select a section');
      return;
    }

    setSaving(true);
    setError(null);
    const isNew = !featuredForm.id;
    const url = isNew
      ? '/api/admin/featured'
      : `/api/admin/featured/${featuredForm.id}`;
    try {
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...featuredForm,
          position: Number(featuredForm.position) || 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      setFeaturedForm(null);
      await loadAll();
      flashToast(isNew ? 'Featured product added' : 'Featured product updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save featured product';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleFeatured(item: FeaturedPlacement) {
    try {
      const res = await fetch(`/api/admin/featured/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!res.ok) throw new Error();
      await loadAll();
    } catch {
      setError('Failed to toggle');
    }
  }

  async function deleteFeatured(id: string) {
    if (!confirm('Remove this featured placement?')) return;
    try {
      const res = await fetch(`/api/admin/featured/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await loadAll();
      flashToast('Featured placement removed');
    } catch {
      setError('Failed to remove');
    }
  }

  async function reorderFeatured(item: FeaturedPlacement, direction: 'up' | 'down') {
    const sectionItems = featured
      .filter((f) => f.section === item.section)
      .sort((a, b) => a.position - b.position);
    const idx = sectionItems.findIndex((f) => f.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sectionItems.length) return;

    const a = sectionItems[idx];
    const b = sectionItems[swapIdx];

    // Optimistic update
    setFeatured((prev) =>
      prev.map((f) => {
        if (f.id === a.id) return { ...f, position: b.position };
        if (f.id === b.id) return { ...f, position: a.position };
        return f;
      })
    );

    try {
      await Promise.all([
        fetch(`/api/admin/featured/${a.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: b.position }),
        }),
        fetch(`/api/admin/featured/${b.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: a.position }),
        }),
      ]);
    } catch {
      setError('Failed to reorder');
      loadAll();
    }
  }

  /* ══════════════════════════════════════════════════════════
     Banners — CRUD
     ══════════════════════════════════════════════════════════ */

  async function saveBanner() {
    if (!bannerForm) return;
    if (!bannerForm.title.trim()) {
      setError('Banner title is required');
      return;
    }

    setSaving(true);
    setError(null);
    const isNew = !bannerForm.id;
    const url = isNew ? '/api/admin/banners' : `/api/admin/banners/${bannerForm.id}`;
    try {
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bannerForm,
          sortOrder: Number(bannerForm.sortOrder) || 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save banner');
      }
      setBannerForm(null);
      await loadAll();
      flashToast(isNew ? 'Banner created' : 'Banner updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save banner';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleBanner(b: Banner) {
    try {
      const res = await fetch(`/api/admin/banners/${b.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !b.isActive }),
      });
      if (!res.ok) throw new Error();
      await loadAll();
    } catch {
      setError('Failed to toggle banner');
    }
  }

  async function deleteBanner(id: string) {
    if (!confirm('Delete this banner?')) return;
    try {
      const res = await fetch(`/api/admin/banners/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await loadAll();
      flashToast('Banner deleted');
    } catch {
      setError('Failed to delete banner');
    }
  }

  /* ══════════════════════════════════════════════════════════
     Collections — CRUD
     ══════════════════════════════════════════════════════════ */

  async function saveCollection() {
    if (!collectionForm) return;
    if (!collectionForm.name.trim()) {
      setError('Collection name is required');
      return;
    }

    setSaving(true);
    setError(null);
    const isNew = !collectionForm.id;
    const url = isNew ? '/api/admin/collections' : `/api/admin/collections/${collectionForm.id}`;
    try {
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...collectionForm,
          sortOrder: Number(collectionForm.sortOrder) || 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save collection');
      }
      setCollectionForm(null);
      setSlugTouched(false);
      await loadAll();
      flashToast(isNew ? 'Collection created' : 'Collection updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save collection';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCollection(c: Collection) {
    try {
      const res = await fetch(`/api/admin/collections/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      if (!res.ok) throw new Error();
      await loadAll();
    } catch {
      setError('Failed to toggle collection');
    }
  }

  async function deleteCollection(id: string) {
    if (!confirm('Delete this collection? Products will not be deleted.')) return;
    try {
      const res = await fetch(`/api/admin/collections/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await loadAll();
      flashToast('Collection deleted');
    } catch {
      setError('Failed to delete collection');
    }
  }

  /* ══════════════════════════════════════════════════════════
     Tab navigation handler
     ══════════════════════════════════════════════════════════ */

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'featured', label: 'Featured Products', count: featured.length },
    { key: 'banners', label: 'Banners', count: banners.length },
    { key: 'collections', label: 'Collections', count: collections.length },
  ];

  function openCreateForCurrentTab() {
    if (tab === 'featured') setFeaturedForm({ ...EMPTY_FEATURED });
    if (tab === 'banners') setBannerForm({ ...EMPTY_BANNER });
    if (tab === 'collections') {
      setCollectionForm({ ...EMPTY_COLLECTION });
      setSlugTouched(false);
    }
  }

  /* ══════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-[color:var(--aw-bg)]">
      <AdminPageHeader
        title="Storefront Control"
        subtitle="Manage homepage, featured products & banners"
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Marketing' },
        ]}
      >
        <button
          className="btn-primary text-sm px-5 py-2.5 inline-flex items-center gap-2"
          onClick={openCreateForCurrentTab}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {tab === 'featured' && 'Add Featured Product'}
          {tab === 'banners' && 'Add Banner'}
          {tab === 'collections' && 'Add Collection'}
        </button>
      </AdminPageHeader>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* ── Stats Row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Active Banners"
            value={stats.activeBanners}
            color="#1B2A5B"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            }
          />
          <StatCard
            label="Featured Products"
            value={stats.featuredCount}
            color="#C41E3A"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.075 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            }
          />
          <StatCard
            label="Active Collections"
            value={stats.activeCollections}
            color="#2D8E5A"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
          />
          <StatCard
            label="New Arrivals"
            value={stats.newArrivals}
            color="#D97706"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="bg-[color:var(--aw-danger)]/10 border border-[#C41E3A]/20 text-[color:var(--aw-danger)] rounded-lg px-4 py-3 mb-5 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-[color:var(--aw-danger)] hover:opacity-70" aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {/* ── Toast ── */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 bg-[color:var(--aw-navy)] text-white px-5 py-3 rounded-lg shadow-lg text-sm animate-fade-in">
            {toast}
          </div>
        )}

        {/* ── Tab Switcher ── */}
        <div className="flex gap-1 bg-white border border-gray-200/60 rounded-lg p-1 mb-6 w-fit shadow-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-[color:var(--aw-navy)] text-white shadow-sm'
                  : 'text-gray-500 hover:text-[color:var(--aw-text-strong)]'
              }`}
            >
              {t.label}
              <span className={`ml-2 text-xs ${tab === t.key ? 'opacity-80' : 'opacity-60'}`}>
                ({t.count})
              </span>
            </button>
          ))}
        </div>

        {/* ── Loading ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="loading-spinner" />
          </div>
        ) : (
          <>
            {/* ═══════════════════════════════════════════════════
                TAB 1 — Featured Products
                ═══════════════════════════════════════════════════ */}
            {tab === 'featured' && (
              <FeaturedTab
                featured={featured}
                onAdd={() => setFeaturedForm({ ...EMPTY_FEATURED })}
                onEdit={(f) =>
                  setFeaturedForm({
                    id: f.id,
                    productId: f.productId,
                    section: f.section,
                    position: f.position,
                    title: f.title || '',
                    subtitle: f.subtitle || '',
                    ctaText: f.ctaText || '',
                    startDate: toDateInput(f.startDate),
                    endDate: toDateInput(f.endDate),
                    isActive: f.isActive,
                  })
                }
                onToggle={toggleFeatured}
                onDelete={deleteFeatured}
                onReorder={reorderFeatured}
              />
            )}

            {/* ═══════════════════════════════════════════════════
                TAB 2 — Banners
                ═══════════════════════════════════════════════════ */}
            {tab === 'banners' && (
              <BannersTab
                banners={banners}
                onAdd={() => setBannerForm({ ...EMPTY_BANNER })}
                onEdit={(b) =>
                  setBannerForm({
                    id: b.id,
                    title: b.title,
                    subtitle: b.subtitle || '',
                    imageUrl: b.imageUrl || '',
                    images: parseBannerImages(b.images, b.imageUrl),
                    linkUrl: b.linkUrl || '',
                    position: b.position,
                    sortOrder: b.sortOrder,
                    isActive: b.isActive,
                    startDate: toDateInput(b.startDate),
                    endDate: toDateInput(b.endDate),
                  })
                }
                onToggle={toggleBanner}
                onDelete={deleteBanner}
              />
            )}

            {/* ═══════════════════════════════════════════════════
                TAB 3 — Collections
                ═══════════════════════════════════════════════════ */}
            {tab === 'collections' && (
              <CollectionsTab
                collections={collections}
                onAdd={() => {
                  setCollectionForm({ ...EMPTY_COLLECTION });
                  setSlugTouched(false);
                }}
                onEdit={(c) => {
                  setCollectionForm({
                    id: c.id,
                    name: c.name,
                    slug: c.slug || '',
                    description: c.description || '',
                    image: c.image || '',
                    season: c.season || '',
                    sortOrder: c.sortOrder,
                    isActive: c.isActive,
                  });
                  setSlugTouched(true);
                }}
                onToggle={toggleCollection}
                onDelete={deleteCollection}
              />
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODAL — Featured Product
          ══════════════════════════════════════════════════════════ */}
      <AdminModal
        isOpen={!!featuredForm}
        onClose={() => setFeaturedForm(null)}
        title={featuredForm?.id ? 'Edit Featured Product' : 'Add Featured Product'}
        size="lg"
        footer={
          <>
            <button
              className="btn-outline text-sm px-5 py-2.5"
              onClick={() => setFeaturedForm(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn-primary text-sm px-6 py-2.5"
              onClick={saveFeatured}
              disabled={saving || !featuredForm?.productId}
            >
              {saving ? 'Saving…' : featuredForm?.id ? 'Save Changes' : 'Add Featured'}
            </button>
          </>
        }
      >
        {featuredForm && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Section</FieldLabel>
                <select
                  className="input-field text-sm py-2.5 w-full"
                  value={featuredForm.section}
                  onChange={(e) => setFeaturedForm({ ...featuredForm, section: e.target.value })}
                >
                  {FEATURED_SECTIONS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Position</FieldLabel>
                <input
                  type="number"
                  className="input-field text-sm py-2.5 w-full"
                  value={featuredForm.position}
                  onChange={(e) =>
                    setFeaturedForm({ ...featuredForm, position: parseInt(e.target.value) || 0 })
                  }
                  min={0}
                />
              </div>
            </div>

            <div>
              <FieldLabel required>Product</FieldLabel>
              <select
                className="input-field text-sm py-2.5 w-full"
                value={featuredForm.productId}
                onChange={(e) => setFeaturedForm({ ...featuredForm, productId: e.target.value })}
              >
                <option value="">— Select a product —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.sku} · ${p.price}
                  </option>
                ))}
              </select>
              {products.length === 0 && (
                <p className="text-xs text-gray-400 mt-1.5">
                  No products found. Create one in the Products page first.
                </p>
              )}
            </div>

            <div>
              <FieldLabel>Title Override (optional)</FieldLabel>
              <input
                className="input-field text-sm py-2.5 w-full"
                placeholder="Override the product name on this section"
                value={featuredForm.title}
                onChange={(e) => setFeaturedForm({ ...featuredForm, title: e.target.value })}
              />
            </div>

            <div>
              <FieldLabel>Subtitle</FieldLabel>
              <input
                className="input-field text-sm py-2.5 w-full"
                placeholder="e.g. New summer collection"
                value={featuredForm.subtitle}
                onChange={(e) => setFeaturedForm({ ...featuredForm, subtitle: e.target.value })}
              />
            </div>

            <div>
              <FieldLabel>CTA Text</FieldLabel>
              <input
                className="input-field text-sm py-2.5 w-full"
                placeholder="e.g. Shop Now"
                value={featuredForm.ctaText}
                onChange={(e) => setFeaturedForm({ ...featuredForm, ctaText: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Start Date</FieldLabel>
                <input
                  type="date"
                  className="input-field text-sm py-2.5 w-full"
                  value={featuredForm.startDate}
                  onChange={(e) => setFeaturedForm({ ...featuredForm, startDate: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel>End Date</FieldLabel>
                <input
                  type="date"
                  className="input-field text-sm py-2.5 w-full"
                  value={featuredForm.endDate}
                  onChange={(e) => setFeaturedForm({ ...featuredForm, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-700">Active</span>
              <Toggle
                checked={featuredForm.isActive}
                onChange={(v) => setFeaturedForm({ ...featuredForm, isActive: v })}
              />
            </div>
          </div>
        )}
      </AdminModal>

      {/* ══════════════════════════════════════════════════════════
          MODAL — Banner
          ══════════════════════════════════════════════════════════ */}
      <AdminModal
        isOpen={!!bannerForm}
        onClose={() => setBannerForm(null)}
        title={bannerForm?.id ? 'Edit Banner' : 'Add Banner'}
        size="lg"
        footer={
          <>
            <button
              className="btn-outline text-sm px-5 py-2.5"
              onClick={() => setBannerForm(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn-primary text-sm px-6 py-2.5"
              onClick={saveBanner}
              disabled={saving || !bannerForm?.title?.trim()}
            >
              {saving ? 'Saving…' : bannerForm?.id ? 'Save Changes' : 'Add Banner'}
            </button>
          </>
        }
      >
        {bannerForm && (
          <div className="space-y-5">
            <div>
              <FieldLabel required>Title</FieldLabel>
              <input
                className="input-field text-sm py-2.5 w-full"
                value={bannerForm.title}
                onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                placeholder="Banner headline"
              />
            </div>

            <div>
              <FieldLabel>Subtitle</FieldLabel>
              <input
                className="input-field text-sm py-2.5 w-full"
                value={bannerForm.subtitle}
                onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                placeholder="Supporting text"
              />
            </div>

            <div>
              <FieldLabel>Banner Images</FieldLabel>
              {bannerForm.images.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {bannerForm.images.map((url, i) => (
                    <div key={`${url}-${i}`} className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Banner image ${i + 1}`} className="w-full h-24 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      {i === 0 && (
                        <span className="absolute top-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[color:var(--aw-navy)] text-white">Primary</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setBannerForm((prev) => (prev ? { ...prev, images: prev.images.filter((_, j) => j !== i) } : prev))}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove image"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              <label
                className={`inline-flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-lg border whitespace-nowrap cursor-pointer ${
                  uploading
                    ? 'border-gray-200 text-gray-400 cursor-wait'
                    : 'border-[color:var(--aw-navy)] text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/5'
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    for (const f of files) {
                      const url = await uploadImage(f);
                      if (url) setBannerForm((prev) => (prev ? { ...prev, images: [...prev.images, url] } : prev));
                    }
                  }}
                />
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {uploading ? 'Uploading…' : 'Upload image(s)'}
              </label>
              <p className="text-xs text-gray-400 mt-1.5">
                Upload one or more JPG/PNG images (max 10MB each). The first is the primary; multiple images rotate on the homepage tile.
              </p>
            </div>

            <div>
              <FieldLabel>Link URL</FieldLabel>
                <input
                  className="input-field text-sm py-2.5 w-full"
                  value={bannerForm.linkUrl}
                  onChange={(e) => setBannerForm({ ...bannerForm, linkUrl: e.target.value })}
                  placeholder="/collections/summer"
                />
            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Position</FieldLabel>
                <select
                  className="input-field text-sm py-2.5 w-full"
                  value={bannerForm.position}
                  onChange={(e) => setBannerForm({ ...bannerForm, position: e.target.value })}
                >
                  {BANNER_POSITIONS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Sort Order</FieldLabel>
                <input
                  type="number"
                  className="input-field text-sm py-2.5 w-full"
                  value={bannerForm.sortOrder}
                  onChange={(e) =>
                    setBannerForm({ ...bannerForm, sortOrder: parseInt(e.target.value) || 0 })
                  }
                  min={0}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Start Date</FieldLabel>
                <input
                  type="date"
                  className="input-field text-sm py-2.5 w-full"
                  value={bannerForm.startDate}
                  onChange={(e) => setBannerForm({ ...bannerForm, startDate: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel>End Date</FieldLabel>
                <input
                  type="date"
                  className="input-field text-sm py-2.5 w-full"
                  value={bannerForm.endDate}
                  onChange={(e) => setBannerForm({ ...bannerForm, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-700">Active</span>
              <Toggle
                checked={bannerForm.isActive}
                onChange={(v) => setBannerForm({ ...bannerForm, isActive: v })}
              />
            </div>
          </div>
        )}
      </AdminModal>

      {/* ══════════════════════════════════════════════════════════
          MODAL — Collection
          ══════════════════════════════════════════════════════════ */}
      <AdminModal
        isOpen={!!collectionForm}
        onClose={() => {
          setCollectionForm(null);
          setSlugTouched(false);
        }}
        title={collectionForm?.id ? 'Edit Collection' : 'Add Collection'}
        size="lg"
        footer={
          <>
            <button
              className="btn-outline text-sm px-5 py-2.5"
              onClick={() => {
                setCollectionForm(null);
                setSlugTouched(false);
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn-primary text-sm px-6 py-2.5"
              onClick={saveCollection}
              disabled={saving || !collectionForm?.name?.trim()}
            >
              {saving ? 'Saving…' : collectionForm?.id ? 'Save Changes' : 'Add Collection'}
            </button>
          </>
        }
      >
        {collectionForm && (
          <div className="space-y-5">
            <div>
              <FieldLabel required>Name</FieldLabel>
              <input
                className="input-field text-sm py-2.5 w-full"
                value={collectionForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setCollectionForm({
                    ...collectionForm,
                    name,
                    slug: slugTouched ? collectionForm.slug : slugify(name),
                  });
                }}
                placeholder="e.g. Summer Collection 2026"
              />
            </div>

            <div>
              <FieldLabel>Slug</FieldLabel>
              <input
                className="input-field text-sm py-2.5 w-full font-mono"
                value={collectionForm.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setCollectionForm({ ...collectionForm, slug: e.target.value });
                }}
                placeholder="auto-generated from name"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Used in URLs: /collections/<span className="font-mono">{collectionForm.slug || 'your-slug'}</span>
              </p>
            </div>

            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                className="input-field text-sm py-2.5 w-full"
                rows={3}
                value={collectionForm.description}
                onChange={(e) => setCollectionForm({ ...collectionForm, description: e.target.value })}
                placeholder="Short description shown on the collection page"
              />
            </div>

            <div>
              <FieldLabel>Collection Image</FieldLabel>
              <div className="flex gap-2">
                <input
                  className="input-field text-sm py-2.5 flex-1"
                  value={collectionForm.image}
                  onChange={(e) => setCollectionForm({ ...collectionForm, image: e.target.value })}
                  placeholder="Paste an image URL, or upload →"
                />
                <label
                  className={`flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-lg border whitespace-nowrap cursor-pointer ${
                    uploading
                      ? 'border-gray-200 text-gray-400 cursor-wait'
                      : 'border-[color:var(--aw-navy)] text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/5'
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const url = await uploadImage(f);
                      if (url) setCollectionForm((prev) => (prev ? { ...prev, image: url } : prev));
                    }}
                  />
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {uploading ? 'Uploading…' : 'Upload'}
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Upload a JPG or PNG from your computer (max 10MB), or paste an image URL.
              </p>
              {collectionForm.image && (
                <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={collectionForm.image}
                    alt="Collection preview"
                    className="w-full h-32 object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Season</FieldLabel>
                <input
                  className="input-field text-sm py-2.5 w-full"
                  value={collectionForm.season}
                  onChange={(e) => setCollectionForm({ ...collectionForm, season: e.target.value })}
                  placeholder="e.g. SS2026"
                />
              </div>
              <div>
                <FieldLabel>Sort Order</FieldLabel>
                <input
                  type="number"
                  className="input-field text-sm py-2.5 w-full"
                  value={collectionForm.sortOrder}
                  onChange={(e) =>
                    setCollectionForm({ ...collectionForm, sortOrder: parseInt(e.target.value) || 0 })
                  }
                  min={0}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-700">Active</span>
              <Toggle
                checked={collectionForm.isActive}
                onChange={(v) => setCollectionForm({ ...collectionForm, isActive: v })}
              />
            </div>
          </div>
        )}
      </AdminModal>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeIn 200ms ease-out; }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB COMPONENT — Featured Products
   ══════════════════════════════════════════════════════════ */

function FeaturedTab({
  featured,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  onReorder,
}: {
  featured: FeaturedPlacement[];
  onAdd: () => void;
  onEdit: (item: FeaturedPlacement) => void;
  onToggle: (item: FeaturedPlacement) => void;
  onDelete: (id: string) => void;
  onReorder: (item: FeaturedPlacement, dir: 'up' | 'down') => void;
}) {
  if (featured.length === 0) {
    return (
      <AdminCard padding="p-0">
        <AdminEmptyState
          title="No featured products yet"
          description="Promote products to the homepage by placing them in featured sections like Hero, Trending, or Editor's Pick."
          actionLabel="Add Featured Product"
          onAction={onAdd}
        />
      </AdminCard>
    );
  }

  return (
    <div className="space-y-6">
      {FEATURED_SECTIONS.map((section) => {
        const items = featured
          .filter((f) => f.section === section.key)
          .sort((a, b) => a.position - b.position);

        return (
          <AdminCard
            key={section.key}
            title={section.label}
            subtitle={`${items.length} ${items.length === 1 ? 'placement' : 'placements'}`}
            padding="p-5"
          >
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                No placements in this section yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item, idx) => (
                  <FeaturedCard
                    key={item.id}
                    item={item}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < items.length - 1}
                    onEdit={() => onEdit(item)}
                    onToggle={() => onToggle(item)}
                    onDelete={() => onDelete(item.id)}
                    onMoveUp={() => onReorder(item, 'up')}
                    onMoveDown={() => onReorder(item, 'down')}
                  />
                ))}
              </div>
            )}
          </AdminCard>
        );
      })}

      {/* Render any unknown sections too */}
      {(() => {
        const unknown = featured.filter(
          (f) => !FEATURED_SECTIONS.some((s) => s.key === f.section)
        );
        if (unknown.length === 0) return null;
        return (
          <AdminCard title="Other Sections" padding="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {unknown.map((item) => (
                <FeaturedCard
                  key={item.id}
                  item={item}
                  canMoveUp={false}
                  canMoveDown={false}
                  onEdit={() => onEdit(item)}
                  onToggle={() => onToggle(item)}
                  onDelete={() => onDelete(item.id)}
                  onMoveUp={() => {}}
                  onMoveDown={() => {}}
                />
              ))}
            </div>
          </AdminCard>
        );
      })()}
    </div>
  );
}

function FeaturedCard({
  item,
  canMoveUp,
  canMoveDown,
  onEdit,
  onToggle,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  item: FeaturedPlacement;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const images = parseImages(item.product?.images);
  const heroImg = images[0];
  const productName = item.title || item.product?.name || 'Unknown product';

  return (
    <div className="border border-gray-200/70 rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow flex flex-col">
      {/* Image / placeholder */}
      <div className="relative h-40 bg-[color:var(--aw-bg)] flex items-center justify-center">
        {heroImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImg} alt={productName} className="w-full h-full object-cover" />
        ) : (
          <div className="text-3xl font-semibold text-[color:var(--aw-text-strong)]/30" style={{ fontFamily: 'var(--font-heading)' }}>
            {productName.charAt(0).toUpperCase()}
          </div>
        )}
        {/* Position badge */}
        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 flex items-center gap-1 shadow-sm">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="text-gray-500 hover:text-[color:var(--aw-text-strong)] disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
            aria-label="Move up"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className="text-xs font-semibold text-[color:var(--aw-text-strong)] mx-0.5">#{item.position}</span>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="text-gray-500 hover:text-[color:var(--aw-text-strong)] disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
            aria-label="Move down"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        {/* Active dot */}
        <div className="absolute top-2 right-2">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${
              item.isActive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                item.isActive ? 'bg-emerald-500' : 'bg-gray-400'
              }`}
            />
            {item.isActive ? 'Live' : 'Off'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col">
        <h4 className="text-sm font-semibold text-[color:var(--aw-text-strong)] line-clamp-1">{productName}</h4>
        {item.product?.sku && (
          <p className="text-xs text-gray-400 mt-0.5">{item.product.sku}</p>
        )}
        {item.subtitle && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.subtitle}</p>
        )}
        {item.product?.price != null && (
          <p className="text-sm font-semibold text-[color:var(--aw-text-strong)] mt-2">
            ${item.product.price.toLocaleString()}
          </p>
        )}
        {(item.startDate || item.endDate) && (
          <p className="text-[11px] text-gray-400 mt-1">
            {item.startDate ? formatDate(item.startDate) : 'now'} – {item.endDate ? formatDate(item.endDate) : 'ongoing'}
          </p>
        )}

        {/* Actions */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <Toggle checked={item.isActive} onChange={onToggle} />
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="text-xs text-gray-500 hover:text-[color:var(--aw-text-strong)] px-2 py-1 rounded hover:bg-gray-100"
              aria-label="Edit"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-xs text-[color:var(--aw-danger)] hover:text-[#9c1730] px-2 py-1 rounded hover:bg-[color:var(--aw-danger)]/10"
              aria-label="Remove"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB COMPONENT — Banners
   ══════════════════════════════════════════════════════════ */

function BannersTab({
  banners,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: {
  banners: Banner[];
  onAdd: () => void;
  onEdit: (b: Banner) => void;
  onToggle: (b: Banner) => void;
  onDelete: (id: string) => void;
}) {
  if (banners.length === 0) {
    return (
      <AdminCard padding="p-0">
        <AdminEmptyState
          title="No banners yet"
          description="Create banners for the hero section, announcement bar, or promo strip to drive attention across the storefront."
          actionLabel="Add Banner"
          onAction={onAdd}
        />
      </AdminCard>
    );
  }

  return (
    <div className="space-y-6">
      {BANNER_POSITIONS.map((pos) => {
        const items = banners
          .filter((b) => b.position === pos.key)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        return (
          <AdminCard
            key={pos.key}
            title={pos.label}
            subtitle={`${items.length} ${items.length === 1 ? 'banner' : 'banners'}`}
            padding="p-5"
          >
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                No {pos.label.toLowerCase()} yet.
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((b) => (
                  <BannerCard
                    key={b.id}
                    banner={b}
                    onEdit={() => onEdit(b)}
                    onToggle={() => onToggle(b)}
                    onDelete={() => onDelete(b.id)}
                  />
                ))}
              </div>
            )}
          </AdminCard>
        );
      })}

      {/* Unknown positions */}
      {(() => {
        const unknown = banners.filter(
          (b) => !BANNER_POSITIONS.some((p) => p.key === b.position)
        );
        if (unknown.length === 0) return null;
        return (
          <AdminCard title="Other Positions" padding="p-5">
            <div className="space-y-3">
              {unknown.map((b) => (
                <BannerCard
                  key={b.id}
                  banner={b}
                  onEdit={() => onEdit(b)}
                  onToggle={() => onToggle(b)}
                  onDelete={() => onDelete(b.id)}
                />
              ))}
            </div>
          </AdminCard>
        );
      })()}
    </div>
  );
}

function BannerCard({
  banner,
  onEdit,
  onToggle,
  onDelete,
}: {
  banner: Banner;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const hasSchedule = !!banner.startDate || !!banner.endDate;

  return (
    <div className="border border-gray-200/70 rounded-lg p-4 flex flex-col sm:flex-row gap-4 hover:shadow-sm transition-shadow bg-white">
      {/* Image */}
      <div className="w-full sm:w-32 h-24 sm:h-20 flex-shrink-0 rounded-md overflow-hidden bg-[color:var(--aw-bg)] flex items-center justify-center">
        {banner.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={banner.imageUrl}
            alt={banner.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="text-2xl font-semibold text-[color:var(--aw-text-strong)]/30" style={{ fontFamily: 'var(--font-heading)' }}>
            {banner.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h4 className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{banner.title}</h4>
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              banner.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${banner.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            {banner.isActive ? 'Live' : 'Off'}
          </span>
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">
            Order #{banner.sortOrder}
          </span>
        </div>
        {banner.subtitle && (
          <p className="text-xs text-gray-500 line-clamp-1">{banner.subtitle}</p>
        )}
        {banner.linkUrl && (
          <p className="text-xs text-gray-400 mt-1 font-mono truncate">→ {banner.linkUrl}</p>
        )}
        {hasSchedule && (
          <p className="text-[11px] text-gray-400 mt-1">
            <svg className="w-3 h-3 inline mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {banner.startDate ? formatDate(banner.startDate) : 'now'} – {banner.endDate ? formatDate(banner.endDate) : 'ongoing'}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1.5 flex-shrink-0">
        <Toggle checked={banner.isActive} onChange={onToggle} />
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="text-xs text-gray-500 hover:text-[color:var(--aw-text-strong)] px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger)]/10 px-2.5 py-1 rounded border border-[#C41E3A]/30"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   TAB COMPONENT — Collections
   ══════════════════════════════════════════════════════════ */

function CollectionsTab({
  collections,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: {
  collections: Collection[];
  onAdd: () => void;
  onEdit: (c: Collection) => void;
  onToggle: (c: Collection) => void;
  onDelete: (id: string) => void;
}) {
  if (collections.length === 0) {
    return (
      <AdminCard padding="p-0">
        <AdminEmptyState
          title="No collections yet"
          description="Organize products into seasonal or themed collections shoppers can browse."
          actionLabel="Add Collection"
          onAction={onAdd}
        />
      </AdminCard>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {collections
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => (
          <CollectionCard
            key={c.id}
            collection={c}
            onEdit={() => onEdit(c)}
            onToggle={() => onToggle(c)}
            onDelete={() => onDelete(c.id)}
          />
        ))}
    </div>
  );
}

function CollectionCard({
  collection,
  onEdit,
  onToggle,
  onDelete,
}: {
  collection: Collection;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white border border-gray-200/70 rounded-lg overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      {/* Image / initial */}
      <div className="relative h-40 bg-[color:var(--aw-bg)] flex items-center justify-center">
        {collection.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={collection.image}
            alt={collection.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span
            className="text-5xl font-semibold text-[color:var(--aw-text-strong)]/30"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {collection.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="absolute top-2 right-2">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${
              collection.isActive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                collection.isActive ? 'bg-emerald-500' : 'bg-gray-400'
              }`}
            />
            {collection.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h4 className="text-sm font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>
            {collection.name}
          </h4>
        </div>
        {collection.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{collection.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-auto">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--aw-text-strong)] bg-[color:var(--aw-navy)]/8 px-2 py-1 rounded">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            {collection._count?.products ?? 0} products
          </span>
          {collection.season && (
            <span className="inline-flex items-center text-[11px] font-medium text-[#D97706] bg-[#D97706]/10 px-2 py-1 rounded">
              {collection.season}
            </span>
          )}
          {collection.slug && (
            <span className="inline-flex items-center text-[11px] font-mono text-gray-400 truncate">
              /{collection.slug}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <Toggle checked={collection.isActive} onChange={onToggle} />
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="text-xs text-gray-500 hover:text-[color:var(--aw-text-strong)] px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-xs text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger)]/10 px-2.5 py-1 rounded border border-[#C41E3A]/30"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
