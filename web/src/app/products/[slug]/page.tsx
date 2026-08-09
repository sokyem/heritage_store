'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart, buildCartLineId } from '@/components/CartContext';
import { CUSTOMIZATION_FEE } from '@/lib/pricing';
import { CartIcon } from '@/components/CartDrawer';
import { WishlistButton } from '@/components/WishlistContext';
import NotifyBackInStock from '@/components/NotifyBackInStock';
import { getColorHex, cleanColorName } from '@/lib/colors';
import ProductRating, { InlineStars } from '@/components/ProductRating';
import { trackViewContent } from '@/lib/analytics';
import dynamic from 'next/dynamic';
const ReviewsSection = dynamic(() => import('@/components/ReviewsSection'), { ssr: false });
import JsonLd from '@/components/JsonLd';
import { SITE_URL, absoluteUrl } from '@/lib/site-url';

interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  price: number;
  compareAt?: number;
  image: string;
  images: string[];
  imageEntries?: { url: string; color: string | null; label: string | null }[];
  category: string;
  subcategory?: string;
  collectionSlug?: string;
  collectionName?: string;
  sizes: string[];
  colors: string[];
  materials: string[];
  tags: string[];
  badge?: string;
  buyable: boolean;
  inStock?: boolean;
  sizeChartImage?: string | null;
  sizeChartData?: SizeChartData | null;
  allowCustomization?: boolean;
  colorStock?: Record<string, number> | null;
  sizeStock?: Record<string, number> | null;
  variantStock?: Record<string, Record<string, number>> | null;
}

type SizeChartCell = { cm: number | null; in: number | null };
interface SizeChartData {
  unitDetected?: string;
  columns: string[];
  rows: Array<{ size: string; values: Record<string, SizeChartCell> }>;
  notes?: string;
}

interface RelatedItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAt?: number;
  image: string;
  category: string;
  avgRating?: number;
  reviewCount?: number;
}

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const router = useRouter();
  const { addItem, openCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [qty, setQty] = useState(1);
  const [showSizeChart, setShowSizeChart] = useState(false);
  const [chartUnit, setChartUnit] = useState<'cm' | 'in'>('in');
  const [wantCustomization, setWantCustomization] = useState(false);
  const [customizationText, setCustomizationText] = useState('');

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/products/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.product) {
          setProduct(null);
          return;
        }
        setProduct(d.product);
        setRelated(d.related || []);
        setActiveImg(0);
        setSize(d.product.sizes?.[0] || '');
        // Colors can come from the colors[] list or, when that's empty, from
        // per-image color tags (imageEntries). Clean stray quotes/brackets.
        {
          const fromColors = (Array.isArray(d.product.colors) ? d.product.colors : []).map(cleanColorName).filter(Boolean);
          const fromImages = (Array.isArray(d.product.imageEntries) ? d.product.imageEntries : []).map((e: { color: string | null }) => cleanColorName(e.color)).filter(Boolean);
          setColor(fromColors[0] || fromImages[0] || '');
        }
        setQty(1);
        trackViewContent({
          id: d.product.id,
          name: d.product.name,
          price: d.product.price,
          category: d.product.category,
        });
      })
      .finally(() => setLoading(false));
  }, [slug]);

  function handleAddToCart() {
    if (!product) return;
    // If variantStock is set, check the specific color+size cell.
    if (product.variantStock && color && size) {
      const colorKey = Object.keys(product.variantStock).find(
        (k) => cleanColorName(k).toLowerCase() === cleanColorName(color).toLowerCase()
      );
      if (colorKey) {
        const sizeMap = product.variantStock[colorKey];
        const sizeKey = Object.keys(sizeMap).find((k) => k.trim().toUpperCase() === size.trim().toUpperCase());
        // Absent size key = 0 stock for this combo — block the add.
        if (sizeKey === undefined || Number(sizeMap[sizeKey]) === 0) return;
      }
    } else {
      // Fall back to legacy per-color check.
      if (color && product.colorStock) {
        const m = product.colorStock!;
        const key = Object.keys(m).find((k) => cleanColorName(k).toLowerCase() === cleanColorName(color).toLowerCase());
        if (key !== undefined && (Number(m[key]) || 0) === 0) return;
      }
      // Fall back to legacy per-size check.
      if (size && product.sizeStock) {
        const key = Object.keys(product.sizeStock).find((k) => k.trim().toUpperCase() === size.trim().toUpperCase());
        if (key !== undefined && Number(product.sizeStock[key]) === 0) return;
      }
    }
    const custom = product.allowCustomization && wantCustomization && customizationText.trim()
      ? customizationText.trim()
      : undefined;
    const unitPrice = custom ? product.price + CUSTOMIZATION_FEE : product.price;
    addItem({
      id: buildCartLineId(product.id, size, color, custom),
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: unitPrice,
      image: product.image,
      size: size || undefined,
      color: color || undefined,
      customization: custom,
      qty,
    });
  }

  function handleBuyNow() {
    if (!product) return;
    handleAddToCart();
    setTimeout(() => router.push('/cart'), 50);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[#8B7569]">Loading…</div>;
  }
  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-[#8B7569]">Product not found.</p>
        <Link href="/collections" className="px-5 py-2.5 rounded-md bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C]">Browse Collections</Link>
      </div>
    );
  }

  // Color options: the colors[] list, or — when empty — distinct colors from
  // the per-image tags. Cleaned of stray quotes/brackets either way.
  const colorOptions: string[] = (() => {
    const fromColors = (product.colors || []).map(cleanColorName).filter(Boolean);
    const list = fromColors.length
      ? fromColors
      : (product.imageEntries || []).map((e) => cleanColorName(e.color)).filter(Boolean);
    return Array.from(new Set(list));
  })();

  // When a color is selected and images are tagged with that color, show only
  // that color's photos (like the matchday modal); otherwise show all images.
  const colorGallery = (() => {
    if (color && product.imageEntries && product.imageEntries.length > 0) {
      const needle = cleanColorName(color).toLowerCase();
      const tagged = product.imageEntries
        .filter((e) => cleanColorName(e.color).toLowerCase() === needle)
        .map((e) => e.url);
      if (tagged.length > 0) return tagged;
    }
    return product.images.length > 0 ? product.images : [product.image];
  })();
  const gallery = colorGallery;
  const activeIndex = Math.min(activeImg, Math.max(gallery.length - 1, 0));
  const activeUrl = gallery[activeIndex] || product.image;
  const savePct = product.compareAt
    ? Math.round(((product.compareAt - product.price) / product.compareAt) * 100)
    : 0;

  // Per-color stock: when variantStock is set, derive per-color totals from it.
  // Falls back to the legacy colorStock field.
  const stockByColor: Record<string, number> | null = product.variantStock
    ? Object.fromEntries(
        Object.entries(product.variantStock).map(([color, sizes]) => [
          cleanColorName(color).toLowerCase(),
          Object.values(sizes).reduce((s, n) => s + (Number(n) || 0), 0),
        ]),
      )
    : product.colorStock
    ? Object.fromEntries(
        Object.entries(product.colorStock).map(([k, v]) => [cleanColorName(k).toLowerCase(), Number(v) || 0]),
      )
    : null;
  const stockForColor = (c: string): number | null => {
    if (!stockByColor) return null;
    const v = stockByColor[cleanColorName(c).toLowerCase()];
    return typeof v === 'number' ? v : null;
  };
  const selectedColorStock = color ? stockForColor(color) : null;
  const selectedColorSoldOut = selectedColorStock === 0;

  // Per-size stock: derive from variantStock when present, else legacy sizeStock.
  const stockBySize: Record<string, number> | null = product.variantStock
    ? (() => {
        const out: Record<string, number> = {};
        for (const sizes of Object.values(product.variantStock)) {
          for (const [sz, qty] of Object.entries(sizes)) {
            out[sz.trim().toUpperCase()] = (out[sz.trim().toUpperCase()] || 0) + (Number(qty) || 0);
          }
        }
        return out;
      })()
    : product.sizeStock
    ? Object.fromEntries(
        Object.entries(product.sizeStock).map(([k, v]) => [k.trim().toUpperCase(), Number(v) || 0]),
      )
    : null;
  const stockForSize = (s: string): number | null => {
    if (!stockBySize) return null;
    const v = stockBySize[s.trim().toUpperCase()];
    return typeof v === 'number' ? v : null;
  };
  // When variantStock is set AND a color is selected, check the specific color×size cell.
  const stockForColorSize = (s: string): number | null => {
    if (!product.variantStock || !color) return stockForSize(s);
    const colorKey = Object.keys(product.variantStock).find(
      (k) => cleanColorName(k).toLowerCase() === cleanColorName(color).toLowerCase()
    );
    if (!colorKey) return stockForSize(s);
    const sizeMap = product.variantStock[colorKey];
    const sizeKey = Object.keys(sizeMap).find((k) => k.trim().toUpperCase() === s.trim().toUpperCase());
    // If the matrix has this color but not this size, it means 0 stock for that
    // combo — return 0 (sold out) not null, since variantStock is the source of truth.
    return sizeKey !== undefined ? Number(sizeMap[sizeKey]) : 0;
  };
  const selectedSizeStock = size ? stockForColorSize(size) : null;
  const selectedSizeSoldOut = selectedSizeStock === 0;

  // Build schema.org Product + BreadcrumbList JSON-LD for rich Google snippets
  // (price, stock, breadcrumbs). Reviews are still fetched client-side, so we
  // intentionally omit `aggregateRating` here — Google warns about empty review
  // payloads. The Reviews component can add its own AggregateRating once data
  // is loaded if we want to extend this later.
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.longDescription || product.name,
    sku: product.sku,
    image: (product.images && product.images.length ? product.images : [product.image])
      .filter(Boolean)
      .map((src) => absoluteUrl(src)),
    category: product.category,
    brand: { '@type': 'Brand', name: 'AWULA K' },
    url: `${SITE_URL}/products/${product.slug}`,
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/products/${product.slug}`,
      priceCurrency: 'USD',
      price: product.price.toFixed(2),
      availability:
        product.inStock === false
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      product.collectionSlug && product.collectionName
        ? {
            '@type': 'ListItem',
            position: 2,
            name: product.collectionName,
            item: `${SITE_URL}/collections/${product.collectionSlug}`,
          }
        : {
            '@type': 'ListItem',
            position: 2,
            name: 'Collections',
            item: `${SITE_URL}/collections`,
          },
      {
        '@type': 'ListItem',
        position: 3,
        name: product.name,
        item: `${SITE_URL}/products/${product.slug}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-white">
      <JsonLd id="ld-product" data={productJsonLd} />
      <JsonLd id="ld-breadcrumb" data={breadcrumbJsonLd} />
      {/* Top bar */}
      <header className="border-b border-[#F0EBE3] bg-white sticky top-0 z-30">
        <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link href="/" style={{ fontFamily: 'var(--font-playfair)' }} className="text-2xl text-[#1B2A5B]">AWULA K</Link>
          <div className="flex items-center gap-2">
            <Link href="/collections" className="hidden sm:block text-sm text-[#374151] hover:text-[#1B2A5B] px-3 py-2">Collections</Link>
            <CartIcon className="text-[#1B2A5B]" />
          </div>
        </div>
      </header>

      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumbs */}
        <nav className="text-xs text-[#8B7569] mb-4 flex flex-wrap gap-1">
          <Link href="/" className="hover:text-[#1B2A5B]">Home</Link>
          <span>›</span>
          {product.collectionSlug ? (
            <>
              <Link href={`/collections/${product.collectionSlug}`} className="hover:text-[#1B2A5B]">{product.collectionName}</Link>
              <span>›</span>
            </>
          ) : (
            <>
              <Link href="/collections" className="hover:text-[#1B2A5B]">Collections</Link>
              <span>›</span>
            </>
          )}
          <span className="text-[#1B2A5B] font-medium truncate">{product.name}</span>
        </nav>

        <div className="grid lg:grid-cols-[100px_1fr_440px] gap-4 lg:gap-8">
          {/* Thumbnail rail */}
          <div className="hidden lg:flex flex-col gap-2 order-1">
            {gallery.map((img, i) => {
              const isActive = i === activeIndex;
              const label = i === 0 ? 'Front' : i === 1 ? 'Back' : i === 2 ? 'Side' : `View ${i + 1}`;
              return (
                <button
                  key={`${img}-${i}`}
                  onClick={() => setActiveImg(i)}
                  className={`relative rounded-md overflow-hidden border-2 transition-all ${isActive ? 'border-[#1B2A5B] shadow' : 'border-[#E5E7EB] hover:border-[#9CA3AF]'}`}
                  style={{ width: 84, height: 84 }}
                  title={label}
                >
                  <img src={img} alt={label} className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>

          {/* Main image */}
          <div className="order-2">
            <div className="relative bg-[#F3F4F6] rounded-lg overflow-hidden" style={{ aspectRatio: '1' }}>
              <img src={activeUrl} alt={product.name} className="w-full h-full object-cover" />
              {product.badge && (
                <span className="absolute top-3 left-3 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-[#1B2A5B] text-white">{product.badge}</span>
              )}
              {gallery.length > 1 && (
                <>
                  <button
                    aria-label="Previous"
                    onClick={() => setActiveImg((i) => (i - 1 + gallery.length) % gallery.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 shadow flex items-center justify-center hover:bg-white"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <button
                    aria-label="Next"
                    onClick={() => setActiveImg((i) => (i + 1) % gallery.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 shadow flex items-center justify-center hover:bg-white"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <span className="absolute bottom-3 right-3 text-xs font-medium px-2 py-1 rounded-full bg-black/55 text-white">{activeIndex + 1} / {gallery.length}</span>
                </>
              )}
            </div>
            {/* Mobile thumbs */}
            {gallery.length > 1 && (
              <div className="mt-3 grid grid-cols-5 gap-2 lg:hidden">
                {gallery.map((img, i) => (
                  <button key={`m-${img}-${i}`} onClick={() => setActiveImg(i)} className={`relative rounded-md overflow-hidden border-2 ${i === activeIndex ? 'border-[#1B2A5B]' : 'border-[#E5E7EB]'}`} style={{ aspectRatio: '1' }}>
                    <img src={img} alt={`view ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info / buy panel */}
          <div className="order-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#C41E3A] mb-1">{product.collectionName || product.category}</p>
            <h1 style={{ fontFamily: 'var(--font-playfair)' }} className="text-3xl font-medium text-[#1B2A5B] mb-3 leading-tight">{product.name}</h1>

            {product.description && <p className="text-sm text-[#4B5563] mb-4 leading-relaxed">{product.description}</p>}

            <div className="flex items-center justify-between gap-2 mb-2">
              <ProductRating productId={product.id} />
              <WishlistButton
                item={{ id: product.id, slug: product.slug, name: product.name, price: product.price, compareAt: product.compareAt, image: product.image, category: product.category }}
                className="w-9 h-9 text-[#6B7280] hover:text-[#C41E3A]"
                size={20}
              />
            </div>
            <div className="flex items-baseline gap-3 mb-6 pb-6 border-b border-[#E5E7EB]">
              <span className="text-3xl font-semibold text-[#1B2A5B]">${product.price.toFixed(2)}</span>
              {product.compareAt && (
                <>
                  <span className="text-lg text-[#9CA3AF] line-through">${product.compareAt.toFixed(2)}</span>
                  <span className="text-sm font-bold text-[#EF4444]">Save {savePct}%</span>
                </>
              )}
            </div>

            {colorOptions.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#374151] mb-2">Color: <span className="text-[#1B2A5B] normal-case font-medium">{cleanColorName(color)}</span></p>
                <div className="flex flex-wrap gap-3">
                  {colorOptions.map((c) => {
                    const isActive = cleanColorName(color) === c;
                    const cStock = stockForColor(c);
                    const soldOut = cStock === 0;
                    return (
                      <button
                        key={c}
                        onClick={() => { if (!soldOut) { setColor(c); setActiveImg(0); } }}
                        disabled={soldOut}
                        title={soldOut ? `${c} — sold out` : c}
                        aria-label={soldOut ? `${c} (sold out)` : c}
                        className={`relative w-9 h-9 rounded-full border-2 transition-all ${isActive ? 'border-[#1B2A5B] ring-2 ring-offset-2 ring-[#1B2A5B]/30' : 'border-[#D1D5DB] hover:border-[#1B2A5B]'} ${soldOut ? 'opacity-40 cursor-not-allowed' : ''}`}
                        style={{ background: getColorHex(c) }}
                      >
                        {soldOut && (
                          <span className="absolute inset-0 flex items-center justify-center text-[#1B2A5B] text-lg font-bold leading-none">／</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedColorStock !== null && (
                  selectedColorSoldOut ? (
                    <p className="mt-2 text-xs font-semibold text-[#C41E3A]">Sold out in {cleanColorName(color)} — pick another color.</p>
                  ) : selectedColorStock <= 5 ? (
                    <p className="mt-2 text-xs font-semibold text-[#B45309]">Only {selectedColorStock} left in {cleanColorName(color)}!</p>
                  ) : (
                    <p className="mt-2 text-xs text-[#166534]">{selectedColorStock} in stock in {cleanColorName(color)}</p>
                  )
                )}
              </div>
            )}

            {product.sizes.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#374151] mb-2">Size: <span className="text-[#1B2A5B] normal-case font-medium">{size}</span></p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((s) => {
                    const sStock = stockForColorSize(s);
                    const sizeSoldOut = sStock === 0;
                    return (
                      <button
                        key={s}
                        onClick={() => { if (!sizeSoldOut) setSize(s); }}
                        disabled={sizeSoldOut}
                        title={sizeSoldOut ? `${s} — sold out` : s}
                        className={`relative px-4 py-2 rounded-md text-sm font-semibold border-2 transition-all ${size === s ? 'bg-[#1B2A5B] border-[#1B2A5B] text-white' : 'bg-white border-[#D1D5DB] text-[#374151] hover:border-[#1B2A5B]'} ${sizeSoldOut ? 'opacity-40 cursor-not-allowed line-through' : ''}`}
                      >
                        {s}
                        {sizeSoldOut && <span className="sr-only"> (sold out)</span>}
                      </button>
                    );
                  })}
                </div>
                {selectedSizeSoldOut && (
                  <p className="mt-2 text-xs font-semibold text-[#C41E3A]">Size {size} is sold out — pick another size.</p>
                )}
              </div>
            )}

            {(product.sizeChartImage || product.sizeChartData) && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => setShowSizeChart((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#1B2A5B] hover:underline"
                >
                  📏 Size guide
                  <span aria-hidden>{showSizeChart ? '▴' : '▾'}</span>
                </button>

                {showSizeChart && (
                  <div className="mt-3 rounded-lg border border-[#E5E7EB] bg-[#FCFAF7] p-4">
                    {product.sizeChartData && (
                      <div className="mb-4">
                        <div className="mb-3 inline-flex rounded-md border border-[#D1D5DB] overflow-hidden text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => setChartUnit('in')}
                            className={`px-3 py-1.5 ${chartUnit === 'in' ? 'bg-[#1B2A5B] text-white' : 'bg-white text-[#374151]'}`}
                          >Inches</button>
                          <button
                            type="button"
                            onClick={() => setChartUnit('cm')}
                            className={`px-3 py-1.5 ${chartUnit === 'cm' ? 'bg-[#1B2A5B] text-white' : 'bg-white text-[#374151]'}`}
                          >Centimetres</button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-white text-left text-[#6B7280]">
                                <th className="px-2 py-1.5 font-semibold border border-[#E5E7EB]">Size</th>
                                {product.sizeChartData.columns.map((c) => (
                                  <th key={c} className="px-2 py-1.5 font-semibold border border-[#E5E7EB] whitespace-nowrap">{c}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {product.sizeChartData.rows.map((row, i) => (
                                <tr key={`${row.size}-${i}`} className="text-[#374151]">
                                  <td className="px-2 py-1.5 font-semibold border border-[#E5E7EB] bg-white">{row.size}</td>
                                  {product.sizeChartData!.columns.map((c) => {
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
                        {product.sizeChartData.notes && (
                          <p className="mt-2 text-[11px] text-[#6B7280]">{product.sizeChartData.notes}</p>
                        )}
                      </div>
                    )}
                    {product.sizeChartImage && (
                      <img
                        src={product.sizeChartImage}
                        alt={`${product.name} size chart`}
                        className="w-full max-w-lg rounded-md border border-[#E5E7EB] bg-white"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {product.allowCustomization && (
              <div className="mb-5 rounded-lg border border-[#E5E7EB] bg-[#FCFAF7] p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wantCustomization}
                    onChange={(e) => setWantCustomization(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[#D1D5DB]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#1B2A5B]">
                      ✏️ Personalise this item <span className="text-[#C41E3A]">+${CUSTOMIZATION_FEE.toFixed(2)}</span>
                    </span>
                    <span className="block text-xs text-[#6B7280] mt-0.5">
                      Add a name, number, or any special instructions — we’ll make it exactly how you want.
                    </span>
                  </span>
                </label>
                {wantCustomization && (
                  <textarea
                    value={customizationText}
                    onChange={(e) => setCustomizationText(e.target.value)}
                    rows={3}
                    maxLength={300}
                    placeholder="e.g. Name: KOFI · Number: 10 · any extra notes"
                    className="mt-3 w-full text-sm border border-[#D1D5DB] rounded-lg px-3 py-2 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]"
                  />
                )}
              </div>
            )}

            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#374151] mb-2">Quantity</p>
              <div className="inline-flex items-center border border-[#D1D5DB] rounded-md overflow-hidden">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2 text-[#374151] hover:bg-[#F9FAFB]">−</button>
                <span className="px-4 text-sm font-semibold min-w-[40px] text-center">{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} className="px-3 py-2 text-[#374151] hover:bg-[#F9FAFB]">+</button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {product.buyable && product.inStock === false ? (
                <NotifyBackInStock productId={product.id} />
              ) : product.buyable ? (
                <>
                  <button
                    onClick={handleAddToCart}
                    disabled={selectedColorSoldOut || selectedSizeSoldOut}
                    className="w-full py-3.5 px-6 rounded-lg bg-[#1B2A5B] text-white font-semibold hover:bg-[#2D4A8C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >{selectedColorSoldOut ? 'Sold out in this color' : selectedSizeSoldOut ? 'Sold out in this size' : 'Add to Cart'}</button>
                  <button
                    onClick={handleBuyNow}
                    disabled={selectedColorSoldOut || selectedSizeSoldOut}
                    className="w-full py-3.5 px-6 rounded-lg border-2 border-[#1B2A5B] text-[#1B2A5B] font-semibold hover:bg-[#F9FAFB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >Buy Now</button>
                </>
              ) : (
                <Link
                  href="/consults"
                  className="w-full text-center py-3.5 px-6 rounded-lg bg-[#C41E3A] text-white font-semibold hover:bg-[#A3162E] transition-colors"
                >Inquire &amp; Custom Fit</Link>
              )}
            </div>

            <div className="mt-6 bg-[#F0FDF4] border border-[#BBDBF7] rounded-lg p-4">
              <p className="text-xs text-[#166534] leading-relaxed">✓ Ships within 5–7 business days · Free returns within 14 days · Secure checkout</p>
            </div>

            {product.longDescription && (
              <div className="mt-8 pt-6 border-t border-[#E5E7EB]">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A5B] mb-3">Details</h2>
                <p className="text-sm text-[#4B5563] leading-relaxed whitespace-pre-line">{product.longDescription}</p>
              </div>
            )}

            {product.materials.length > 0 && (
              <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#374151] mb-2">Materials</h3>
                <p className="text-sm text-[#4B5563]">{product.materials.join(', ')}</p>
              </div>
            )}
          </div>
        </div>

        <ReviewsSection productId={product.id} />

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-16 pt-10 border-t border-[#E5E7EB]">
            <h2 style={{ fontFamily: 'var(--font-playfair)' }} className="text-2xl text-[#1B2A5B] mb-6">You may also like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {related.map((r) => (
                <Link key={r.id} href={`/products/${r.slug}`} className="group block">
                  <div className="aspect-square bg-[#F3F4F6] rounded-md overflow-hidden mb-2">
                    <img src={r.image} alt={r.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </div>
                  <p className="text-sm font-medium text-[#1B2A5B] line-clamp-2">{r.name}</p>
                  {(r.reviewCount ?? 0) > 0 && (
                    <div className="mt-1">
                      <InlineStars avg={r.avgRating ?? 0} count={r.reviewCount ?? 0} />
                    </div>
                  )}
                  <p className="text-sm font-semibold text-[#1B2A5B] mt-1">${r.price.toFixed(2)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
