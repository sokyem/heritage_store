'use client';

/**
 * /matchday — Ghana Black Stars Jersey Shop
 *
 * Goes straight to the products (no preview/landing hero). Pulls the
 * "ghana-black-stars" collection from /api/products, displays as a clean grid
 * (no sidebar filters), each card opens a modal to pick size + color and
 * add to cart.
 *
 * (The old /matchday/shop URL also lands here — see /matchday/shop/page.tsx.)
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useCart, buildCartLineId } from '@/components/CartContext';
import { CartIcon } from '@/components/CartDrawer';
import ModalReviews from '@/components/ModalReviews';
import { DEFAULT_MATCHDAY_FEATURE, type MatchdayFeatureContent } from '@/lib/site-content-defaults';
import { getColorHex, cleanColorName } from '@/lib/colors';
import { CUSTOMIZATION_FEE } from '@/lib/pricing';
import './matchday.css';

interface JerseyImageEntry {
  url: string;
  color: string | null;
  label: string | null;
}

interface Jersey {
  id: string;
  name: string;
  sku?: string;
  slug?: string;
  category?: string;
  gender?: string;
  price: number;
  compareAtPrice?: number;
  image: string;
  images?: string[];
  imageEntries?: JerseyImageEntry[];
  sizes: string[];
  colors: string[];
  inStock: boolean;
  description?: string;
  sizeChartImage?: string | null;
  sizeChartData?: SizeChartData | null;
  allowCustomization?: boolean;
  colorStock?: Record<string, number> | null;
  sizeStock?: Record<string, number> | null;
  variantStock?: Record<string, Record<string, number>> | null;
  totalStock?: number;
}

type SizeChartCell = { cm: number | null; in: number | null };
interface SizeChartData {
  unitDetected?: string;
  columns: string[];
  rows: Array<{ size: string; values: Record<string, SizeChartCell> }>;
  notes?: string;
}

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

export default function MatchdayShop() {
  const { addItem } = useCart();
  const [jerseys, setJerseys] = useState<Jersey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Hero copy is admin-editable via site content (matchday_feature), not hardcoded.
  const [feature, setFeature] = useState<MatchdayFeatureContent>(DEFAULT_MATCHDAY_FEATURE);

  // Detail modal state
  const [selectedJersey, setSelectedJersey] = useState<Jersey | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedJerseySize, setSelectedJerseySize] = useState<string>('');
  const [selectedJerseyColor, setSelectedJerseyColor] = useState<string>('');
  const [addingToCart, setAddingToCart] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [showSizeChart, setShowSizeChart] = useState(false);
  const [chartUnit, setChartUnit] = useState<'cm' | 'in'>('in');
  const [wantCustomization, setWantCustomization] = useState(false);
  const [customizationText, setCustomizationText] = useState('');

  // Per-card color highlight (drives image swap in the grid)
  const [cardColorByJersey, setCardColorByJersey] = useState<Record<string, string>>({});

  const openJersey = useCallback((j: Jersey) => {
    setSelectedImageIndex(0);
    setSelectedJerseySize(j.sizes[0] || '');
    setSelectedJerseyColor(j.colors[0] || '');
    setShowSizeChart(false);
    setChartUnit('in');
    setWantCustomization(false);
    setCustomizationText('');
    setSelectedJersey(j);
  }, []);

  // Per-color stock lookup. When variantStock is present, derive per-color
  // totals from it. Falls back to legacy colorStock.
  const stockForColor = useCallback((j: Jersey, c: string): number | null => {
    if (!c) return null;
    if (j.variantStock) {
      const colorKey = Object.keys(j.variantStock).find(
        (k) => cleanColorName(k).toLowerCase() === cleanColorName(c).toLowerCase()
      );
      if (!colorKey) return null;
      return Object.values(j.variantStock[colorKey]).reduce((s, n) => s + (Number(n) || 0), 0);
    }
    if (!j.colorStock) return null;
    const key = Object.keys(j.colorStock).find(
      (k) => cleanColorName(k).toLowerCase() === cleanColorName(c).toLowerCase(),
    );
    return key ? Number(j.colorStock[key]) || 0 : null;
  }, []);

  // Per-size stock for the selected color — uses variantStock when available.
  const stockForColorSize = useCallback((j: Jersey, c: string, s: string): number | null => {
    if (!s) return null;
    if (j.variantStock) {
      const colorKey = Object.keys(j.variantStock).find(
        (k) => cleanColorName(k).toLowerCase() === cleanColorName(c).toLowerCase()
      );
      if (!colorKey) {
        const totals: Record<string, number> = {};
        for (const sizes of Object.values(j.variantStock)) {
          for (const [sz, qty] of Object.entries(sizes)) {
            totals[sz.trim().toUpperCase()] = (totals[sz.trim().toUpperCase()] || 0) + (Number(qty) || 0);
          }
        }
        const sKey = Object.keys(totals).find((k) => k === s.trim().toUpperCase());
        return sKey !== undefined ? totals[sKey] : null;
      }
      const sizeMap = j.variantStock[colorKey];
      const sizeKey = Object.keys(sizeMap).find((k) => k.trim().toUpperCase() === s.trim().toUpperCase());
      // Matrix has this color but not this size = 0 stock for that combo.
      return sizeKey !== undefined ? Number(sizeMap[sizeKey]) : 0;
    }
    if (!j.sizeStock) return null;
    const key = Object.keys(j.sizeStock).find((k) => k.trim().toUpperCase() === s.trim().toUpperCase());
    return key !== undefined ? Number(j.sizeStock[key]) : null;
  }, []);

  const getJerseyGallery = useCallback((j: Jersey, color?: string | null): string[] => {
    if (color && j.imageEntries && j.imageEntries.length > 0) {
      const needle = color.trim().toLowerCase();
      const tagged: string[] = [];
      const rest: string[] = [];
      for (const e of j.imageEntries) {
        if (!e?.url) continue;
        if (e.color && e.color.trim().toLowerCase() === needle) tagged.push(e.url);
        else rest.push(e.url);
      }
      const ordered = [...tagged, ...rest];
      if (ordered.length > 0) return ordered;
    }
    const list: string[] = [];
    if (j.image) list.push(j.image);
    if (Array.isArray(j.images)) for (const img of j.images) if (img && !list.includes(img)) list.push(img);
    return list;
  }, []);

  const pickJerseyImage = useCallback((j: Jersey, color?: string | null): string => {
    return getJerseyGallery(j, color)[0] || j.image;
  }, [getJerseyGallery]);

  const handleAddToCart = useCallback((j: Jersey, size?: string, color?: string) => {
    setAddingToCart(true);
    try {
      const s = size ?? selectedJerseySize;
      const c = color ?? selectedJerseyColor;
      // Block a sold-out color.
      if (stockForColor(j, c) === 0) {
        setAddingToCart(false);
        return;
      }
      const custom = j.allowCustomization && wantCustomization && customizationText.trim()
        ? customizationText.trim()
        : undefined;
      const unitPrice = custom ? j.price + CUSTOMIZATION_FEE : j.price;
      addItem({
        id: buildCartLineId(j.id, s, c, custom),
        productId: j.id,
        slug: j.slug || j.sku,
        name: j.name,
        price: unitPrice,
        image: j.image,
        size: s || undefined,
        color: c || undefined,
        customization: custom,
      });
      setSelectedJersey(null);
      setJustAddedId(j.id);
      setTimeout(() => setJustAddedId((id) => (id === j.id ? null : id)), 1500);
    } catch (err) {
      console.error('Add to cart failed:', err);
      alert('Could not add to cart. Please try again.');
    } finally {
      setAddingToCart(false);
    }
  }, [addItem, selectedJerseySize, selectedJerseyColor, stockForColor, wantCustomization, customizationText]);

  // Fetch jerseys on mount — try the collection first, fall back to sportswear
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const endpoints = [
          '/api/products?collection=ghana-black-stars',
          '/api/products?category=sportswear',
        ];
        let data: Jersey[] = [];
        for (const ep of endpoints) {
          const response = await fetch(ep, { cache: 'no-store' });
          if (!response.ok) continue;
          const json = await response.json();
          const list = Array.isArray(json) ? json : json.products || [];
          if (list.length > 0) {
            data = list.map((product: any) => {
              // Normalize per-image color tags (strip stray brackets/quotes
              // that can leak in from admin paste). Keeps the image gallery
              // grouping working when admin saved `"Spider White"` etc.
              const rawEntries = Array.isArray(product.imageEntries) ? product.imageEntries : [];
              const imageEntries: JerseyImageEntry[] = rawEntries.map((e: any) => ({
                url: String(e?.url || ''),
                color: cleanColorName(e?.color) || null,
                label: e?.label || null,
              }));
              // Prefer the explicit colors[] admins set, but fall back to the
              // distinct colors tagged on the images so /matchday matches what
              // /collections/[slug] already does — otherwise products with
              // only image-level color tags show no swatches here.
              const adminColors = Array.isArray(product.colors)
                ? product.colors.map((c: unknown) => cleanColorName(c as string)).filter(Boolean)
                : [];
              const entryColors = Array.from(new Set(
                imageEntries.map((e) => e.color || '').filter(Boolean) as string[],
              ));
              const colors = adminColors.length > 0 ? adminColors : entryColors;
              return {
              id: product.id,
              name: product.name,
              sku: product.sku,
              slug: product.slug || product.id,
              category: product.category,
              gender: product.gender,
              price: typeof product.price === 'number' ? product.price : 0,
              compareAtPrice: product.compareAt,
              image: product.image || '/Ghana_jersey_old.webp',
              images: Array.isArray(product.images) ? product.images : undefined,
              imageEntries,
              sizes: Array.isArray(product.sizes) && product.sizes.length > 0
                ? product.sizes
                : DEFAULT_SIZES,
              colors,
              inStock: true,
              description: product.description,
              sizeChartImage: product.sizeChartImage || null,
              sizeChartData: product.sizeChartData || null,
              allowCustomization: product.allowCustomization || false,
              colorStock: product.colorStock || null,
              sizeStock: product.sizeStock || null,
              variantStock: product.variantStock || null,
              totalStock: typeof product.totalStock === 'number' ? product.totalStock : undefined,
            };
            });
            break;
          }
        }
        setJerseys(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching jerseys:', err);
        setError('Failed to load jerseys. Please refresh.');
        setJerseys([]);
      } finally {
        setLoading(false);
      }
    })();

    // Editable hero copy (admin → Site Content → matchday_feature).
    fetch('/api/site-content/matchday_feature')
      .then((r) => r.json())
      .then((d) => {
        const value = d?.value ?? d;
        if (value && typeof value === 'object') {
          setFeature({ ...DEFAULT_MATCHDAY_FEATURE, ...(value as Partial<MatchdayFeatureContent>) });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="matchday-container matchday-shop">
      {/* Floating cart */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50 }}>
        <div className="bg-white rounded-full shadow-lg border border-[#E5E7EB] flex items-center">
          <CartIcon className="text-[#1B2A5B]" />
        </div>
      </div>

      {/* Hero — copy is editable (Site Content → matchday_feature); jerseys
          scroll across in a marquee instead of a static gradient. */}
      <section
        style={{
          background: 'linear-gradient(135deg, #006B3F 0%, #FCD116 50%, #CE1126 100%)',
          padding: '48px 24px 0',
          textAlign: 'center',
          color: 'white',
          overflow: 'hidden',
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.9, marginBottom: 8 }}>
          ⭐ {feature.badge || 'Ghana Black Stars'}
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'clamp(2rem, 5vw, 3rem)',
            fontWeight: 600,
            margin: 0,
            color: 'white',
            textShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          {feature.title || 'Get Ready for the Ultimate Drip'}
        </h1>
        <p style={{ marginTop: 12, fontSize: 16, opacity: 0.95 }}>
          {feature.body || 'Official Ghana jerseys · ships within 5–7 business days'}
        </p>

        {jerseys.length > 0 && (
          <div className="aw-marquee-wrap" aria-hidden="true">
            <div className="aw-marquee">
              {[...jerseys, ...jerseys].map((j, i) => (
                <div key={`${j.id}-${i}`} className="aw-marquee-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={j.image || '/Ghana_jersey_old.webp'} alt={j.name} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Video promo — clicking the video or the button scrolls down to the
          product grid. We use an anchor (#jerseys) for smooth in-page nav. */}
      <div className="bg-[#0F1A3A] px-4 lg:px-8 py-10">
        <div className="max-w-[1280px] mx-auto grid md:grid-cols-2 gap-8 items-center">
          {/* Clickable video */}
          <a href="#jerseys" className="relative block rounded-xl overflow-hidden shadow-xl group cursor-pointer">
            <video
              autoPlay
              muted
              loop
              playsInline
              poster="/media/matchday-promo-poster.jpg"
              preload="metadata"
              className="w-full object-cover max-h-[420px] transition-transform duration-700 group-hover:scale-105"
            >
              {/* Always serve the mobile-optimised 720p file — the <source media>
                  attribute is not reliable for <video> elements. */}
              <source src="/media/matchday-promo-mobile.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
              <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/40 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </div>
            </div>
            <span className="absolute bottom-3 left-3 bg-[#CE1126] text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full">
              Shop Now ↓
            </span>
          </a>
          {/* Copy */}
          <div className="text-white space-y-4">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#FCD116]">⭐ Official Kits</p>
            <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl font-normal leading-tight">
              Wear the Pride.<br />Rep the Stars.
            </h2>
            <p className="text-base text-white/70 leading-relaxed">
              Every Ghana Black Stars kit in one place. Pick your style, select your size, and ship it to your door.
            </p>
            <a
              href="#jerseys"
              className="inline-flex items-center gap-2 bg-[#CE1126] hover:bg-[#A3162E] text-white px-7 py-3 rounded-lg text-sm font-semibold tracking-wider uppercase transition-all hover:shadow-lg"
            >
              Shop All Jerseys
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M4 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
          </div>
        </div>
      </div>

      {/* Product grid (no sidebar) */}
      <main id="jerseys" className="max-w-[1280px] mx-auto px-4 lg:px-8 py-10">
        {loading ? (
          <div className="text-center py-16">
            <div className="loading-spinner mx-auto mb-3" />
            <p className="text-sm text-[#8B7569]">Loading jerseys…</p>
          </div>
        ) : error ? (
          <div className="bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg p-6 text-center">
            <p className="text-[#991B1B] font-semibold">{error}</p>
          </div>
        ) : jerseys.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-6xl mb-4">🇬🇭</p>
            <h3 className="text-xl font-semibold text-[#1B2A5B] mb-2">No jerseys yet</h3>
            <p className="text-sm text-[#8B7569]">
              Check back soon. Or browse our <Link href="/collections" className="text-[#CE1126] underline">main collection</Link>.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {jerseys.map((jersey) => {
                const cardColor = cardColorByJersey[jersey.id] || null;
                const cardImage = pickJerseyImage(jersey, cardColor);
                const isJustAdded = justAddedId === jersey.id;
                return (
                  <div
                    key={jersey.id}
                    className="group bg-white rounded-xl overflow-hidden border border-[#E5E7EB] hover:border-[#1B2A5B] hover:shadow-lg transition-all cursor-pointer"
                    onClick={() => openJersey(jersey)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openJersey(jersey); } }}
                  >
                    {/* Image */}
                    <div className="relative aspect-square bg-[#F3F4F6] overflow-hidden">
                      <img
                        src={cardImage}
                        alt={jersey.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      {jersey.compareAtPrice && (
                        <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#CE1126] text-white shadow">
                          Sale
                        </span>
                      )}
                      {(!jersey.inStock || jersey.totalStock === 0) && (
                        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#6B7280] text-white shadow">
                          Sold Out
                        </span>
                      )}
                      {isJustAdded && (
                        <div className="absolute inset-0 bg-[#2D8E5A]/90 flex items-center justify-center animate-fade-in">
                          <div className="text-center text-white">
                            <p className="text-4xl mb-2">✓</p>
                            <p className="text-sm font-semibold">Added to cart</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <p className="text-[10px] font-bold tracking-wider uppercase text-[#CE1126] mb-1">
                        {jersey.category || 'Ghana Black Stars'}
                      </p>
                      <h3 className="font-semibold text-[#1B2A5B] mb-2 leading-snug line-clamp-2 min-h-[40px]">
                        {jersey.name}
                      </h3>

                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-lg font-bold text-[#1B2A5B]">${jersey.price.toFixed(2)}</span>
                        {jersey.compareAtPrice && (
                          <span className="text-sm text-[#9CA3AF] line-through">${jersey.compareAtPrice.toFixed(2)}</span>
                        )}
                      </div>

                      {/* Color swatches */}
                      {jersey.colors.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {jersey.colors.slice(0, 5).map((color) => {
                            const isActive = cardColor === color;
                            const cStock = stockForColor(jersey, color);
                            const colorSoldOut = cStock === 0;
                            return (
                              <button
                                type="button"
                                key={color}
                                title={colorSoldOut ? `${color} — sold out` : color}
                                onMouseEnter={() => setCardColorByJersey((m) => ({ ...m, [jersey.id]: color }))}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCardColorByJersey((m) => ({ ...m, [jersey.id]: color }));
                                }}
                                className={`relative w-5 h-5 rounded-full border border-[#D1D5DB] transition-all ${colorSoldOut ? 'opacity-40' : ''}`}
                                style={{
                                  backgroundColor: getColorHex(color),
                                  outline: isActive ? '2px solid #1B2A5B' : undefined,
                                  outlineOffset: isActive ? '2px' : undefined,
                                }}
                              >
                                {colorSoldOut && (
                                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-white drop-shadow"><line x1="3" y1="17" x2="17" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Size chips */}
                      {jersey.sizes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {jersey.sizes.map((sz) => {
                            const szStock = stockForColorSize(jersey, cardColor || '', sz);
                            const szSoldOut = szStock === 0;
                            return (
                              <span
                                key={sz}
                                title={szSoldOut ? `${sz} — sold out` : `${sz} — in stock`}
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none ${szSoldOut ? 'border-[#E5E7EB] text-[#9CA3AF] line-through bg-[#F9FAFB]' : 'border-[#D1FAE5] text-[#065F46] bg-[#ECFDF5]'}`}
                              >
                                {sz}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {(() => {
                        const colorSoldOut = stockForColor(jersey, cardColor || '') === 0;
                        const entirelySoldOut = !jersey.inStock || (jersey.totalStock !== undefined && jersey.totalStock === 0);
                        const isSoldOut = entirelySoldOut || colorSoldOut;
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isSoldOut) openJersey(jersey);
                            }}
                            disabled={isSoldOut}
                            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${isSoldOut ? 'bg-[#F3F4F6] text-[#9CA3AF] border border-[#E5E7EB] cursor-not-allowed' : 'bg-[#1B2A5B] text-white hover:bg-[#0F1A3A]'}`}
                          >
                            {isSoldOut ? 'Sold Out' : 'Add to Cart'}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Product detail modal */}
      {selectedJersey && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSelectedJersey(null)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedJersey(null)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white shadow flex items-center justify-center text-[#374151] hover:bg-[#F3F4F6]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="grid lg:grid-cols-[110px_1fr_1fr] gap-4 lg:gap-6 p-4 lg:p-8">
              {(() => {
                const gallery = getJerseyGallery(selectedJersey, selectedJerseyColor);
                const activeIndex = Math.min(selectedImageIndex, Math.max(gallery.length - 1, 0));
                const activeImg = gallery[activeIndex] || selectedJersey.image;
                return (
                  <>
                    {/* Thumbnails */}
                    <div className="hidden lg:flex flex-col gap-2 order-1">
                      {gallery.map((img, i) => {
                        const isActive = i === activeIndex;
                        const label = i === 0 ? 'Front' : i === 1 ? 'Back' : `View ${i + 1}`;
                        return (
                          <button
                            key={`${img}-${i}`}
                            type="button"
                            onClick={() => setSelectedImageIndex(i)}
                            title={label}
                            className={`relative rounded-md overflow-hidden border-2 transition-all ${isActive ? 'border-[#CE1126] shadow-md' : 'border-[#E5E7EB] hover:border-[#9CA3AF]'}`}
                            style={{ width: 90, height: 90 }}
                          >
                            <img src={img} alt={label} className="w-full h-full object-cover" />
                          </button>
                        );
                      })}
                    </div>

                    {/* Main image */}
                    <div className="order-2">
                      <div className="relative bg-[#F3F4F6] rounded-lg overflow-hidden" style={{ aspectRatio: '1' }}>
                        <img src={activeImg} alt={selectedJersey.name} className="w-full h-full object-cover" />
                        {gallery.length > 1 && (
                          <>
                            <button
                              type="button"
                              aria-label="Previous"
                              onClick={() => setSelectedImageIndex((i) => (i - 1 + gallery.length) % gallery.length)}
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 shadow flex items-center justify-center hover:bg-white"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <button
                              type="button"
                              aria-label="Next"
                              onClick={() => setSelectedImageIndex((i) => (i + 1) % gallery.length)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/95 shadow flex items-center justify-center hover:bg-white"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </button>
                            <span className="absolute bottom-3 right-3 text-xs font-medium px-2 py-1 rounded-full bg-black/55 text-white">
                              {activeIndex + 1} / {gallery.length}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Buy panel */}
                    <div className="order-3 flex flex-col">
                      <p className="text-xs font-bold tracking-wider uppercase text-[#CE1126] mb-2">
                        {selectedJersey.category || 'Ghana Black Stars'}
                      </p>
                      <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-2xl lg:text-3xl font-medium text-[#1B2A5B] mb-4 leading-snug">
                        {selectedJersey.name}
                      </h2>

                      <div className="flex items-baseline gap-3 mb-6 pb-6 border-b border-[#E5E7EB]">
                        <span className="text-3xl font-semibold text-[#1B2A5B]">${selectedJersey.price.toFixed(2)}</span>
                        {selectedJersey.compareAtPrice && (
                          <>
                            <span className="text-lg text-[#9CA3AF] line-through">${selectedJersey.compareAtPrice.toFixed(2)}</span>
                            <span className="text-sm font-bold text-[#EF4444]">
                              Save {Math.round(((selectedJersey.compareAtPrice - selectedJersey.price) / selectedJersey.compareAtPrice) * 100)}%
                            </span>
                          </>
                        )}
                      </div>

                      {selectedJersey.colors.length > 0 && (
                        <div className="mb-5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#374151] mb-2">
                            Color: <span className="text-[#1B2A5B] normal-case font-medium">{selectedJerseyColor}</span>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {selectedJersey.colors.map((color) => {
                              const isActive = selectedJerseyColor === color;
                              const cStock = stockForColor(selectedJersey, color);
                              const soldOut = cStock === 0;
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => { if (!soldOut) { setSelectedJerseyColor(color); setSelectedImageIndex(0); } }}
                                  disabled={soldOut}
                                  title={soldOut ? `${color} — sold out` : color}
                                  className={`relative w-9 h-9 rounded-full border-2 transition-all ${isActive ? 'border-[#1B2A5B] ring-2 ring-offset-2 ring-[#1B2A5B]/30' : 'border-[#D1D5DB] hover:border-[#1B2A5B]'} ${soldOut ? 'opacity-40 cursor-not-allowed' : ''}`}
                                  style={{ backgroundColor: getColorHex(color) }}
                                >
                                  {soldOut && (
                                    <span className="absolute inset-0 flex items-center justify-center text-[#1B2A5B] text-lg font-bold leading-none">／</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {(() => {
                            const cStock = stockForColor(selectedJersey, selectedJerseyColor);
                            if (cStock === null) return null;
                            if (cStock === 0) return <p className="mt-2 text-xs font-semibold text-[#C41E3A]">Sold out in {cleanColorName(selectedJerseyColor)} — pick another color.</p>;
                            if (cStock <= 5) return <p className="mt-2 text-xs font-semibold text-[#B45309]">Only {cStock} left in {cleanColorName(selectedJerseyColor)}!</p>;
                            return <p className="mt-2 text-xs text-[#166534]">{cStock} in stock in {cleanColorName(selectedJerseyColor)}</p>;
                          })()}
                        </div>
                      )}

                      {selectedJersey.sizes.length > 0 && (
                        <div className="mb-6">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#374151] mb-2">
                            Size: <span className="text-[#1B2A5B] normal-case font-medium">{selectedJerseySize}</span>
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {selectedJersey.sizes.map((size) => {
                              const isActive = selectedJerseySize === size;
                              const sStock = stockForColorSize(selectedJersey, selectedJerseyColor, size);
                              const sizeSoldOut = sStock === 0;
                              return (
                                <button
                                  key={size}
                                  type="button"
                                  onClick={() => { if (!sizeSoldOut) setSelectedJerseySize(size); }}
                                  disabled={sizeSoldOut}
                                  title={sizeSoldOut ? `${size} — sold out` : size}
                                  className={`relative px-4 py-2 rounded-md text-sm font-semibold border-2 transition-all ${isActive ? 'bg-[#1B2A5B] border-[#1B2A5B] text-white' : 'bg-white border-[#D1D5DB] text-[#374151] hover:border-[#1B2A5B]'} ${sizeSoldOut ? 'opacity-40 cursor-not-allowed line-through' : ''}`}
                                >
                                  {size}
                                  {sizeSoldOut && <span className="sr-only"> (sold out)</span>}
                                </button>
                              );
                            })}
                          </div>
                          {(() => {
                            const sStock = stockForColorSize(selectedJersey, selectedJerseyColor, selectedJerseySize);
                            return sStock === 0 ? (
                              <p className="mt-2 text-xs font-semibold text-[#C41E3A]">Size {selectedJerseySize} is sold out — pick another size.</p>
                            ) : null;
                          })()}
                        </div>
                      )}

                      {(selectedJersey.sizeChartImage || selectedJersey.sizeChartData) && (
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
                              {selectedJersey.sizeChartData && (
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
                                          {selectedJersey.sizeChartData.columns.map((c) => (
                                            <th key={c} className="px-2 py-1.5 font-semibold border border-[#E5E7EB] whitespace-nowrap">{c}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {selectedJersey.sizeChartData.rows.map((row, i) => (
                                          <tr key={`${row.size}-${i}`} className="text-[#374151]">
                                            <td className="px-2 py-1.5 font-semibold border border-[#E5E7EB] bg-white">{row.size}</td>
                                            {selectedJersey.sizeChartData!.columns.map((c) => {
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
                                  {selectedJersey.sizeChartData.notes && (
                                    <p className="mt-2 text-[11px] text-[#6B7280]">{selectedJersey.sizeChartData.notes}</p>
                                  )}
                                </div>
                              )}
                              {selectedJersey.sizeChartImage && (
                                <img src={selectedJersey.sizeChartImage} alt={`${selectedJersey.name} size chart`} className="w-full max-w-lg rounded-md border border-[#E5E7EB] bg-white" />
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {selectedJersey.allowCustomization && (
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
                                ✏️ Personalise this jersey <span className="text-[#C41E3A]">+${CUSTOMIZATION_FEE.toFixed(2)}</span>
                              </span>
                              <span className="block text-xs text-[#6B7280] mt-0.5">Add a name, number, or special instructions.</span>
                            </span>
                          </label>
                          {wantCustomization && (
                            <textarea
                              value={customizationText}
                              onChange={(e) => setCustomizationText(e.target.value)}
                              rows={3}
                              maxLength={300}
                              placeholder="e.g. Name: KOFI · Number: 10"
                              className="mt-3 w-full text-sm border border-[#D1D5DB] rounded-lg px-3 py-2 bg-white text-[#1B2A5B] focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]"
                            />
                          )}
                        </div>
                      )}

                      {selectedJersey.description && (
                        <p className="text-sm text-[#4B5563] leading-relaxed mb-5 pb-5 border-b border-[#E5E7EB]">
                          {selectedJersey.description}
                        </p>
                      )}

                      <ModalReviews productId={selectedJersey.id} productSlug={selectedJersey.slug} />

                      <div className="flex flex-col gap-3 mt-6">
                        {(() => {
                          const selColorSoldOut = stockForColor(selectedJersey, selectedJerseyColor) === 0;
                          const selSizeSoldOut = stockForColorSize(selectedJersey, selectedJerseyColor, selectedJerseySize) === 0;
                          const selSoldOut = selColorSoldOut || selSizeSoldOut;
                          return (
                            <button
                              onClick={() => handleAddToCart(selectedJersey)}
                              disabled={addingToCart || !selectedJersey.inStock || selSoldOut}
                              className="w-full py-3.5 px-6 rounded-lg bg-[#CE1126] text-white font-semibold text-base hover:bg-[#A3162E] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {addingToCart ? 'Adding…' : selColorSoldOut ? 'Sold out in this color' : selSizeSoldOut ? 'Sold out in this size' : selectedJersey.inStock ? 'Add to Cart' : 'Sold Out'}
                            </button>
                          );
                        })()}
                      </div>

                      <div className="mt-6 bg-[#F0FDF4] border border-[#BBDBF7] rounded-lg p-4">
                        <p className="text-xs text-[#166534] leading-relaxed">
                          ✓ Ships within 5–7 business days · Free returns within 14 days
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
