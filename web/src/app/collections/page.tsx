'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { signIn } from 'next-auth/react';
import { useEffect, useState, useRef } from 'react';
import { resolveStorefrontImage } from '@/lib/storefront-media';
import { trackViewItemList } from '@/lib/analytics';

/* ── Featured product types ────────────────────────── */
interface FeaturedProduct {
  id: string;
  section: string;
  title: string | null;
  isActive: boolean;
  product: {
    id: string;
    name: string;
    slug: string | null;
    price: number;
    compareAtPrice: number | null;
    images: string | null;
    category: string;
    isNewArrival: boolean;
    isFeatured: boolean;
  };
}

interface CuratedItem {
  name: string;
  price: number;
  compareAt?: number;
  image: string;
  category: string;
  badge?: string;
}

function isReadyToShipCollectionItem(item: CuratedItem) {
  return item.category === 'African Jewelry' || item.category === 'Accessories';
}

/* ── Fallback curated pieces (shown when admin hasn't featured any) ── */
const signaturePieces: CuratedItem[] = [
  { name: 'Crimson Embroidered Kaftan', price: 2850, image: '/media/IMG_8376.jpg', category: 'Custom Couture', badge: 'New' },
  { name: 'Orange Blossom Corset Gown', price: 2950, image: '/media/orange-mermaid-full.jpg', category: 'Custom Couture', badge: 'New' },
  { name: 'Olive Art-Deco Mermaid', price: 3800, image: '/media/IMG_3628.jpg', category: 'Custom Couture', badge: 'Signature' },
  { name: 'Brass Cowrie Shell Choker', price: 120, image: '/media/jewelry-cowrie-choker.jpg', category: 'African Jewelry', badge: 'New' },
  { name: 'Silver Sequin Cascade', price: 1800, image: '/media/silver-sequin-toast.jpg', category: 'Custom Couture' },
  { name: 'Bridal Pearl-Beaded Gown', price: 4200, image: '/media/bridal-veil-portrait.jpg', category: 'Bridal Ceremonial', badge: 'Limited' },
  { name: 'Krobo Bead Bracelet Set', price: 85, image: '/media/jewelry-beaded-bracelet.jpg', category: 'African Jewelry', badge: 'New' },
  { name: 'Gold Sequin Column Dress', price: 2400, image: '/media/IMG_4753.jpg', category: 'Custom Couture', badge: 'Signature' },
];

const collections = [
  {
    name: 'Women',
    slug: 'women',
    description: 'Handcrafted African print dresses, kimonos, shirts and skirts. From bold Adire shift dresses to elegant kaftans — each piece tells a story.',
    image: '/media/storefront/shopify/bubu-1.jpg',
    count: 14,
  },
  {
    name: 'Men',
    slug: 'men',
    description: 'African print shirts for men, crafted from 100% cotton fabric and adorned with intricate embroidery. Modern style rooted in cultural heritage.',
    image: '/media/storefront/shopify/odoi-men-shirt-1.jpg',
    count: 8,
  },
  {
    name: 'Jewelry & Accessories',
    slug: 'jewelry',
    description: 'Ready-to-ship Ghanaian jewelry and accessories — handcrafted brass, Krobo beads, waist beads, headwraps, and statement pieces rooted in heritage.',
    image: '/media/jewelry-waist-beads.jpg',
    count: 12,
  },
  {
    name: 'Couture & Ceremonial',
    slug: 'couture',
    description: 'Bespoke gowns, traditional wedding attire, and ceremonial pieces. One-of-a-kind couture for life\'s most important moments.',
    image: '/media/IMG_8376.jpg',
    count: 6,
  },
  {
    name: 'Prom',
    slug: 'prom',
    description: 'Pre-made custom prom dresses — luxury, elegance, and originality without the wait. One-of-a-kind gowns handcrafted with premium fabrics.',
    image: '/media/storefront/shopify/ariel-corset-gown-1.jpg',
    count: 1,
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    description: 'Curated African accessories to complete your look. Artisan headwraps, handwoven clutches, and heritage statement pieces.',
    image: '/media/jewelry-headwrap.jpg',
    count: 2,
  },
];

/* ── Crossfading hero backdrop ──────────────────────── */
const heroImages = [
  '/media/orange-mermaid-full.jpg',
  '/media/silver-sequin-flow.jpg',
  '/media/bridal-veil-portrait.jpg',
  '/media/IMG_8376.jpg',
  '/media/orange-corset-pose.jpg',
  '/media/silver-sequin-pose.jpg',
  '/media/IMG_7454.jpg',
  '/media/bridal-beaded-full.jpg',
];

function HeroBackdrop() {
  const [current, setCurrent] = useState(0);
  const [next, setNext] = useState(1);
  const [transitioning, setTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cycle = () => {
      setTransitioning(true);
      timerRef.current = setTimeout(() => {
        setCurrent((prev) => (prev + 1) % heroImages.length);
        setNext((prev) => (prev + 1) % heroImages.length);
        setTransitioning(false);
      }, 1200); // crossfade duration
    };

    const interval = setInterval(cycle, 5000); // change every 5s
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <section className="relative overflow-hidden bg-[#0F1A3A]" style={{ minHeight: '420px' }}>
      {/* Background images with crossfade */}
      {heroImages.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0 transition-opacity ease-in-out"
          style={{
            opacity: i === current ? 1 : i === next && transitioning ? 1 : 0,
            transitionDuration: '1200ms',
            zIndex: i === current ? 1 : i === next && transitioning ? 2 : 0,
          }}
        >
          <img
            src={src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              transform: i === current && !transitioning ? 'scale(1.08)' : 'scale(1)',
              transition: 'transform 5s ease-out',
            }}
          />
        </div>
      ))}

      {/* Dark overlay */}
      <div className="absolute inset-0 z-10" style={{
        background: 'linear-gradient(to bottom, rgba(15,26,58,0.72) 0%, rgba(15,26,58,0.82) 50%, rgba(15,26,58,0.92) 100%)',
      }} />

      {/* Content */}
      <div className="relative z-20 flex flex-col items-center justify-center text-center py-20 md:py-28 px-6 lg:px-12">
        <p className="text-sm font-semibold tracking-[0.2em] uppercase text-[#E8364F] mb-5 animate-fade-in">Shop Our World</p>
        <h1
          style={{ fontFamily: 'var(--font-heading)' }}
          className="text-4xl md:text-[3.5rem] font-normal leading-[1.1] tracking-[0.01em] text-white mb-6 animate-fade-in"
        >
          Collections
        </h1>
        <p className="text-lg text-white/60 leading-relaxed max-w-[560px] animate-fade-in" style={{ animationDelay: '200ms' }}>
          Explore curated collections rooted in African craftsmanship, designed for the modern world.
        </p>

        {/* Slide indicator dots */}
        <div className="flex gap-2 mt-10">
          {heroImages.map((_, i) => (
            <span
              key={i}
              className="block rounded-full transition-all duration-500"
              style={{
                width: i === current ? '24px' : '8px',
                height: '8px',
                backgroundColor: i === current ? '#E8364F' : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface AdminCollectionTile { id: string; name: string; slug: string; description: string; image: string; count: number }

export default function CollectionsPage() {
  const { data: session } = useSession();
  // Curated Pieces are driven by admin "featured" products — no hardcoded
  // fallback. Empty until /api/featured loads; the section hides if none.
  const [curatedItems, setCuratedItems] = useState<CuratedItem[]>([]);
  // Admin-managed collections (replaces the hardcoded tiles when present).
  const [adminCollections, setAdminCollections] = useState<AdminCollectionTile[]>([]);

  useEffect(() => {
    fetch('/api/collections', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setAdminCollections(Array.isArray(d.collections) ? d.collections : []))
      .catch(() => {});
  }, []);

  // Fire the ViewCategory / view_item_list event once for the collections landing.
  useEffect(() => {
    trackViewItemList(
      'Collections',
      signaturePieces.map((p) => ({ id: p.name, name: p.name, price: p.price, category: p.category }))
    );
  }, []);

  useEffect(() => {
    fetch('/api/featured')
      .then(res => res.json())
      .then(data => {
        const items = (data.placements || []) as FeaturedProduct[];
        if (items.length > 0) {
          setCuratedItems(items.slice(0, 8).map((fp: FeaturedProduct) => {
            let imgUrl = '';
            try { const imgs = JSON.parse(fp.product.images || '[]'); imgUrl = imgs[0] || ''; } catch { /* */ }
            return {
              name: fp.title || fp.product.name,
              price: fp.product.price,
              compareAt: fp.product.compareAtPrice || undefined,
              image: resolveStorefrontImage(imgUrl, {
                category: fp.product.category,
                slug: fp.product.slug || fp.product.id,
              }),
              category: fp.product.category?.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || '',
              badge: fp.product.isNewArrival ? 'New' : fp.product.isFeatured ? 'Curated' : undefined,
            };
          }));
        }
      })
      .catch(() => {});
  }, []);

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
                  <Link href="/customer/dashboard" className="text-[0.95rem] font-medium tracking-[0.06em] uppercase text-[#8B7569] hover:text-[#1B2A5B] transition-colors">
                    Account
                  </Link>
                  <Link href="/dashboard" className="btn-primary text-sm py-2.5 px-6">
                    Studio
                  </Link>
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
        {/* ── Hero Banner with crossfading backdrop ──────── */}
        <HeroBackdrop />

        {/* ── Marquee ────────────────────────────────────── */}
        <section className="border-b border-[rgba(27,42,91,0.08)] py-5 bg-white">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12 flex items-center justify-between gap-8 overflow-hidden">
            {['Bespoke Fit', 'Ethical Production', 'Inclusive Design', 'Sustainable Materials'].map((item, i) => (
              <span key={i} className="text-sm font-semibold tracking-[0.14em] uppercase text-[#8B7569] whitespace-nowrap">
                {item}
              </span>
            ))}
          </div>
        </section>

        {/* ── Collections Grid ───────────────────────────── */}
        <section className="py-16 md:py-24">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12">
            <div className="grid gap-8 md:grid-cols-2">
              {(adminCollections.length > 0 ? adminCollections : collections).map((collection, index) => (
                <Link
                  key={collection.slug}
                  href={`/collections/${collection.slug}`}
                  className="group relative block rounded-[8px] overflow-hidden animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={resolveStorefrontImage(collection.image, { category: collection.slug, slug: collection.slug })}
                      alt={collection.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0F1A3A]/80 via-[#0F1A3A]/20 to-transparent" />

                    {/* Content overlay */}
                    <div className="absolute inset-0 flex flex-col justify-end p-8">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-semibold tracking-[0.14em] uppercase text-[#E8364F]">
                          {collection.count} {collection.count === 1 ? 'piece' : 'pieces'}
                        </span>
                      </div>
                      <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl font-normal text-white mb-3 tracking-[0.02em]">
                        {collection.name}
                      </h2>
                      <p className="text-sm text-white/70 leading-relaxed max-w-[400px] mb-5">
                        {collection.description}
                      </p>
                      <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-[0.08em] uppercase text-white group-hover:text-[#E8364F] transition-colors">
                        Shop Now
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-300 group-hover:translate-x-1">
                          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Curated Picks (from admin featured) ─────── */}
        {curatedItems.length > 0 && (
          <section className="bg-white py-16 md:py-24 border-b border-[rgba(27,42,91,0.08)]">
            <div className="max-w-[1450px] mx-auto px-6 lg:px-12">
              <div className="text-center mb-12">
                <p className="text-sm font-semibold tracking-[0.2em] uppercase text-[#E8364F] mb-4">Featured Edit</p>
                <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl font-normal text-[#1B2A5B] tracking-[0.02em] mb-4">
                  Curated Pieces
                </h2>
                <p className="text-base text-[#8B7569] max-w-[520px] mx-auto leading-relaxed">
                  Explore couture highlights alongside ready-to-ship Ghanaian jewelry and accessories from the current edit.
                </p>
              </div>
              <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {curatedItems.map((item, index) => (
                  <div
                    key={index}
                    className="group animate-fade-in"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className="product-image-wrap rounded-[6px] mb-4 overflow-hidden relative bg-[#F5F0E8]">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full aspect-[3/4] flex items-center justify-center">
                          <span className="text-5xl opacity-20">📿</span>
                        </div>
                      )}
                      {item.badge && (
                        <div className="absolute top-3 left-3 z-10">
                          <span className={`text-[10px] font-bold tracking-[0.1em] uppercase px-3 py-1.5 rounded-[4px] ${
                            item.badge === 'New' ? 'bg-[#C41E3A] text-white' : 'bg-[#1B2A5B] text-white'
                          }`}>
                            {item.badge}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold tracking-[0.1em] uppercase text-[#8B7569] mb-1.5">
                        {item.category}
                      </p>
                      <h3
                        style={{ fontFamily: 'var(--font-heading)' }}
                        className="text-base font-medium text-[#1B2A5B] group-hover:text-[#C41E3A] transition-colors leading-snug mb-2"
                      >
                        {item.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-[#1B2A5B]">
                          {isReadyToShipCollectionItem(item) ? '' : 'from '}${item.price.toFixed(2)}
                        </span>
                        {item.compareAt && item.compareAt > item.price && (
                          <span className="text-sm text-[#8B7569] line-through">
                            ${item.compareAt.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {isReadyToShipCollectionItem(item) ? (
                        <Link
                          href="/collections/jewelry"
                          className="inline-block mt-3 text-xs font-semibold tracking-[0.12em] uppercase text-[#C41E3A] hover:underline"
                        >
                          Shop Ready to Ship →
                        </Link>
                      ) : (
                        <a
                          href="/consults"
                          className="inline-block mt-3 text-xs font-semibold tracking-[0.12em] uppercase text-[#C41E3A] hover:underline"
                        >
                          Request Custom Fit →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── CTA ────────────────────────────────────────── */}
        <section className="bg-white py-16 md:py-24">
          <div className="max-w-[680px] mx-auto px-6 lg:px-12 text-center">
            <p className="label-accent mb-4 text-base">Can&apos;t find what you&apos;re looking for?</p>
            <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-2xl md:text-3xl heading-lg mb-5">
              Let us design something just for you
            </h2>
            <p className="body-text mb-9">
              Book a private consultation with our design team and we&apos;ll bring your vision to life with bespoke craftsmanship.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/consults" className="btn-primary px-8 py-3.5">Book a Consult</Link>
              <Link href="/measurements" className="btn-outline px-8 py-3.5">My Measurements</Link>
            </div>
          </div>
        </section>
      </main>

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
