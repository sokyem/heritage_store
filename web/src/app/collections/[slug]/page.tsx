'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { signIn, signOut } from 'next-auth/react';
import { resolveStorefrontImage } from '@/lib/storefront-media';
import { showErrorToast } from '@/components/Toast';
import { trackViewItemList } from '@/lib/analytics';
import ModalReviews from '@/components/ModalReviews';
import { getColorHex, cleanColorName } from '@/lib/colors';

/* ─── Product Data extracted from awulak.com ───────────── */

type SizeChartCell = { cm: number | null; in: number | null };
interface SizeChartData {
  unitDetected?: string;
  columns: string[];
  rows: Array<{ size: string; values: Record<string, SizeChartCell> }>;
  notes?: string;
}

interface Product {
  id?: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  image: string;
  images?: string[]; // Optional additional product views (front, back, side, detail, etc.)
  imageEntries?: { url: string; color: string | null; label: string | null }[];
  colors?: string[];
  sizes?: string[];
  sizeChartImage?: string | null;
  sizeChartData?: SizeChartData | null;
  category: string;
  description?: string;
  badge?: 'Sale' | 'Sold out' | 'New';
}

interface CollectionData {
  name: string;
  slug: string;
  description: string;
  heroImage: string;
}

const collectionsData: Record<string, CollectionData> = {
  women: {
    name: 'Women',
    slug: 'women',
    description: 'Handcrafted African print dresses, kimonos, shirts and skirts. From bold Adire shift dresses to elegant kaftans — each piece tells a story.',
    heroImage: '/media/storefront/shopify/bubu-1.jpg',
  },
  men: {
    name: 'Men',
    slug: 'men',
    description: 'African print shirts for men, crafted from 100% cotton fabric and adorned with intricate embroidery. Perfect for any occasion, blending cultural heritage with modern style.',
    heroImage: '/media/storefront/shopify/odoi-men-shirt-1.jpg',
  },
  prom: {
    name: 'Prom',
    slug: 'prom',
    description: 'Pre-made custom prom dresses — luxury, elegance, and originality without the wait time of full customization. Each dress is one-of-a-kind, handcrafted with premium fabrics and detailed finishing.',
    heroImage: '/media/storefront/shopify/ariel-corset-gown-1.jpg',
  },
  accessories: {
    name: 'Accessories',
    slug: 'accessories',
    description: 'Curated African accessories to complete your look. Artisan headwraps, handwoven clutches, and heritage statement pieces.',
    heroImage: '/media/jewelry-headwrap.jpg',
  },
  jewelry: {
    name: 'Jewelry & Accessories',
    slug: 'jewelry',
    description: 'Ready-to-ship Ghanaian jewelry and accessories — handcrafted brass, Krobo beads, waist beads, coral accents, and artisan pieces rooted in heritage.',
    heroImage: '/media/jewelry-waist-beads.jpg',
  },
  couture: {
    name: 'Couture & Ceremonial',
    slug: 'couture',
    description: 'Bespoke gowns, traditional wedding attire, and ceremonial pieces — each one custom-fitted to your measurements. A showcase of what our atelier can create for your most important moments.',
    heroImage: '/media/IMG_8376.jpg',
  },
};

type SortOption = 'featured' | 'price-low' | 'price-high' | 'name-az';

export default function CollectionPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { data: session } = useSession();
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;

  // Admin-created collections aren't in the hardcoded map — resolve them from
  // the public API so any collection slug gets a working detail page.
  const [adminCollection, setAdminCollection] = useState<CollectionData | null>(null);
  const [collectionChecked, setCollectionChecked] = useState(false);
  useEffect(() => {
    if (!slug) return;
    if (collectionsData[slug]) { setCollectionChecked(true); return; }
    fetch('/api/collections')
      .then((r) => r.json())
      .then((d) => {
        const f = (d.collections || []).find((c: { slug: string }) => c.slug === slug);
        if (f) setAdminCollection({ name: f.name, slug: f.slug, description: f.description || '', heroImage: f.image || '' });
      })
      .catch(() => {})
      .finally(() => setCollectionChecked(true));
  }, [slug]);

  const collection = collectionsData[slug] || adminCollection;

  const router = useRouter();
  const [sortBy, setSortBy] = useState<SortOption>('featured');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [showSizeChart, setShowSizeChart] = useState(false);
  const [chartUnit, setChartUnit] = useState<'cm' | 'in'>('in');
  const [addingToCart, setAddingToCart] = useState(false);

  // Products + prices come from the admin Product table via /api/products,
  // so the studio can change a price in /admin/products and the storefront
  // updates immediately — no redeploy, no hardcoded fallback.
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setProductsLoading(true);

    const slugToCategory: Record<string, string> = {
      women: 'Women',
      men: 'Men',
      prom: 'Prom',
      accessories: 'Accessories',
      jewelry: 'Jewelry',
      couture: 'Couture',
    };

    const mapApiToProduct = (raw: Record<string, unknown>): Product => {
      // Derive a unified color list: prefer admin-set colors[], then fall
      // back to distinct colors tagged on imageEntries. Clean stray
      // brackets/quotes that can leak in from JSON-ish admin input.
      const adminColors = Array.isArray(raw.colors)
        ? (raw.colors as unknown[]).map((c) => cleanColorName(String(c))).filter(Boolean)
        : [];
      const entryColors = Array.isArray(raw.imageEntries)
        ? Array.from(new Set(
            (raw.imageEntries as Array<{ color?: string | null }>)
              .map((e) => cleanColorName(e?.color))
              .filter(Boolean),
          ))
        : [];
      const colors = adminColors.length > 0 ? adminColors : entryColors;
      return {
        id: raw.id ? String(raw.id) : undefined,
        name: String(raw.name || ''),
        slug: String(raw.slug || raw.id || ''),
        price: typeof raw.price === 'number' ? raw.price : Number(raw.price) || 0,
        compareAtPrice: typeof raw.compareAt === 'number' ? raw.compareAt : undefined,
        image: String(raw.image || ''),
        images: Array.isArray(raw.images) ? (raw.images as string[]) : undefined,
        imageEntries: Array.isArray(raw.imageEntries) ? (raw.imageEntries as Product['imageEntries']) : undefined,
        colors,
        sizes: Array.isArray(raw.sizes) ? (raw.sizes as string[]) : undefined,
        sizeChartImage: typeof raw.sizeChartImage === 'string' ? raw.sizeChartImage : null,
        sizeChartData: (raw.sizeChartData as SizeChartData | null) || null,
        category: String(raw.subcategory || raw.category || ''),
        description: raw.description ? String(raw.description) : undefined,
        badge: (raw.badge as Product['badge']) || undefined,
      };
    };

    (async () => {
      try {
        // Prefer the explicit collection assignment from the admin.
        let res = await fetch(`/api/products?collection=${encodeURIComponent(slug)}`);
        let list: unknown[] = res.ok ? await res.json() : [];

        // Fall back to category match for slugs that align with our category
        // taxonomy (women, men, etc.) when the admin hasn't yet curated the
        // collection — so the page still has products.
        if (Array.isArray(list) && list.length === 0 && slugToCategory[slug]) {
          res = await fetch(`/api/products?category=${encodeURIComponent(slugToCategory[slug])}`);
          list = res.ok ? await res.json() : [];
        }

        if (cancelled) return;
        const mapped = Array.isArray(list) ? list.map((p) => mapApiToProduct(p as Record<string, unknown>)) : [];
        setProducts(mapped);
        // Fire the ViewCategory / view_item_list ad event for this collection.
        trackViewItemList(collection?.name || slug, mapped.map((p) => ({
          id: p.id || p.slug,
          name: p.name,
          price: p.price,
          category: p.category,
        })));
      } catch (err) {
        console.error('Failed to load collection products:', err);
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Reset image index + default color whenever a new product is opened
  const openProduct = useCallback((product: Product) => {
    setSelectedImageIndex(0);
    const fromColors = (product.colors || []).map(cleanColorName).filter(Boolean);
    const fromImages = (product.imageEntries || []).map((e) => cleanColorName(e.color)).filter(Boolean);
    setSelectedColor(fromColors[0] || fromImages[0] || '');
    setSelectedSize((product.sizes && product.sizes[0]) || '');
    setShowSizeChart(false);
    setChartUnit('in');
    setSelectedProduct(product);
  }, []);

  // Build the gallery list. When a color is selected and images are tagged
  // with it, show only that color's photos; otherwise main image + extras.
  const getProductGallery = useCallback((product: Product, color?: string): string[] => {
    if (color && product.imageEntries && product.imageEntries.length > 0) {
      const needle = cleanColorName(color).toLowerCase();
      const tagged = product.imageEntries
        .filter((e) => cleanColorName(e.color).toLowerCase() === needle)
        .map((e) => e.url);
      if (tagged.length > 0) return tagged;
    }
    const list: string[] = [];
    if (product.image) list.push(product.image);
    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        if (img && !list.includes(img)) list.push(img);
      }
    }
    return list;
  }, []);

  // Distinct, cleaned color options for the open product.
  const colorOptionsFor = useCallback((product: Product): string[] => {
    const fromColors = (product.colors || []).map(cleanColorName).filter(Boolean);
    const list = fromColors.length
      ? fromColors
      : (product.imageEntries || []).map((e) => cleanColorName(e.color)).filter(Boolean);
    return Array.from(new Set(list));
  }, []);

  const isJewelryCollection = slug === 'jewelry';
  const isCoutureCollection = slug === 'couture';
  const isMadeToMeasureCollection = slug === 'couture' || slug === 'bridal';

  const isBuyable = (product: Product) => {
    if (product.badge === 'Sold out') return false;
    return slug !== 'couture';
  };

  const getProductImage = useCallback((product: Product) => (
    resolveStorefrontImage(product.image, {
      category: product.category || collection?.name,
      slug: product.slug,
    })
  ), [collection?.name]);

  const handleAddToCart = useCallback(async (product: Product) => {
    setAddingToCart(true);
    try {
      // Include the picked size/color so back-office sees what the customer
      // actually ordered (the collections modal previously dropped them).
      const variantNote = [
        selectedSize ? `Size: ${selectedSize}` : null,
        selectedColor ? `Color: ${cleanColorName(selectedColor)}` : null,
      ].filter(Boolean).join(' · ');
      const customNotes = [
        `${product.name} — ${product.category}`,
        variantNote,
      ].filter(Boolean).join(' | ');
      if (session) {
        // Signed-in user: create the order server-side, then go to the order checkout page
        const orderRes = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: product.name,
            amount: product.price,
            customNotes,
          }),
        });
        if (!orderRes.ok) {
          const data = await orderRes.json().catch(() => null);
          throw new Error(data?.error || 'Failed to create order');
        }
        const order = await orderRes.json();
        setSelectedProduct(null);
        router.push(`/checkout/${order.id}`);
      } else {
        // Guest user: redirect to the unified checkout page which handles
        // guest email collection and order creation in a single flow
        setSelectedProduct(null);
        const params = new URLSearchParams({
          productName: product.name,
          amount: String(product.price),
        });
        if (variantNote) params.set('notes', variantNote);
        router.push(`/checkout?${params.toString()}`);
      }
    } catch (error) {
      console.error('Add to cart failed:', error);
      showErrorToast('Error', 'Something went wrong. Please try again.');
    } finally {
      setAddingToCart(false);
    }
  }, [session, router, selectedSize, selectedColor]);

  const categories = useMemo(() => {
    if (!collection) return [];
    const cats = Array.from(new Set(products.map(p => p.category)));
    return cats.sort();
  }, [collection, products]);

  const sortedProducts = useMemo(() => {
    if (!collection) return [];
    let filtered = products;

    if (filterCategory !== 'all') {
      filtered = filtered.filter(p => p.category === filterCategory);
    }

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'price-low': return a.price - b.price;
        case 'price-high': return b.price - a.price;
        case 'name-az': return a.name.localeCompare(b.name);
        default: return 0;
      }
    });
  }, [collection, products, sortBy, filterCategory]);

  if (!collection) {
    // Still resolving an admin collection slug — don't flash "not found".
    if (!collectionChecked) {
      return (
        <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
          <div className="loading-spinner" />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-center">
          <h1 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl text-[#1B2A5B] mb-4">Collection not found</h1>
          <Link href="/collections" className="btn-primary px-8 py-3">Browse Collections</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="border-b border-[rgba(27,42,91,0.08)] bg-white/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1450px] mx-auto px-6 lg:px-12">
          <div className="flex justify-between items-center h-20">
            <Link href="/" style={{ fontFamily: 'var(--font-heading)' }} className="text-2xl font-medium tracking-[0.18em] uppercase text-[#1B2A5B]">
              AWULA K
            </Link>
            <nav className="hidden md:flex items-center gap-10">
              {[
                { label: 'Collections', href: '/collections' },
                { label: 'Services', href: '/#services' },
                { label: 'About', href: '/#about' },
              ].map(item => (
                <Link key={item.label} href={item.href} className="text-[0.95rem] font-medium tracking-[0.06em] uppercase text-[#8B7569] hover:text-[#1B2A5B] transition-colors">
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-5">
              {session ? (
                <>
                  {['founder', 'staff'].includes(sessionRole || '') && (
                    <Link href="/admin" className="text-[0.95rem] font-medium tracking-[0.06em] uppercase text-[#C41E3A] hover:text-[#1B2A5B] transition-colors">
                      Admin
                    </Link>
                  )}
                  {sessionRole === 'designer' && (
                    <Link href="/designer" className="text-[0.95rem] font-medium tracking-[0.06em] uppercase text-[#C41E3A] hover:text-[#1B2A5B] transition-colors">
                      Designer
                    </Link>
                  )}
                  <Link href="/customer/dashboard" className="text-[0.95rem] font-medium tracking-[0.06em] uppercase text-[#8B7569] hover:text-[#1B2A5B] transition-colors">
                    Account
                  </Link>
                  <Link href="/admin" className="btn-primary text-sm py-2.5 px-6">
                    Studio
                  </Link>
                  <button onClick={() => signOut()} className="text-[0.95rem] font-medium tracking-[0.06em] uppercase text-[#8B7569] hover:text-[#C41E3A] transition-colors">
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/consults" className="text-[0.95rem] font-medium tracking-[0.06em] uppercase text-[#8B7569] hover:text-[#1B2A5B] transition-colors hidden sm:block">
                    Consults
                  </Link>
                  <button onClick={() => signIn(undefined, { callbackUrl: '/collections' })} className="btn-primary text-sm py-2.5 px-6">
                    Sign In
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* ── Collection Hero ────────────────────────────── */}
        <section className="relative overflow-hidden bg-[#0F1A3A]" style={{ minHeight: '340px' }}>
          <div className="absolute inset-0">
            <img
              src={resolveStorefrontImage(collection.heroImage, { category: collection.slug, slug: collection.slug })}
              alt={collection.name}
              className="w-full h-full object-cover opacity-30"
              style={{ filter: 'brightness(0.5)' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F1A3A] via-[#0F1A3A]/60 to-transparent" />
          </div>
          <div className="relative z-10 max-w-[1450px] mx-auto px-6 lg:px-12 flex flex-col justify-end" style={{ minHeight: '340px', paddingBottom: '3rem' }}>
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm mb-6">
              <Link href="/" className="text-white/50 hover:text-white/80 transition-colors">Home</Link>
              <span className="text-white/30">/</span>
              <Link href="/collections" className="text-white/50 hover:text-white/80 transition-colors">Collections</Link>
              <span className="text-white/30">/</span>
              <span className="text-white/80">{collection.name}</span>
            </nav>
            <h1 style={{ fontFamily: 'var(--font-heading)' }} className="text-4xl md:text-5xl font-normal text-white tracking-[0.02em] mb-4">
              {collection.name}
            </h1>
            <p className="text-base text-white/60 leading-relaxed max-w-[640px] mb-2">
              {collection.description}
            </p>
            <p className="text-sm font-semibold tracking-[0.14em] uppercase text-[#E8364F]">
              {products.length} {products.length === 1 ? 'piece' : 'pieces'}
            </p>
          </div>
        </section>

        {/* ── Filters & Sort ─────────────────────────────── */}
        <section className="border-b border-[rgba(27,42,91,0.08)] bg-white sticky top-20 z-40">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Category filters */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setFilterCategory('all')}
                  className={`px-4 py-2 rounded-full text-sm font-medium tracking-[0.04em] transition-colors ${
                    filterCategory === 'all'
                      ? 'bg-[#1B2A5B] text-white'
                      : 'bg-[#F0EBE3] text-[#5C3D2E] hover:bg-[#E8E0D5]'
                  }`}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-4 py-2 rounded-full text-sm font-medium tracking-[0.04em] transition-colors ${
                      filterCategory === cat
                        ? 'bg-[#1B2A5B] text-white'
                        : 'bg-[#F0EBE3] text-[#5C3D2E] hover:bg-[#E8E0D5]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#8B7569] font-medium tracking-[0.04em]">Sort by</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortOption)}
                  className="text-sm bg-transparent border border-[rgba(27,42,91,0.15)] rounded-[6px] px-3 py-2 text-[#1B2A5B] font-medium focus:outline-none focus:border-[#1B2A5B] cursor-pointer"
                >
                  <option value="featured">Featured</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name-az">Name: A–Z</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* ── Products Grid ──────────────────────────────── */}
        <section className="py-12 md:py-16">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12">
            {productsLoading ? (
              <div className="text-center py-20">
                <div className="inline-block w-8 h-8 border-2 border-[#1B2A5B] border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm text-[#8B7569]">Loading products…</p>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-lg text-[#1B2A5B] mb-2">This collection is being curated.</p>
                <p className="text-sm text-[#8B7569]">
                  Add products to this collection in <span className="font-medium">Admin → Products</span> and assign them to the <span className="font-medium">{collection.name}</span> collection.
                </p>
              </div>
            ) : sortedProducts.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-lg text-[#8B7569]">No products match your filters.</p>
                <button onClick={() => setFilterCategory('all')} className="btn-outline mt-4 px-6 py-2.5 text-sm">
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {sortedProducts.map((product, index) => (
                  <div
                    key={product.slug}
                    className="group animate-fade-in cursor-pointer"
                    style={{ animationDelay: `${index * 60}ms` }}
                    onClick={() => openProduct(product)}
                  >
                    {/* Image */}
                    <div className="product-image-wrap rounded-[6px] mb-4 overflow-hidden relative">
                      <img
                        src={getProductImage(product)}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      {/* Badge */}
                      {product.badge && (
                        <div className="absolute top-3 left-3 z-10">
                          <span
                            className={`product-badge ${
                              product.badge === 'Sold out'
                                ? '!bg-[#5C3D2E] !text-white'
                                : product.badge === 'Sale'
                                ? '!bg-[#C41E3A] !text-white'
                                : ''
                            }`}
                          >
                            {product.badge}
                          </span>
                        </div>
                      )}
                      {/* Quick view overlay */}
                      <div className="absolute inset-0 bg-[#1B2A5B]/0 group-hover:bg-[#1B2A5B]/10 transition-colors duration-300 flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white text-[#1B2A5B] text-sm font-semibold tracking-[0.06em] uppercase px-6 py-3 rounded-[6px] shadow-lg">
                          View Details
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div>
                      <p className="text-xs font-semibold tracking-[0.1em] uppercase text-[#8B7569] mb-1.5">
                        {product.category}
                      </p>
                      <h3
                        style={{ fontFamily: 'var(--font-heading)' }}
                        className="text-base font-medium text-[#1B2A5B] group-hover:text-[#C41E3A] transition-colors leading-snug mb-2"
                      >
                        {product.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-[#1B2A5B]">
                          {isCoutureCollection ? 'from ' : ''}${product.price.toFixed(2)}
                        </span>
                        {product.compareAtPrice && (
                          <span className="text-sm text-[#8B7569] line-through">
                            ${product.compareAtPrice.toFixed(2)}
                          </span>
                        )}
                        {product.compareAtPrice && (
                          <span className="text-xs font-semibold text-[#C41E3A] ml-1">
                            Save {Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}%
                          </span>
                        )}
                      </div>
                      {isCoutureCollection && (
                        <a
                          href="/consults"
                          className="inline-block mt-2 text-xs font-semibold tracking-[0.12em] uppercase text-[#C41E3A] hover:underline"
                        >
                          Request Custom Fit →
                        </a>
                      )}
                      {isJewelryCollection && (
                        <span className="inline-block mt-2 text-xs font-semibold tracking-[0.12em] uppercase text-[#C41E3A]">
                          Ready to Ship
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Other Collections ───────────────────────────── */}
        <section className="bg-white py-16 md:py-20">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12">
            <div className="flex items-end justify-between mb-10">
              <div>
                <p className="label-accent mb-3 text-sm">Explore More</p>
                <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-2xl md:text-3xl heading-lg">Other Collections</h2>
              </div>
              <Link href="/collections" className="btn-outline text-sm py-2.5 px-6">View All</Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Object.values(collectionsData)
                .filter(c => c.slug !== slug)
                .slice(0, 3)
                .map((col, i) => (
                  <Link
                    key={col.slug}
                    href={`/collections/${col.slug}`}
                    className="group block rounded-[8px] overflow-hidden animate-fade-in"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="relative aspect-[3/2] overflow-hidden">
                      <img
                        src={resolveStorefrontImage(col.heroImage, { category: col.slug, slug: col.slug })}
                        alt={col.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    </div>
                    <div className="pt-3 pb-1 px-1">
                      <h3 style={{ fontFamily: 'var(--font-heading)' }} className="text-xl text-[#1B2A5B] mb-1 group-hover:text-[#C41E3A] transition-colors">{col.name}</h3>
                      <span className="text-xs font-semibold tracking-[0.1em] uppercase text-[#8B7569]">
                        Explore →
                      </span>
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </section>

        {/* ── CTA ────────────────────────────────────────── */}
        <section className="relative overflow-hidden py-20 md:py-24">
          <div className="absolute inset-0">
            <img
              src={resolveStorefrontImage(collection.heroImage, { category: collection.slug, slug: collection.slug })}
              alt={collection.name}
              className="w-full h-full object-cover"
              style={{ filter: 'brightness(0.2)' }}
            />
          </div>
          <div className="relative z-10 max-w-[620px] mx-auto px-6 lg:px-12 text-center">
            <p className="text-sm font-semibold tracking-[0.14em] uppercase text-[#E8364F] mb-5">Bespoke Service</p>
            <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-2xl md:text-3xl font-normal tracking-[0.02em] text-white mb-5 leading-snug">
              Want something truly one-of-a-kind?
            </h2>
            <p className="text-base text-white/60 mb-9 leading-relaxed">
              {isJewelryCollection
                ? 'Discover handcrafted Ghanaian jewelry and accessories ready to add to cart today.'
                : 'Our design team creates custom pieces tailored to your body, style, and story.'}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {isJewelryCollection ? (
                <>
                  <Link href="/collections/jewelry" className="bg-white text-[#1B2A5B] px-10 py-4 rounded-[6px] text-[0.95rem] font-semibold tracking-[0.06em] uppercase hover:bg-[#F0EBE3] transition-colors">
                    Shop the Jewelry Edit
                  </Link>
                  <Link href="/collections" className="border border-white/30 text-white px-10 py-4 rounded-[6px] text-[0.95rem] font-semibold tracking-[0.06em] uppercase hover:bg-white/10 transition-colors">
                    Browse More Collections
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/consults" className="bg-white text-[#1B2A5B] px-10 py-4 rounded-[6px] text-[0.95rem] font-semibold tracking-[0.06em] uppercase hover:bg-[#F0EBE3] transition-colors">
                    Book a Consult
                  </Link>
                  <Link href="/measurements" className="border border-white/30 text-white px-10 py-4 rounded-[6px] text-[0.95rem] font-semibold tracking-[0.06em] uppercase hover:bg-white/10 transition-colors">
                    Measurements
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ── Product Detail Modal ───────────────────────────── */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setSelectedProduct(null)}>
          <div
            className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid lg:grid-cols-2 gap-0 lg:gap-8 p-6 lg:p-10">
              {/* Left: Product Image Gallery */}
              <div className="relative">
                {(() => {
                  const gallery = getProductGallery(selectedProduct, selectedColor);
                  const activeIndex = Math.min(selectedImageIndex, Math.max(gallery.length - 1, 0));
                  const activeRaw = gallery[activeIndex] ?? selectedProduct.image;
                  const activeResolved = resolveStorefrontImage(activeRaw, {
                    category: selectedProduct.category || collection?.name,
                    slug: selectedProduct.slug,
                  });
                  return (
                    <>
                      <div className="relative bg-[#F3F4F6] rounded-lg overflow-hidden" style={{ aspectRatio: '1' }}>
                        <img src={activeResolved} alt={selectedProduct.name} className="w-full h-full object-cover transition-opacity duration-300" />
                        {selectedProduct.badge && (
                          <span className={`absolute top-3 left-3 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${selectedProduct.badge === 'Sold out' ? 'bg-[#6B7280] text-white' : selectedProduct.badge === 'Sale' ? 'bg-[#EF4444] text-white' : 'bg-[#1B2A5B] text-white'}`}>
                            {selectedProduct.badge}
                          </span>
                        )}
                        {gallery.length > 1 && (
                          <>
                            <button
                              type="button"
                              aria-label="Previous image"
                              onClick={() => setSelectedImageIndex((i) => (i - 1 + gallery.length) % gallery.length)}
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-[#1B2A5B]"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <button
                              type="button"
                              aria-label="Next image"
                              onClick={() => setSelectedImageIndex((i) => (i + 1) % gallery.length)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-[#1B2A5B]"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </button>
                            <span className="absolute bottom-3 right-3 text-xs font-medium px-2 py-1 rounded-full bg-black/55 text-white">
                              {activeIndex + 1} / {gallery.length}
                            </span>
                          </>
                        )}
                      </div>
                      {gallery.length > 1 && (
                        <div className="mt-3 grid grid-cols-5 gap-2">
                          {gallery.map((img, i) => {
                            const thumb = resolveStorefrontImage(img, {
                              category: selectedProduct.category || collection?.name,
                              slug: selectedProduct.slug,
                            });
                            const isActive = i === activeIndex;
                            const label = i === 0 ? 'Front' : i === 1 ? 'Back' : i === 2 ? 'Side' : `View ${i + 1}`;
                            return (
                              <button
                                key={`${img}-${i}`}
                                type="button"
                                onClick={() => setSelectedImageIndex(i)}
                                aria-label={`Show ${label} view`}
                                title={label}
                                className={`relative rounded-md overflow-hidden border-2 transition-all ${isActive ? 'border-[#1B2A5B] shadow-md' : 'border-transparent hover:border-[#9CA3AF]'}`}
                                style={{ aspectRatio: '1' }}
                              >
                                <img src={thumb} alt={`${selectedProduct.name} ${label}`} className="w-full h-full object-cover" />
                                <span className="absolute bottom-0 inset-x-0 text-[10px] font-semibold uppercase tracking-wider text-white bg-black/45 py-0.5 text-center">
                                  {label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Right: Product Info */}
              <div className="flex flex-col justify-start">
                <button onClick={() => setSelectedProduct(null)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#6B7280] hover:text-[#1B2A5B] hover:bg-[#F3F4F6] transition-all shadow-md lg:hidden">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                
                <p className="text-xs font-semibold tracking-wider uppercase text-[#9CA3AF] mb-2">{selectedProduct.category}</p>
                <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl font-medium text-[#1B2A5B] mb-4 leading-snug">{selectedProduct.name}</h2>
                
                {/* Price */}
                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-3xl font-semibold text-[#1B2A5B]">{isCoutureCollection ? 'from ' : ''}${selectedProduct.price.toFixed(2)}</span>
                  {selectedProduct.compareAtPrice && (
                    <>
                      <span className="text-lg text-[#9CA3AF] line-through">${selectedProduct.compareAtPrice.toFixed(2)}</span>
                      <span className="text-sm font-bold text-[#EF4444]">Save {Math.round(((selectedProduct.compareAtPrice - selectedProduct.price) / selectedProduct.compareAtPrice) * 100)}%</span>
                    </>
                  )}
                </div>

                {/* Description — helps shoppers decide before adding to cart */}
                {selectedProduct.description && (
                  <p className="text-sm text-[#4B5563] leading-relaxed mb-6 pb-6 border-b border-[#E5E7EB]">
                    {selectedProduct.description}
                  </p>
                )}

                {/* Color swatches — click to switch the gallery to that color */}
                {(() => {
                  const colorOptions = colorOptionsFor(selectedProduct);
                  if (colorOptions.length === 0) return null;
                  return (
                    <div className="mb-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#374151] mb-2">Color: <span className="text-[#1B2A5B] normal-case font-medium">{cleanColorName(selectedColor)}</span></p>
                      <div className="flex flex-wrap gap-3">
                        {colorOptions.map((c) => {
                          const isActive = cleanColorName(selectedColor) === c;
                          return (
                            <button
                              key={c}
                              onClick={() => { setSelectedColor(c); setSelectedImageIndex(0); }}
                              title={c}
                              aria-label={c}
                              className={`w-9 h-9 rounded-full border-2 transition-all ${isActive ? 'border-[#1B2A5B] ring-2 ring-offset-2 ring-[#1B2A5B]/30' : 'border-[#D1D5DB] hover:border-[#1B2A5B]'}`}
                              style={{ background: getColorHex(c) }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Size selector — keeps parity with /matchday and the full
                    product page so customers can pick a size before checkout. */}
                {selectedProduct.sizes && selectedProduct.sizes.length > 0 && (
                  <div className="mb-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#374151] mb-2">
                      Size: <span className="text-[#1B2A5B] normal-case font-medium">{selectedSize || '—'}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.sizes.map((s) => {
                        const isActive = selectedSize === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSelectedSize(s)}
                            className={`px-4 py-2 rounded-md text-sm font-semibold border-2 transition-all ${isActive ? 'bg-[#1B2A5B] border-[#1B2A5B] text-white' : 'bg-white border-[#D1D5DB] text-[#374151] hover:border-[#1B2A5B]'}`}
                          >{s}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Size guide — same component as /matchday and /products/[slug]
                    so a product with sizeChartData shows it everywhere. */}
                {(selectedProduct.sizeChartImage || selectedProduct.sizeChartData) && (
                  <div className="mb-5">
                    <button
                      type="button"
                      onClick={() => setShowSizeChart((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#1B2A5B] hover:underline"
                    >
                      📏 Size guide <span aria-hidden>{showSizeChart ? '▴' : '▾'}</span>
                    </button>
                    {showSizeChart && (
                      <div className="mt-3 rounded-lg border border-[#E5E7EB] bg-[#FCFAF7] p-4">
                        {selectedProduct.sizeChartData && (
                          <div className="mb-4">
                            <div className="mb-3 inline-flex rounded-md border border-[#D1D5DB] overflow-hidden text-xs font-semibold">
                              <button type="button" onClick={() => setChartUnit('in')} className={`px-3 py-1.5 ${chartUnit === 'in' ? 'bg-[#1B2A5B] text-white' : 'bg-white text-[#374151]'}`}>Inches</button>
                              <button type="button" onClick={() => setChartUnit('cm')} className={`px-3 py-1.5 ${chartUnit === 'cm' ? 'bg-[#1B2A5B] text-white' : 'bg-white text-[#374151]'}`}>Centimetres</button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-white text-left text-[#6B7280]">
                                    <th className="px-2 py-1.5 font-semibold border border-[#E5E7EB]">Size</th>
                                    {selectedProduct.sizeChartData.columns.map((c) => (
                                      <th key={c} className="px-2 py-1.5 font-semibold border border-[#E5E7EB] whitespace-nowrap">{c}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedProduct.sizeChartData.rows.map((row, i) => (
                                    <tr key={`${row.size}-${i}`} className="text-[#374151]">
                                      <td className="px-2 py-1.5 font-semibold border border-[#E5E7EB] bg-white">{row.size}</td>
                                      {selectedProduct.sizeChartData!.columns.map((c) => {
                                        const cell = row.values?.[c];
                                        const val = cell ? cell[chartUnit] : null;
                                        return (
                                          <td key={c} className="px-2 py-1.5 border border-[#E5E7EB] whitespace-nowrap">
                                            {val != null ? `${val} ${chartUnit}` : '—'}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {selectedProduct.sizeChartData.notes && (
                              <p className="mt-2 text-[11px] text-[#6B7280]">{selectedProduct.sizeChartData.notes}</p>
                            )}
                          </div>
                        )}
                        {selectedProduct.sizeChartImage && (
                          <img src={selectedProduct.sizeChartImage} alt={`${selectedProduct.name} size chart`} className="w-full max-w-lg rounded-md border border-[#E5E7EB] bg-white" />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 mb-6">
                  {selectedProduct.badge === 'Sold out' ? (
                    <button className="w-full py-3.5 px-6 rounded-lg bg-[#E5E7EB] text-[#6B7280] font-semibold text-base cursor-not-allowed" disabled>Sold Out</button>
                  ) : isBuyable(selectedProduct) ? (
                    <>
                      <button onClick={() => handleAddToCart(selectedProduct)} disabled={addingToCart} className="w-full py-3.5 px-6 rounded-lg bg-[#1B2A5B] text-white font-semibold text-base hover:bg-[#2D4A8C] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        {addingToCart ? 'Adding...' : isJewelryCollection ? 'Add to Cart' : 'Add to Cart & Checkout'}
                      </button>
                      {!isJewelryCollection && (
                        <button onClick={() => { setSelectedProduct(null); router.push('/consults'); }} className="w-full py-3.5 px-6 rounded-lg border border-[#D1D5DB] text-[#1B2A5B] font-semibold text-base hover:bg-[#F9FAFB] transition-colors">
                          Custom Fit
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setSelectedProduct(null); router.push('/consults'); }} className="w-full py-3.5 px-6 rounded-lg bg-[#C41E3A] text-white font-semibold text-base hover:bg-[#A3162E] transition-colors">
                        Inquire &amp; Consult
                      </button>
                      <button onClick={() => { setSelectedProduct(null); router.push('/consults'); }} className="w-full py-3.5 px-6 rounded-lg border border-[#D1D5DB] text-[#1B2A5B] font-semibold text-base hover:bg-[#F9FAFB] transition-colors">
                        Custom Fit
                      </button>
                    </>
                  )}
                </div>

                {/* Info Messages */}
                {isJewelryCollection && (
                  <div className="bg-[#F0FDF4] border border-[#BBDBF7] rounded-lg p-4 mb-4">
                    <p className="text-xs text-[#166534] leading-relaxed">✓ Ready to ship • Free shipping on all orders • 14-day return policy</p>
                  </div>
                )}
                {isMadeToMeasureCollection && (
                  <div className="bg-[#FEF3E2] border border-[#FCD34D] rounded-lg p-4">
                    <p className="text-xs text-[#78350F] leading-relaxed">Custom pricing starts from the amount shown. Final cost depends on fabric, embellishments, and complexity. Book a consultation to discuss your vision.</p>
                  </div>
                )}

                {/* Reviews — social proof before adding to cart */}
                {selectedProduct.id && (
                  <ModalReviews productId={selectedProduct.id} productSlug={selectedProduct.slug} />
                )}

                {/* Trust badges */}
                <div className="mt-6 pt-6 border-t border-[#E5E7EB] space-y-3">
                  <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                    <span>Secure checkout</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#6B7280]">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
                    <span>Handcrafted quality</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="bg-[#0F1A3A] text-white/50">
        <div className="max-w-[1450px] mx-auto px-6 lg:px-12 py-16">
          <div className="grid gap-10 md:grid-cols-3">
            <div>
              <p style={{ fontFamily: 'var(--font-heading)' }} className="text-lg font-medium tracking-[0.18em] uppercase text-white mb-4">AWULA K</p>
              <p className="text-base leading-relaxed">Luxury fashion studio &amp; bespoke design services.</p>
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.1em] uppercase text-white/70 mb-4">Quick Links</p>
              <div className="flex flex-col gap-3 text-base">
                <Link href="/collections" className="hover:text-white transition-colors">Collections</Link>
                <Link href="/consults" className="hover:text-white transition-colors">Consultations</Link>
                <Link href="/measurements" className="hover:text-white transition-colors">Measurements</Link>
                <Link href="/customer/dashboard" className="hover:text-white transition-colors">My Account</Link>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.1em] uppercase text-white/70 mb-4">Connect</p>
              <div className="flex flex-col gap-3 text-base">
                <div className="flex gap-4">
                  <a href="https://www.instagram.com/awula_k_/" target="_blank" rel="noopener noreferrer" className="group w-11 h-11 rounded-full border border-white/20 flex items-center justify-center hover:bg-gradient-to-br hover:from-[#833AB4] hover:via-[#E1306C] hover:to-[#F77737] hover:border-transparent transition-all duration-300" aria-label="Instagram">
                    <svg className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </a>
                  <a href="https://www.facebook.com/people/AwulaK/61552784919341/" target="_blank" rel="noopener noreferrer" className="group w-11 h-11 rounded-full border border-white/20 flex items-center justify-center hover:bg-[#1877F2] hover:border-transparent transition-all duration-300" aria-label="Facebook">
                    <svg className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </a>
                  <a href="https://www.tiktok.com/@awula_k" target="_blank" rel="noopener noreferrer" className="group w-11 h-11 rounded-full border border-white/20 flex items-center justify-center hover:bg-white hover:border-transparent transition-all duration-300" aria-label="TikTok">
                    <svg className="w-5 h-5 text-white/60 group-hover:text-black transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-12 pt-7 text-sm text-center">
            AWULA K &copy; 2026. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
