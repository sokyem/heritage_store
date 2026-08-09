'use client';

import { useEffect, useState, useCallback } from 'react';
import AIAssistPanel from '@/components/admin/AIAssistPanel';
import { showErrorToast, showSuccessToast } from '@/components/Toast';
import { parseProductImages, serializeProductImages, type ProductImage } from '@/lib/product-images';
import { resolveStorefrontImage } from '@/lib/storefront-media';
import { getColorHex, cleanColorName } from '@/lib/colors';

/* ══════════════════════════════════════════════════════════
   AWULA K — Admin Products / Catalog Management
   Ready-to-wear, Jewelry, Accessories
   ══════════════════════════════════════════════════════════ */

interface Collection {
  id: string;
  name: string;
}

interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  longDescription: string | null;
  category: string;
  subcategory: string | null;
  gender: string | null;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  images: string | null;
  sizeChartImage: string | null;
  sizeChartData: string | null;
  slug: string | null;
  sizes: string | null;
  colors: string | null;
  materials: string | null;
  trackInventory: boolean;
  totalStock: number;
  colorStock: string | null;
  sizeStock: string | null;
  variantStock: string | null;
  weightLb: number | null;
  isPublished: boolean;
  isFeatured: boolean;
  isNewArrival: boolean;
  allowCustomization: boolean;
  tags: string | null;
  collectionId: string | null;
  collection: Collection | null;
  featuredPlacements?: Array<{ id: string; section: string; isActive: boolean }>;
  _count?: { variants: number };
  createdAt: string;
  updatedAt: string;
}

type FormData = Partial<AdminProduct> & { name?: string; price?: number; category?: string };

const EMPTY_FORM: FormData = {
  name: '', sku: '', description: '', longDescription: '',
  category: 'ready-to-wear', subcategory: '', gender: '',
  price: 0, compareAtPrice: null, costPrice: null,
  images: '', sizeChartImage: '', sizeChartData: '', sizes: '', colors: '', materials: '',
  trackInventory: true, totalStock: 0, colorStock: '', sizeStock: '', variantStock: '',
  isPublished: false, isFeatured: false, isNewArrival: false, allowCustomization: false,
  tags: '', collectionId: '',
};

const CATEGORIES = [
  'ready-to-wear', 'traditional-wear', 'ceremonial', 'jewelry',
  'accessories', 'headwear', 'fabric', 'sportswear',
];
const GENDERS = ['men', 'women', 'unisex'];

const SUBCATEGORIES: Record<string, string[]> = {
  'ready-to-wear': ['dress', 'blouse', 'skirt', 'pants', 'jumpsuit', 'two-piece', 'co-ord set', 'jacket', 'coat'],
  'traditional-wear': ['agbada', 'dashiki', 'kaftan', 'boubou', 'wrapper', 'aso-oke', 'ankara-dress', 'ankara-suit', 'kente-outfit', 'senator'],
  'ceremonial': ['wedding-gown', 'aso-ebi', 'traditional-wedding', 'engagement', 'naming-ceremony', 'chieftaincy'],
  'jewelry': ['necklace', 'bracelet', 'earrings', 'ring', 'anklet', 'waist-beads', 'brooch', 'cufflinks', 'body-chain'],
  'accessories': ['bag', 'clutch', 'belt', 'scarf', 'fan', 'shawl'],
  'headwear': ['gele', 'headwrap', 'crown', 'kufi', 'fila', 'fascinator', 'hat'],
  'fabric': ['ankara', 'kente', 'aso-oke', 'adire', 'mud-cloth', 'kitenge', 'lace', 'brocade'],
  'sportswear': ['home-jersey', 'away-jersey', 'training-jersey', 'shorts', 'tracksuit', 'fan-tee', 'scarf'],
};

const CAT_COLORS: Record<string, string> = {
  'ready-to-wear': '#1B2A5B',
  'traditional-wear': '#8B4513',
  ceremonial: '#7B2D8E',
  jewelry: '#8B6914',
  accessories: '#6B4E3D',
  headwear: '#2D6B5A',
  fabric: '#4A7B5E',
  sportswear: '#CE1126',
};

function formatStorefrontSection(section: string) {
  return section
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseImageList(value?: string | null) {
  // Backward-compat URL list (delegates to shared parser).
  return parseProductImages(value).map((entry) => entry.url);
}

function parseImageEntries(value?: string | null): ProductImage[] {
  return parseProductImages(value);
}

function parseColorList(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    }
  } catch {
    // not JSON — treat as comma-separated fallback
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function parseColorStock(value?: string | null): Record<string, number> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const n = typeof v === 'number' ? v : parseInt(String(v), 10);
        if (Number.isFinite(n)) out[k] = Math.max(0, n);
      }
      return out;
    }
  } catch {
    /* not JSON */
  }
  return {};
}

function parseSizeStock(value?: string | null): Record<string, number> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const n = typeof v === 'number' ? v : parseInt(String(v), 10);
        if (Number.isFinite(n)) out[k] = Math.max(0, n);
      }
      return out;
    }
  } catch {
    /* not JSON */
  }
  return {};
}

// Parse the color×size variant stock matrix.
// JSON shape: { "Yellow": { "M": 5, "L": 10 }, "Red": { "XXXL": 3 } }
function parseVariantStock(value?: string | null): Record<string, Record<string, number>> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, Record<string, number>> = {};
      for (const [color, sizes] of Object.entries(parsed)) {
        if (sizes && typeof sizes === 'object' && !Array.isArray(sizes)) {
          out[color] = {};
          for (const [sz, qty] of Object.entries(sizes as Record<string, unknown>)) {
            const n = typeof qty === 'number' ? qty : parseInt(String(qty), 10);
            out[color][sz] = Number.isFinite(n) ? Math.max(0, n) : 0;
          }
        }
      }
      return out;
    }
  } catch { /* not JSON */ }
  return {};
}

type SizeChartCell = { cm: number | null; in: number | null };
type SizeChartData = {
  unitDetected?: string;
  columns: string[];
  rows: Array<{ size: string; values: Record<string, SizeChartCell> }>;
  notes?: string;
};

function parseSizeChartData(value?: string | null): SizeChartData | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
      return parsed as SizeChartData;
    }
  } catch {
    /* not valid JSON */
  }
  return null;
}

async function uploadProductImage(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'products');
  formData.append('type', 'image');

  const response = await fetch('/api/admin/upload', {
    method: 'POST',
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.url) {
    throw new Error(data?.error || `Could not upload ${file.name}.`);
  }

  return data.url as string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortField, setSortField] = useState<string>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [editing, setEditing] = useState<FormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingSizeChart, setUploadingSizeChart] = useState(false);
  const [convertingChart, setConvertingChart] = useState(false);
  const [sizeChartError, setSizeChartError] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryFolders, setLibraryFolders] = useState<
    Array<{ id: string; label: string; items: Array<{ url: string; name: string; folder: string; size: number; mtime: number }> }>
  >([]);
  const [librarySelection, setLibrarySelection] = useState<string[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryFolder, setLibraryFolder] = useState<string>('shopify');

  useEffect(() => {
    fetch('/api/admin/settings/notifications')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const t = d?.value?.lowStockThreshold;
        if (typeof t === 'number') setLowStockThreshold(t);
      })
      .catch(() => { /* keep default */ });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      fetch('/api/admin/products').then(r => r.json()),
      fetch('/api/admin/collections').then(r => r.json()).catch(() => []),
    ])
      .then(([prods, loadedCollections]) => {
        if (prods.error) { setError(prods.error); return; }
        setProducts(prods);
        setCollections(Array.isArray(loadedCollections) ? loadedCollections : []);
      })
      .catch(() => setError('Failed to load products'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // --- Filtering & Sorting ---
  const filtered = products.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) &&
          !(p.description || '').toLowerCase().includes(q)) return false;
    }
    if (catFilter && p.category !== catFilter) return false;
    if (statusFilter === 'published' && !p.isPublished) return false;
    if (statusFilter === 'draft' && p.isPublished) return false;
    if (genderFilter && p.gender !== genderFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number = '', vb: string | number = '';
    if (sortField === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
    else if (sortField === 'sku') { va = a.sku; vb = b.sku; }
    else if (sortField === 'price') { va = a.price; vb = b.price; }
    else if (sortField === 'totalStock') { va = a.totalStock; vb = b.totalStock; }
    else if (sortField === 'category') { va = a.category; vb = b.category; }
    else { va = a.updatedAt; vb = b.updatedAt; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  // --- Stats ---
  const totalProducts = products.length;
  const publishedCount = products.filter(p => p.isPublished).length;
  const featuredCount = products.filter(p => p.isFeatured).length;
  const lowStockCount = products.filter(p => p.trackInventory && p.totalStock <= lowStockThreshold).length;

  // --- CRUD ---
  async function save() {
    if (!editing || !editing.name) return;
    setSaving(true);
    const isNew = !editing.id;
    const url = isNew ? '/api/admin/products' : `/api/admin/products/${editing.id}`;
    const method = isNew ? 'POST' : 'PUT';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Save failed');
      }
      setEditing(null);
      showSuccessToast(isNew ? 'Product created' : 'Product updated', `${editing.name} has been saved.`);
      load();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save product';
      setError(message);
      showErrorToast('Save failed', message);
    }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      const response = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete product');
      }
      showSuccessToast('Product deleted', 'The product has been removed.');
      load();
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : 'Failed to delete product';
      setError(message);
      showErrorToast('Delete failed', message);
    }
  }

  async function toggleField(p: AdminProduct, field: 'isPublished' | 'isFeatured') {
    try {
      const response = await fetch(`/api/admin/products/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: !p[field] }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update product');
      }

      const label = field === 'isPublished' ? (!p[field] ? 'Product published' : 'Product unpublished') : (!p[field] ? 'Product featured' : 'Product unfeatured');
      showSuccessToast(label, `${p.name} was updated.`);
      load();
    } catch (toggleError) {
      const message = toggleError instanceof Error ? toggleError.message : 'Failed to update product';
      setError(message);
      showErrorToast('Update failed', message);
    }
  }

  function openEdit(p: AdminProduct) {
    setEditing({ ...p });
    setImageUploadError('');
  }

  function openNew() {
    setEditing({ ...EMPTY_FORM });
    setImageUploadError('');
  }

  // --- Field updater ---
  function setField(key: string, value: unknown) {
    setEditing(prev => prev ? { ...prev, [key]: value } : prev);
  }

  // Update one cell of the color×size matrix, then recompute totalStock.
  function setVariantStock(color: string, size: string, qty: number) {
    setEditing(prev => {
      if (!prev) return prev;
      const matrix = parseVariantStock(prev.variantStock);
      if (!matrix[color]) matrix[color] = {};
      matrix[color][size] = Math.max(0, Number.isFinite(qty) ? qty : 0);
      const total = Object.values(matrix).flatMap(Object.values).reduce((s, n) => s + (Number(n) || 0), 0);
      // Also keep legacy colorStock in sync (sum per color) for backward compat.
      const colorMap: Record<string, number> = {};
      for (const [c, sizes] of Object.entries(matrix)) {
        colorMap[c] = Object.values(sizes).reduce((s, n) => s + (Number(n) || 0), 0);
      }
      return { ...prev, variantStock: JSON.stringify(matrix), colorStock: JSON.stringify(colorMap), totalStock: total };
    });
  }

  // Set the stock for one color, persist the map as JSON, and keep totalStock
  // in sync with the sum so existing low-stock reporting keeps working.
  function setColorStock(color: string, qty: number) {
    setEditing(prev => {
      if (!prev) return prev;
      const map = parseColorStock(prev.colorStock);
      const next = { ...map, [color]: Math.max(0, Number.isFinite(qty) ? qty : 0) };
      const total = Object.values(next).reduce((s, n) => s + n, 0);
      return { ...prev, colorStock: JSON.stringify(next), totalStock: total };
    });
  }

  // Set the stock for one size, persist the map as JSON.
  function setSizeStock(size: string, qty: number) {
    setEditing(prev => {
      if (!prev) return prev;
      const map = parseSizeStock(prev.sizeStock);
      const next = { ...map, [size]: Math.max(0, Number.isFinite(qty) ? qty : 0) };
      return { ...prev, sizeStock: JSON.stringify(next) };
    });
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';

    if (!selectedFiles.length || !editing) return;

    const existingEntries = parseImageEntries(editing.images);
    const totalAfterUpload = existingEntries.length + selectedFiles.length;
    if (totalAfterUpload > 8) {
      setImageUploadError('Please upload up to eight product images.');
      return;
    }

    const invalidFile = selectedFiles.find((file) => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024);
    if (invalidFile) {
      setImageUploadError(`Uploads must be image files under 5 MB each. ${invalidFile.name} is ${formatFileSize(invalidFile.size)}.`);
      return;
    }

    try {
      setUploadingImages(true);
      const uploads = await Promise.all(selectedFiles.map((file) => uploadProductImage(file)));
      const nextEntries: ProductImage[] = [
        ...existingEntries,
        ...uploads.map((url) => ({ url } as ProductImage)),
      ];
      setField('images', serializeProductImages(nextEntries));
      setImageUploadError('');
      showSuccessToast('Images uploaded', `${uploads.length} product image${uploads.length === 1 ? '' : 's'} added.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not upload those images.';
      setImageUploadError(message);
      showErrorToast('Upload failed', message);
    } finally {
      setUploadingImages(false);
    }
  }

  function removeImageAt(index: number) {
    if (!editing) return;
    const next = parseImageEntries(editing.images).filter((_, imageIndex) => imageIndex !== index);
    setField('images', next.length ? serializeProductImages(next) : '');
  }

  async function handleSizeChartUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = (event.target.files || [])[0];
    event.target.value = '';
    if (!file || !editing) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setSizeChartError(`The size chart must be an image under 10 MB. ${file.name} is ${formatFileSize(file.size)}.`);
      return;
    }
    try {
      setUploadingSizeChart(true);
      setSizeChartError('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'size-charts');
      formData.append('type', 'image');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Could not upload the size chart.');
      setField('sizeChartImage', data.url);
      // A new chart invalidates any previously converted table.
      setField('sizeChartData', '');
      showSuccessToast('Size chart uploaded', 'Run "AI convert" to extract cm + inch values.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not upload the size chart.';
      setSizeChartError(message);
      showErrorToast('Upload failed', message);
    } finally {
      setUploadingSizeChart(false);
    }
  }

  async function convertSizeChart() {
    if (!editing?.sizeChartImage) return;
    try {
      setConvertingChart(true);
      setSizeChartError('');
      const res = await fetch('/api/admin/products/size-chart/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: editing.sizeChartImage }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'AI conversion failed.');
      setField('sizeChartData', JSON.stringify(data));
      showSuccessToast('Chart converted', 'Both cm and inch values extracted. Review then Save.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI conversion failed.';
      setSizeChartError(message);
      showErrorToast('Conversion failed', message);
    } finally {
      setConvertingChart(false);
    }
  }

  function moveImage(index: number, direction: -1 | 1) {
    if (!editing) return;
    const list = parseImageEntries(editing.images);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    setField('images', serializeProductImages(next));
  }

  function setImageColor(index: number, color: string) {
    if (!editing) return;
    const list = parseImageEntries(editing.images);
    if (!list[index]) return;
    // Strip stray brackets/quotes so pasted JSON-ish text like `["Spider White"`
    // doesn't get persisted verbatim and break swatch rendering downstream.
    const cleaned = cleanColorName(color);
    const next = [...list];
    next[index] = { ...next[index], color: cleaned || null };
    setField('images', serializeProductImages(next));
  }

  async function openLibrary() {
    setLibrarySelection([]);
    setLibrarySearch('');
    setLibraryError('');
    setLibraryOpen(true);
    if (libraryFolders.length) return;
    try {
      setLibraryLoading(true);
      const res = await fetch('/api/admin/media/library');
      if (!res.ok) throw new Error('Could not load media library.');
      const data = await res.json();
      const folders = Array.isArray(data?.folders) ? data.folders : [];
      setLibraryFolders(folders);
      const firstWithItems = folders.find((f: { items: unknown[] }) => f.items.length);
      if (firstWithItems) setLibraryFolder(firstWithItems.id);
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Could not load media library.');
    } finally {
      setLibraryLoading(false);
    }
  }

  function toggleLibrarySelection(url: string) {
    setLibrarySelection((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  }

  function attachLibrarySelection() {
    if (!editing || !librarySelection.length) {
      setLibraryOpen(false);
      return;
    }
    const existing = parseImageEntries(editing.images);
    const existingUrls = new Set(existing.map((e) => e.url));
    const additions = librarySelection
      .filter((url) => !existingUrls.has(url))
      .map((url) => ({ url } as ProductImage));
    const combined = [...existing, ...additions];
    if (combined.length > 8) {
      setImageUploadError('Please keep total product images at 8 or fewer.');
      setLibraryOpen(false);
      return;
    }
    setField('images', serializeProductImages(combined));
    showSuccessToast('Images attached', `${additions.length} image${additions.length === 1 ? '' : 's'} added from library.`);
    setLibraryOpen(false);
  }

  const IMAGE_VIEW_LABELS = ['Front (Primary)', 'Back', 'Side', 'Detail', 'Lifestyle'];
  function viewLabelFor(index: number) {
    return IMAGE_VIEW_LABELS[index] ?? `View ${index + 1}`;
  }

  function applyProductDraft(draft: Record<string, unknown>) {
    setEditing((current) => {
      if (!current) return current;
      return {
        ...current,
        ...draft,
      };
    });
    showSuccessToast('Draft applied', 'Review the generated product details before saving.');
  }

  // --- Render ---
  return (
    <div className="p-5 lg:p-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>Products</h1>
          <p className="text-[13px] text-[color:var(--aw-text-muted)] mt-0.5">African luxury apparel, jewelry &amp; accessories</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="aw-focus inline-flex items-center gap-2 px-3 py-2 rounded-[var(--aw-radius-md)] border border-[color:var(--aw-border-strong)] bg-white text-[color:var(--aw-text-strong)] text-sm font-semibold hover:bg-[color:var(--aw-cream)] transition-colors"
            onClick={() => { window.location.href = '/api/admin/products/export'; }}
          >
            Export CSV
          </button>
          <button className="btn-primary" onClick={openNew}>+ Add Product</button>
        </div>
      </div>

      {/* Stats */}
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 max-w-2xl">
        {[
          { label: 'Total Products', value: totalProducts, color: 'var(--aw-text-strong)' },
          { label: 'Published', value: publishedCount, color: 'var(--aw-success)' },
          { label: 'Featured', value: featuredCount, color: '#8B6914' },
          { label: 'Low Stock', value: lowStockCount, color: 'var(--aw-danger)' },
        ].map(s => (
          <div key={s.label} className="aw-stat">
            <dt>{s.label}</dt>
            <dd style={{ color: s.color }}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          className="input-field text-sm py-2 px-3 w-full sm:w-64"
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input-field text-sm py-2 px-3" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
        </select>
        <select className="input-field text-sm py-2 px-3" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select className="input-field text-sm py-2 px-3" value={genderFilter} onChange={e => setGenderFilter(e.target.value)}>
          <option value="">All Genders</option>
          {GENDERS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
        </select>
        <div className="flex ml-auto border border-[color:var(--aw-border)] rounded-lg overflow-hidden">
          <button
            className={`px-3 py-2 text-xs font-medium ${viewMode === 'grid' ? 'bg-[color:var(--aw-navy)] text-white' : 'bg-white text-[color:var(--aw-text-muted)] hover:bg-[#F5F3EF]'}`}
            onClick={() => setViewMode('grid')}
          >Grid</button>
          <button
            className={`px-3 py-2 text-xs font-medium ${viewMode === 'list' ? 'bg-[color:var(--aw-navy)] text-white' : 'bg-white text-[color:var(--aw-text-muted)] hover:bg-[#F5F3EF]'}`}
            onClick={() => setViewMode('list')}
          >List</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-5 text-sm">
          {error}
          <button className="ml-3 underline" onClick={() => setError('')}>dismiss</button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="loading-spinner" /></div>
      ) : sorted.length === 0 ? (
        /* Empty */
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-[color:var(--aw-cream)] mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-[color:var(--aw-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="text-lg font-medium text-[color:var(--aw-text-strong)] mb-1">No products found</p>
          <p className="text-sm text-[color:var(--aw-text-muted)] mb-4">{products.length > 0 ? 'Try adjusting your filters' : 'Add your first product to get started'}</p>
          {products.length === 0 && (
            <button className="btn-primary text-sm px-5 py-2" onClick={openNew}>+ Add Product</button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ── GRID VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {sorted.map(p => (
            <div key={p.id} className="card overflow-hidden">
              {/* Image — resolved the same way the storefront does (stored image →
                  imported manifest by slug → category fallback), so the admin grid
                  always shows the live-site image instead of a broken icon. */}
              <div className="h-40 bg-[#F5F0E8] flex items-center justify-center relative overflow-hidden">
                <img
                  src={resolveStorefrontImage(parseImageList(p.images)[0], { category: p.category, slug: p.slug })}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
                {/* Status badges */}
                <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                  {p.isPublished && <span className="w-2.5 h-2.5 rounded-full bg-[#2D8E5A]" title="Published" />}
                  {!p.isPublished && <span className="w-2.5 h-2.5 rounded-full bg-[#999]" title="Draft" />}
                  {p.isFeatured && (
                    <span className="text-[#8B6914]" title="Featured">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </span>
                  )}
                </div>
                {p.isNewArrival && (
                  <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider bg-[color:var(--aw-danger)] text-white px-2 py-0.5 rounded">New</span>
                )}
              </div>

              {/* Card body */}
              <div className="p-3">
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] truncate" style={{ fontFamily: 'var(--font-heading)' }}>{p.name}</h3>
                <p className="text-xs text-[color:var(--aw-text-muted)] mt-0.5">{p.sku}</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-base font-semibold text-[color:var(--aw-text-strong)]">${p.price.toFixed(2)}</span>
                  {p.compareAtPrice && p.compareAtPrice > p.price && (
                    <span className="text-xs text-[color:var(--aw-text-muted)] line-through">${p.compareAtPrice.toFixed(2)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{ background: (CAT_COLORS[p.category] || '#8B7569') + '14', color: CAT_COLORS[p.category] || '#8B7569' }}
                  >
                    {p.category.replace(/-/g, ' ')}
                  </span>
                  <span className={`text-xs font-medium ${p.trackInventory && p.totalStock <= 5 ? 'text-[color:var(--aw-danger)]' : 'text-[color:var(--aw-text-muted)]'}`}>
                    {p.trackInventory ? `${p.totalStock} in stock` : 'Untracked'}
                  </span>
                </div>
                {p.featuredPlacements?.length ? (
                  <p className="mt-2 text-[11px] font-medium text-[#8B6914]">
                    Homepage: {p.featuredPlacements.map((placement) => formatStorefrontSection(placement.section)).join(', ')}
                  </p>
                ) : null}
                {/* Actions */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-[color:var(--aw-border)]">
                  <button className="text-xs text-[color:var(--aw-text-strong)] hover:text-[color:var(--aw-danger)] font-medium" onClick={() => openEdit(p)}>Edit</button>
                  <button className="text-xs text-[color:var(--aw-text-muted)] hover:text-[#8B6914] font-medium" onClick={() => toggleField(p, 'isFeatured')}>
                    {p.isFeatured ? 'Unfeature' : 'Feature'}
                  </button>
                  <button className="text-xs text-[color:var(--aw-text-muted)] hover:text-[#2D8E5A] font-medium" onClick={() => toggleField(p, 'isPublished')}>
                    {p.isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <div className="aw-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[color:var(--aw-surface-muted)] border-b border-[color:var(--aw-border)]">
                {[
                  { key: 'sku', label: 'SKU' },
                  { key: 'name', label: 'Name' },
                  { key: 'category', label: 'Category' },
                  { key: 'price', label: 'Price' },
                  { key: 'totalStock', label: 'Stock' },
                ].map(col => (
                  <th
                    key={col.key}
                    className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] cursor-pointer hover:text-[color:var(--aw-text-strong)] select-none"
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    {sortField === col.key && <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)]">Published</th>
                <th className="text-center px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)]">Featured</th>
                <th className="text-center px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)]">New</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr key={p.id} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[#FAFAF7]">
                  <td className="px-4 py-3 text-xs text-[color:var(--aw-text-muted)] font-mono">{p.sku}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[color:var(--aw-text-strong)]">{p.name}</div>
                    {p.featuredPlacements?.length ? (
                      <div className="mt-1 text-[11px] font-medium text-[#8B6914]">
                        Homepage: {p.featuredPlacements.map((placement) => formatStorefrontSection(placement.section)).join(', ')}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{ background: (CAT_COLORS[p.category] || '#8B7569') + '14', color: CAT_COLORS[p.category] || '#8B7569' }}
                    >
                      {p.category.replace(/-/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-[color:var(--aw-text-strong)]">${p.price.toFixed(2)}</span>
                    {p.compareAtPrice && p.compareAtPrice > p.price && (
                      <span className="ml-2 text-xs text-[color:var(--aw-text-muted)] line-through">${p.compareAtPrice.toFixed(2)}</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 font-medium ${p.trackInventory && p.totalStock <= 5 ? 'text-[color:var(--aw-danger)]' : 'text-[#2D2D2D]'}`}>
                    {p.trackInventory ? p.totalStock : '--'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${p.isPublished ? 'bg-[#2D8E5A]' : 'bg-[#CCC]'}`} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {p.isFeatured && (
                      <svg className="w-4 h-4 text-[#8B6914] mx-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {p.isNewArrival && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-[color:var(--aw-danger)] text-white px-1.5 py-0.5 rounded">New</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button className="text-xs text-[color:var(--aw-text-strong)] hover:text-[color:var(--aw-danger)] font-medium" onClick={() => openEdit(p)}>Edit</button>
                      <button className="text-xs text-[color:var(--aw-text-muted)] hover:text-[#8B6914] font-medium" onClick={() => toggleField(p, 'isFeatured')}>
                        {p.isFeatured ? 'Unfeature' : 'Feature'}
                      </button>
                      <button className="text-xs text-[color:var(--aw-text-muted)] hover:text-[#2D8E5A] font-medium" onClick={() => toggleField(p, 'isPublished')}>
                        {p.isPublished ? 'Unpublish' : 'Publish'}
                      </button>
                      <button className="text-xs text-[color:var(--aw-danger)] hover:text-[#9A1830] font-medium" onClick={() => remove(p.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL: Add / Edit Product ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto" style={{ background: 'rgba(15,26,58,0.5)' }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8 mx-4" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--aw-border)]">
              <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>
                {editing.id ? 'Edit Product' : 'Add Product'}
              </h2>
              <button className="p-1 text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-danger)]" onClick={() => setEditing(null)}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
              <AIAssistPanel<Record<string, unknown>>
                title="Draft Product From Requirements"
                helperText="Describe the product in plain English, attach reference photos, or record a short voice note. AI will suggest a structured product draft for review before you save it."
                endpoint="/api/admin/products/ai-draft"
                promptPlaceholder="Example: New women’s ready-to-wear Ankara two-piece set in emerald and gold, crop top plus high-waist skirt, medium stock, launch as a new arrival, target price $180..."
                onApply={applyProductDraft}
              />

              {/* 1. Basic Info */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Basic Info</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Name *</label>
                    <input className="input-field text-sm py-2 w-full" value={editing.name || ''} onChange={e => setField('name', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">SKU</label>
                    <input className="input-field text-sm py-2 w-full" placeholder="Auto-generated if empty" value={editing.sku || ''} onChange={e => setField('sku', e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Description</label>
                    <textarea className="input-field text-sm py-2 w-full" rows={2} value={editing.description || ''} onChange={e => setField('description', e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Long Description</label>
                    <textarea className="input-field text-sm py-2 w-full" rows={3} value={editing.longDescription || ''} onChange={e => setField('longDescription', e.target.value)} />
                  </div>
                </div>
              </fieldset>

              {/* 2. Category */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Category</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Category *</label>
                    {/* Combobox: pick an existing category or type a brand-new one. */}
                    <input
                      className="input-field text-sm py-2 w-full"
                      list="product-category-options"
                      value={editing.category || ''}
                      onChange={e => setField('category', e.target.value)}
                      placeholder="Select or type a new category"
                    />
                    <datalist id="product-category-options">
                      {CATEGORIES.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Subcategory</label>
                    <input
                      className="input-field text-sm py-2 w-full"
                      list="product-subcategory-options"
                      value={editing.subcategory || ''}
                      onChange={e => setField('subcategory', e.target.value)}
                      placeholder="Select or type a new subcategory"
                    />
                    <datalist id="product-subcategory-options">
                      {(SUBCATEGORIES[editing.category || ''] || []).map(s => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Gender</label>
                    <select className="input-field text-sm py-2 w-full" value={editing.gender || ''} onChange={e => setField('gender', e.target.value)}>
                      <option value="">Unspecified</option>
                      {GENDERS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* 3. Pricing */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Pricing</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Price *</label>
                    <input type="number" step="0.01" className="input-field text-sm py-2 w-full" value={editing.price ?? ''} onChange={e => setField('price', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Compare-at Price</label>
                    <input type="number" step="0.01" className="input-field text-sm py-2 w-full" value={editing.compareAtPrice ?? ''} onChange={e => setField('compareAtPrice', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Cost Price</label>
                    <input type="number" step="0.01" className="input-field text-sm py-2 w-full" value={editing.costPrice ?? ''} onChange={e => setField('costPrice', e.target.value)} />
                  </div>
                </div>
              </fieldset>

              {/* 4. Images */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Images</legend>
                <div className="space-y-4">
                  <div className="rounded-xl border border-dashed border-[rgba(27,42,91,0.18)] bg-[#FCFAF7] p-5">
                    <div className="flex items-start gap-4">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(145deg,#1B2A5B,#2C3E7A)] text-white shadow-[0_16px_28px_rgba(27,42,91,0.18)]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V5.25"></path>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 9 3.75-3.75L15.75 9"></path>
                          <rect x="3.75" y="13.5" width="16.5" height="6.75" rx="2"></rect>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 17.25h7.5"></path>
                        </svg>
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[color:var(--aw-text-strong)]">Upload product images</p>
                        <p className="mt-1 text-sm leading-6 text-[#5C3D2E]">Add up to eight views and tag each one with a color (e.g. Red, Yellow, White) so the storefront shows the right photo when shoppers pick that color. The first image is the primary view.</p>
                        <label className="mt-4 inline-flex cursor-pointer items-center rounded-full bg-[color:var(--aw-navy)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#0F1A3A]">
                          Select Images
                          <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                        </label>
                        <button
                          type="button"
                          onClick={openLibrary}
                          className="mt-4 ml-3 inline-flex items-center rounded-full border border-[color:var(--aw-navy)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[color:var(--aw-text-strong)] transition hover:bg-[color:var(--aw-navy)] hover:text-white"
                        >
                          Pick from Library
                        </button>
                        <p className="mt-3 text-xs uppercase tracking-[0.08em] text-[color:var(--aw-text-muted)]">JPEG, PNG, or WebP under 5 MB each</p>
                      </div>
                    </div>
                  </div>

                  {imageUploadError ? <p className="text-sm text-[color:var(--aw-danger)]">{imageUploadError}</p> : null}
                  {uploadingImages ? <p className="text-sm text-[color:var(--aw-text-muted)]">Uploading images...</p> : null}

                  {parseImageEntries(editing.images).length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {parseImageEntries(editing.images).map((entry, index, arr) => {
                        const availableColors = parseColorList(editing.colors);
                        const imgUrl = entry.url;
                        return (
                        <div key={`${imgUrl.slice(0, 32)}-${index}`} className="overflow-hidden rounded-[1rem] border border-[rgba(27,42,91,0.08)] bg-white shadow-[0_14px_28px_rgba(27,42,91,0.08)]">
                          <div className="relative">
                            <img src={imgUrl} alt={`${viewLabelFor(index)} view`} className="h-44 w-full object-cover" />
                            {index === 0 && (
                              <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-[color:var(--aw-navy)] text-white shadow">
                                Primary
                              </span>
                            )}
                            {entry.color ? (
                              <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white/95 text-[color:var(--aw-text-strong)] shadow">
                                {entry.color}
                              </span>
                            ) : null}
                          </div>
                          <div className="px-4 py-3 space-y-2">
                            <p className="truncate text-sm font-semibold text-[color:var(--aw-text-strong)]">{viewLabelFor(index)}</p>
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">
                                Color
                              </label>
                              <select
                                className="input-field text-xs py-1.5 w-full"
                                value={entry.color || ''}
                                onChange={(e) => setImageColor(index, e.target.value)}
                              >
                                <option value="">— Any —</option>
                                {availableColors.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                              {availableColors.length === 0 ? (
                                <p className="mt-1 text-[10px] text-[color:var(--aw-text-muted)]">
                                  Add colors below (Variants → Colors) to tag images.
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveImage(index, -1)}
                                  disabled={index === 0}
                                  title="Move earlier"
                                  className="text-xs font-semibold px-2 py-1 rounded bg-[#F3F4F6] text-[color:var(--aw-text-strong)] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveImage(index, 1)}
                                  disabled={index === arr.length - 1}
                                  title="Move later"
                                  className="text-xs font-semibold px-2 py-1 rounded bg-[#F3F4F6] text-[color:var(--aw-text-strong)] hover:bg-[#E5E7EB] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  ↓
                                </button>
                              </div>
                              <button type="button" onClick={() => removeImageAt(index)} className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--aw-danger)]">
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Stored images payload</label>
                    <textarea className="input-field text-sm py-2 w-full" rows={3} placeholder='["https://..."]' value={editing.images || ''} onChange={e => setField('images', e.target.value)} />
                    <p className="mt-1 text-xs text-[color:var(--aw-text-muted)]">You can still paste or edit the raw JSON array if needed.</p>
                  </div>
                </div>
              </fieldset>

              {/* 4b. Size / Measurement Chart */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Size Chart</legend>
                <div className="space-y-4">
                  <div className="rounded-xl border border-dashed border-[rgba(27,42,91,0.18)] bg-[#FCFAF7] p-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[color:var(--aw-text-strong)]">Measurement chart</p>
                    <p className="mt-1 text-sm leading-6 text-[#5C3D2E]">
                      Upload the size/measurement chart image for this product. Then let AI read it and produce a table with both
                      centimetres and inches — shoppers can toggle units on the product page.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center rounded-full bg-[color:var(--aw-navy)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#0F1A3A]">
                        {editing.sizeChartImage ? 'Replace chart' : 'Upload chart'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleSizeChartUpload} />
                      </label>
                      {editing.sizeChartImage ? (
                        <>
                          <button
                            type="button"
                            onClick={convertSizeChart}
                            disabled={convertingChart}
                            className="inline-flex items-center rounded-full border border-[color:var(--aw-navy)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-[color:var(--aw-text-strong)] transition hover:bg-[color:var(--aw-navy)] hover:text-white disabled:opacity-50"
                          >
                            {convertingChart ? 'Converting…' : '✨ AI convert (cm⇄in)'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setField('sizeChartImage', ''); setField('sizeChartData', ''); }}
                            className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--aw-danger)]"
                          >
                            Remove
                          </button>
                        </>
                      ) : null}
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.08em] text-[color:var(--aw-text-muted)]">JPEG, PNG, or WebP under 10 MB</p>
                  </div>

                  {sizeChartError ? <p className="text-sm text-[color:var(--aw-danger)]">{sizeChartError}</p> : null}
                  {uploadingSizeChart ? <p className="text-sm text-[color:var(--aw-text-muted)]">Uploading chart…</p> : null}

                  {editing.sizeChartImage ? (
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <img
                        src={editing.sizeChartImage}
                        alt="Size chart"
                        className="h-auto w-full max-w-xs rounded-[1rem] border border-[rgba(27,42,91,0.08)] bg-white object-contain shadow-[0_14px_28px_rgba(27,42,91,0.08)]"
                      />
                      {(() => {
                        const chart = parseSizeChartData(editing.sizeChartData);
                        if (!chart) {
                          return (
                            <p className="text-sm text-[color:var(--aw-text-muted)] self-center">
                              No converted data yet — click “AI convert” to extract both units.
                            </p>
                          );
                        }
                        return (
                          <div className="flex-1 overflow-x-auto">
                            <p className="mb-2 text-xs text-[color:var(--aw-text-muted)]">
                              Detected unit: <strong>{chart.unitDetected || 'unknown'}</strong> · showing both cm and in (review, then Save)
                            </p>
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="bg-[color:var(--aw-surface-muted)] text-[color:var(--aw-text-muted)] text-left">
                                  <th className="px-2 py-1.5 font-semibold">Size</th>
                                  {chart.columns.map((c) => (
                                    <th key={c} className="px-2 py-1.5 font-semibold whitespace-nowrap">{c}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {chart.rows.map((row, i) => (
                                  <tr key={`${row.size}-${i}`} className="border-t border-[color:var(--aw-border)]">
                                    <td className="px-2 py-1.5 font-semibold text-[color:var(--aw-text-strong)]">{row.size}</td>
                                    {chart.columns.map((c) => {
                                      const cell = row.values?.[c];
                                      return (
                                        <td key={c} className="px-2 py-1.5 whitespace-nowrap text-[color:var(--aw-text-strong)]">
                                          {cell && (cell.cm != null || cell.in != null)
                                            ? `${cell.cm ?? '—'}cm / ${cell.in ?? '—'}in`
                                            : '—'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {chart.notes ? <p className="mt-2 text-[11px] text-[color:var(--aw-text-muted)]">{chart.notes}</p> : null}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              </fieldset>

              {/* 5. Variants */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Variants</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Sizes</label>
                    <input className="input-field text-sm py-2 w-full" placeholder='e.g. ["S","M","L","XL","XXL","XXXL"]' value={editing.sizes || ''} onChange={e => setField('sizes', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Colors</label>
                    <input className="input-field text-sm py-2 w-full" placeholder='e.g. ["Black","White"]' value={editing.colors || ''} onChange={e => setField('colors', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Materials</label>
                    <input className="input-field text-sm py-2 w-full" placeholder='e.g. ["Silk","Cotton"]' value={editing.materials || ''} onChange={e => setField('materials', e.target.value)} />
                  </div>
                </div>
              </fieldset>

              {/* 6. Inventory */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Inventory</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={editing.trackInventory ?? true}
                        onChange={e => setField('trackInventory', e.target.checked)}
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[color:var(--aw-navy)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                    </label>
                    <span className="text-sm text-[#2D2D2D]">Track Inventory</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                      Total Stock {parseColorList(editing.colors).length > 0 && <span className="text-[color:var(--aw-text-muted)] font-normal">(sum of colors)</span>}
                    </label>
                    <input
                      type="number"
                      className="input-field text-sm py-2 w-full disabled:bg-[color:var(--aw-surface-muted)] disabled:text-[color:var(--aw-text-muted)]"
                      value={editing.totalStock ?? 0}
                      disabled={parseColorList(editing.colors).length > 0}
                      onChange={e => setField('totalStock', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Shipping weight (lb)</label>
                    <input type="number" step="0.1" min="0" className="input-field text-sm py-2 w-full" placeholder="e.g. 1.5" value={editing.weightLb ?? ''} onChange={e => setField('weightLb', e.target.value)} />
                  </div>
                </div>

                {/* Color × Size variant stock matrix.
                    When both colors and sizes are set, show a grid where each
                    cell is the qty for that specific color+size combo.
                    Falls back to a color-only row when no sizes are defined. */}
                {parseColorList(editing.colors).length > 0 && parseColorList(editing.sizes).length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-[#2D2D2D] mb-2">Stock by color &amp; size</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr>
                            <th className="text-left px-2 py-1.5 text-[#6B7280] font-medium w-28">Color</th>
                            {parseColorList(editing.sizes).map(sz => (
                              <th key={sz} className="text-center px-2 py-1.5 text-[#6B7280] font-medium min-w-[56px]">{sz}</th>
                            ))}
                            <th className="text-right px-2 py-1.5 text-[#6B7280] font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parseColorList(editing.colors).map(c => {
                            const matrix = parseVariantStock(editing.variantStock);
                            const rowTotal = parseColorList(editing.sizes).reduce((s, sz) => s + (matrix[c]?.[sz] ?? 0), 0);
                            return (
                              <tr key={c} className="border-t border-[color:var(--aw-border)]">
                                <td className="px-2 py-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-block w-3 h-3 rounded-full border border-black/10 shrink-0" style={{ background: getColorHex(c) }} />
                                    <span className="truncate text-[#2D2D2D]">{cleanColorName(c)}</span>
                                  </div>
                                </td>
                                {parseColorList(editing.sizes).map(sz => (
                                  <td key={sz} className="px-1 py-1 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      className="input-field text-xs py-1 w-14 text-center"
                                      value={matrix[c]?.[sz] ?? 0}
                                      onChange={e => setVariantStock(c, sz, parseInt(e.target.value, 10) || 0)}
                                    />
                                  </td>
                                ))}
                                <td className="px-2 py-1.5 text-right font-semibold text-[#2D2D2D]">{rowTotal}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-[color:var(--aw-border)]">
                            <td className="px-2 py-1.5 text-[11px] font-semibold text-[#6B7280]">Total</td>
                            {parseColorList(editing.sizes).map(sz => {
                              const matrix = parseVariantStock(editing.variantStock);
                              const colTotal = parseColorList(editing.colors).reduce((s, c) => s + (matrix[c]?.[sz] ?? 0), 0);
                              return <td key={sz} className="px-2 py-1.5 text-center font-semibold text-[#2D2D2D]">{colTotal}</td>;
                            })}
                            <td className="px-2 py-1.5 text-right font-bold text-[#1B2A5B]">{editing.totalStock ?? 0}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="mt-2 text-[11px] text-[color:var(--aw-text-muted)]">
                      Cells with 0 show as &quot;Sold out&quot; for that color+size combo on the storefront.
                    </p>
                  </div>
                ) : parseColorList(editing.colors).length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-[#2D2D2D] mb-2">Stock by color</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {parseColorList(editing.colors).map((c) => {
                        const map = parseColorStock(editing.colorStock);
                        const qty = map[c] ?? 0;
                        return (
                          <div key={c} className="flex items-center gap-2 rounded-lg border border-[color:var(--aw-border)] bg-[#FCFAF7] px-3 py-2">
                            <span className="inline-block w-4 h-4 rounded-full border border-[rgba(0,0,0,0.1)] shrink-0" style={{ background: getColorHex(c) }} title={c} />
                            <span className="text-sm text-[#2D2D2D] flex-1 truncate" title={c}>{cleanColorName(c)}</span>
                            <input type="number" min="0" className="input-field text-sm py-1 w-16 text-right" value={qty} onChange={(e) => setColorStock(c, parseInt(e.target.value, 10) || 0)} />
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-[color:var(--aw-text-muted)]">Add sizes under <strong>Variants → Sizes</strong> to track stock per color+size.</p>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-[color:var(--aw-text-muted)]">
                    Add colors and sizes under <strong>Variants</strong> to track stock per color+size.
                  </p>
                )}
              </fieldset>

                            {/* 7. Publishing */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Publishing</legend>
                <div className="flex flex-wrap gap-6">
                  {([
                    { key: 'isPublished', label: 'Published' },
                    { key: 'isFeatured', label: 'Featured' },
                    { key: 'isNewArrival', label: 'New Arrival' },
                    { key: 'allowCustomization', label: 'Allow customization (+$15)' },
                  ] as const).map(toggle => (
                    <div key={toggle.key} className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={(editing as Record<string, unknown>)[toggle.key] as boolean ?? false}
                          onChange={e => setField(toggle.key, e.target.checked)}
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-[color:var(--aw-navy)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                      </label>
                      <span className="text-sm text-[#2D2D2D]">{toggle.label}</span>
                    </div>
                  ))}
                </div>
              </fieldset>

              {/* 8. Tags */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Tags</legend>
                <input className="input-field text-sm py-2 w-full" placeholder='e.g. ["summer","bestseller"]' value={editing.tags || ''} onChange={e => setField('tags', e.target.value)} />
              </fieldset>

              {/* 9. Collection */}
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-3">Collection</legend>
                <div>
                  <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Collection (optional)</label>
                  <select className="input-field text-sm py-2 w-full" value={editing.collectionId || ''} onChange={e => setField('collectionId', e.target.value)}>
                    <option value="">No collection</option>
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>{collection.name}</option>
                    ))}
                  </select>
                </div>
              </fieldset>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[color:var(--aw-border)]">
              <div>
                {editing.id && (
                  <button className="text-sm text-[color:var(--aw-danger)] hover:text-[#9A1830] font-medium" onClick={() => { remove(editing.id!); setEditing(null); }}>
                    Delete Product
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button className="px-5 py-2 text-sm font-medium text-[color:var(--aw-text-muted)] hover:text-[#2D2D2D] border border-[color:var(--aw-border)] rounded-lg" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button className="btn-primary text-sm px-6 py-2" disabled={saving || !editing.name} onClick={save}>
                  {saving ? 'Saving...' : editing.id ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Media Library Picker */}
      {libraryOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--aw-border)]">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)]" style={{ fontFamily: 'var(--font-heading)' }}>
                  Media Library
                </h2>
                <p className="text-xs text-[color:var(--aw-text-muted)]">Re-use images already imported from Shopify or stored in /public/media.</p>
              </div>
              <button
                className="text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-danger)] text-sm"
                onClick={() => setLibraryOpen(false)}
              >
                ✕ Close
              </button>
            </div>

            <div className="px-6 py-3 border-b border-[color:var(--aw-border)] flex flex-wrap items-center gap-3">
              <div className="flex gap-2">
                {libraryFolders.map((f) => (
                  <button
                    key={f.id}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                      libraryFolder === f.id
                        ? 'bg-[color:var(--aw-navy)] text-white border-[color:var(--aw-navy)]'
                        : 'bg-white text-[color:var(--aw-text-strong)] border-[#E5E1D8] hover:bg-[#F5F3EF]'
                    }`}
                    onClick={() => setLibraryFolder(f.id)}
                  >
                    {f.label} ({f.items.length})
                  </button>
                ))}
              </div>
              <input
                type="search"
                placeholder="Search filename..."
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                className="input-field text-sm py-1.5 px-3 ml-auto w-full sm:w-64"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-[#FCFAF7]">
              {libraryLoading ? (
                <p className="text-sm text-[color:var(--aw-text-muted)]">Loading library...</p>
              ) : libraryError ? (
                <p className="text-sm text-[color:var(--aw-danger)]">{libraryError}</p>
              ) : (
                (() => {
                  const folder = libraryFolders.find((f) => f.id === libraryFolder);
                  const q = librarySearch.trim().toLowerCase();
                  const items = (folder?.items || []).filter((it) =>
                    !q || it.name.toLowerCase().includes(q),
                  );
                  if (!items.length) {
                    return <p className="text-sm text-[color:var(--aw-text-muted)]">No images found in this folder.</p>;
                  }
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {items.map((item) => {
                        const selected = librarySelection.includes(item.url);
                        return (
                          <button
                            type="button"
                            key={item.url}
                            onClick={() => toggleLibrarySelection(item.url)}
                            className={`group relative rounded-lg overflow-hidden border-2 transition ${
                              selected ? 'border-[color:var(--aw-navy)] ring-2 ring-[#1B2A5B]/40' : 'border-transparent hover:border-[color:var(--aw-navy)]/40'
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.url} alt={item.name} className="w-full h-32 object-cover bg-white" loading="lazy" />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                              <p className="text-[10px] text-white truncate">{item.name}</p>
                            </div>
                            {selected && (
                              <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[color:var(--aw-navy)] text-white text-xs font-bold flex items-center justify-center shadow">
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-[color:var(--aw-border)]">
              <p className="text-xs text-[color:var(--aw-text-muted)]">{librarySelection.length} selected</p>
              <div className="flex gap-3">
                <button
                  className="px-5 py-2 text-sm font-medium text-[color:var(--aw-text-muted)] hover:text-[#2D2D2D] border border-[color:var(--aw-border)] rounded-lg"
                  onClick={() => setLibraryOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary text-sm px-6 py-2 disabled:opacity-50"
                  disabled={!librarySelection.length}
                  onClick={attachLibrarySelection}
                >
                  Attach {librarySelection.length || ''} Image{librarySelection.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
