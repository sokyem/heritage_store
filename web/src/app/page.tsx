'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { signIn, signOut } from 'next-auth/react';
import { BespokeDesignIcon, PrecisionFitIcon, VirtualStudioIcon } from '@/components/LuxuryIcons';
import { resolveStorefrontImage } from '@/lib/storefront-media';
import { DEFAULT_ABOUT_DESIGNER, type AboutDesignerContent } from '@/lib/site-content-defaults';
import { DEFAULT_MATCHDAY_FEATURE, type MatchdayFeatureContent } from '@/lib/site-content-defaults';
import { CartIcon } from '@/components/CartDrawer';
import { SearchBar } from '@/components/SearchBar';
import { WishlistButton } from '@/components/WishlistContext';
import NewsletterSignup from '@/components/NewsletterSignup';
import RotatingImage from '@/components/RotatingImage';

interface HomeBanner {
  id: string;
  title: string;
  subtitle: string | null;
  linkUrl: string | null;
  position: string;
  imageList: string[];
}
import { InlineStars } from '@/components/ProductRating';

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  image?: string;
  compareAt?: number;
  category?: string;
  badge?: string;
  slug?: string;
  avgRating?: number;
  reviewCount?: number;
}

const fallbackImages = [
  '/media/IMG_3628.jpg',
  '/media/IMG_8376.jpg',
  '/media/IMG_4753.jpg',
];

/* ── Brand images for the rotating hero gallery ────── */
const heroImages = [
  { src: '/media/IMG_8376.jpg', alt: 'Crimson embroidered flowing ensemble' },
  { src: '/media/orange-mermaid-full.jpg', alt: 'Orange blossom corset gown' },
  { src: '/media/IMG_3628.jpg', alt: 'Art-deco mermaid gown' },
  { src: '/media/IMG_8381.jpg', alt: 'Crimson beaded headpiece portrait' },
  { src: '/media/silver-sequin-flow.jpg', alt: 'Silver sequin cascade dress' },
  { src: '/media/IMG_4753.jpg', alt: 'Gold beaded column gown' },
  { src: '/media/bridal-veil-portrait.jpg', alt: 'Bridal pearl-beaded gown' },
  { src: '/media/orange-corset-closeup.jpg', alt: 'Orange corset close-up' },
  { src: '/media/IMG_7537.jpg', alt: 'Chartreuse beaded bodice portrait' },
];

interface CollectionProduct {
  src: string;
  name: string;
  price: number;
  compareAt?: number;
  badge?: string;
  category?: string;
  slug: string;
  avgRating?: number;
  reviewCount?: number;
}

const serviceCards = [
  {
    icon: BespokeDesignIcon,
    title: 'Bespoke Design',
    desc: 'Custom silhouettes, fine fabrics, and couture-level craftsmanship for your most important occasions.',
    accent: 'from-[#F0E4D7] via-[#F8F4EE] to-[#EFE8DE]',
  },
  {
    icon: VirtualStudioIcon,
    title: 'Virtual Studio',
    desc: 'Book video sessions with our stylists and get elevated creative direction instantly.',
    accent: 'from-[#E2E7F4] via-[#F5F7FB] to-[#E8EDF7]',
  },
  {
    icon: PrecisionFitIcon,
    title: 'Precision Fit',
    desc: 'Professional measurements and fit engineering for garments that move flawlessly with your body.',
    accent: 'from-[#F4E5E8] via-[#FCF7F8] to-[#F7E9EC]',
  },
];

interface FeaturedProduct {
  id: string;
  section: string;
  position: number;
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

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const [products, setProducts] = useState<CollectionProduct[]>([]);
  const [currentImage, setCurrentImage] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(true);
  const [featuredItems, setFeaturedItems] = useState<CollectionProduct[]>([]);
  const [heroVideoUrl, setHeroVideoUrl] = useState('/media/hero-video.mp4');
  const [jerseys, setJerseys] = useState<Array<{ id: string; name: string; price: number; image: string; subcategory?: string }>>([]);
  const [matchdayFeature, setMatchdayFeature] = useState<MatchdayFeatureContent>(DEFAULT_MATCHDAY_FEATURE);
  const [banners, setBanners] = useState<HomeBanner[]>([]);

  // Client-side fallback: if on matchday subdomain, redirect to /matchday (in case middleware didn't catch it)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname.startsWith('matchday.')) {
        router.push('/matchday');
      }
    }
  }, [router]);

  useEffect(() => {
    // Fetch hero video from site content
    fetch('/api/site-content/hero_content')
      .then(res => res.json())
      .then(data => {
        if (data?.videoUrl) {
          setHeroVideoUrl(data.videoUrl);
        }
      })
      .catch(() => {
        // Use default
      });

    // Fetch Matchday feature card content from site content
    fetch('/api/site-content/matchday_feature')
      .then((res) => res.json())
      .then((data) => {
        const value = data?.value ?? data;
        if (value && typeof value === 'object') {
          setMatchdayFeature({ ...DEFAULT_MATCHDAY_FEATURE, ...(value as Partial<MatchdayFeatureContent>) });
        }
      })
      .catch(() => {});

    // Load Ghana jerseys from the admin DB.
    // Prefer the "ghana-black-stars" collection, fall back to category=sportswear.
    (async () => {
      const endpoints = [
        '/api/products?collection=ghana-black-stars&limit=6',
        '/api/products?category=sportswear&limit=6',
      ];
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, { cache: 'no-store' });
          if (!res.ok) continue;
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setJerseys(data);
            return;
          }
        } catch {}
      }
    })();

    fetch('/api/products?adminOnly=true&limit=6')
      .then(res => res.json())
      .then(data => setProducts((data as Product[]).map((product, index: number) => ({
        src: resolveStorefrontImage(product.image, {
          category: product.category,
          slug: product.slug || product.id,
          fallback: fallbackImages[index % fallbackImages.length],
        }),
        name: product.name,
        price: product.price,
        compareAt: product.compareAt,
        badge: product.badge,
        category: product.category,
        slug: product.slug || product.id,
        avgRating: product.avgRating,
        reviewCount: product.reviewCount,
      }))))
      .catch(() => {});

    // Fetch admin-curated featured products
    fetch('/api/featured')
      .then(res => res.json())
      .then(data => {
        const items = (data.placements || []) as FeaturedProduct[];
        if (items.length > 0) {
          setFeaturedItems(items.map((fp: FeaturedProduct) => {
            let imgUrl = '';
            try { const imgs = JSON.parse(fp.product.images || '[]'); imgUrl = imgs[0] || ''; } catch { /* */ }
            return {
              src: resolveStorefrontImage(imgUrl, {
                category: fp.product.category,
                slug: fp.product.slug || fp.product.id,
              }),
              name: fp.title || fp.product.name,
              price: fp.product.price,
              compareAt: fp.product.compareAtPrice || undefined,
              badge: fp.product.isNewArrival ? 'New' : fp.product.isFeatured ? 'Signature' : undefined,
              category: fp.product.category,
              slug: fp.product.slug || fp.product.id,
            };
          }));
        }
      })
      .catch(() => {});

    // Admin-managed "Shop by Collection" banners (replaces hardcoded cards when present).
    fetch('/api/banners', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const list = (data.banners || []) as HomeBanner[];
        setBanners(list.filter((b) => b.imageList && b.imageList.length > 0));
      })
      .catch(() => {});
  }, []);

  /* Editable About the Designer content */
  const [aboutDesigner, setAboutDesigner] = useState<AboutDesignerContent>(DEFAULT_ABOUT_DESIGNER);
  useEffect(() => {
    fetch('/api/site-content/about_designer')
      .then((r) => r.json())
      .then((data) => {
        if (data?.value) {
          setAboutDesigner({ ...DEFAULT_ABOUT_DESIGNER, ...(data.value as Partial<AboutDesignerContent>) });
        }
      })
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  /* Rotate hero images every 5 seconds */
  const nextImage = useCallback(() => {
    setImageLoaded(false);
    setTimeout(() => {
      setCurrentImage((prev) => (prev + 1) % heroImages.length);
      setImageLoaded(true);
    }, 600);
  }, []);

  useEffect(() => {
    const interval = setInterval(nextImage, 5000);
    return () => clearInterval(interval);
  }, [nextImage]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="label-sm text-base">AWULA K</p>
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
              <Link href="/collections" className="text-[0.95rem] font-medium tracking-[0.06em] uppercase text-[#8B7569] hover:text-[#1B2A5B] transition-colors">Collections</Link>
              <Link href="/matchday" className="text-[0.95rem] font-medium tracking-[0.06em] uppercase text-[#CE1126] hover:text-[#000000] transition-colors font-semibold">Ghana Jerseys</Link>
              {['Services', 'About'].map(item => (
                <a key={item} href={`#${item.toLowerCase()}`} className="text-[0.95rem] font-medium tracking-[0.06em] uppercase text-[#8B7569] hover:text-[#1B2A5B] transition-colors">
                  {item}
                </a>
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
                  <Link href="/search" aria-label="Search" className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-[#F0EBE3] transition-colors">
                    <svg className="w-5 h-5 text-[#1B2A5B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  </Link>
                  <CartIcon className="text-[#1B2A5B]" />
                  <Link href="/wishlist" aria-label="Wishlist" className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-[#F0EBE3] transition-colors">
                    <svg className="w-5 h-5 text-[#1B2A5B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
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
                  <Link href="/search" aria-label="Search" className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-[#F0EBE3] transition-colors">
                    <svg className="w-5 h-5 text-[#1B2A5B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  </Link>
                  <CartIcon className="text-[#1B2A5B]" />
                  <Link href="/wishlist" aria-label="Wishlist" className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-[#F0EBE3] transition-colors">
                    <svg className="w-5 h-5 text-[#1B2A5B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                  </Link>
                  <button onClick={() => signIn(undefined, { callbackUrl: '/' })} className="btn-primary text-sm py-2.5 px-6">
                    Sign In
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* ── Video Hero ─────────────────────────────────── */}
        <section className="relative overflow-hidden bg-black" style={{ minHeight: '92vh' }}>
          {/* Background video — hero-video.mp4, managed via Admin → Site Content → Hero */}
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover opacity-60"
            style={{ filter: 'brightness(0.5)' }}
          >
            <source src={heroVideoUrl} type="video/mp4" />
          </video>

          {/* Gradient overlay */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(135deg, rgba(15,26,58,0.75) 0%, rgba(15,26,58,0.3) 50%, rgba(0,0,0,0.4) 100%)',
          }} />

          {/* Content */}
          <div className="relative z-10 max-w-[1450px] mx-auto px-6 lg:px-12 flex items-center" style={{ minHeight: '92vh' }}>
            <div className="grid md:grid-cols-2 gap-12 items-center w-full">
              {/* Left — text */}
              <div className="animate-fade-in py-16">
                <p className="text-base font-semibold tracking-[0.2em] uppercase text-[#E8364F] mb-6">New Collection</p>
                <h1 style={{ fontFamily: 'var(--font-heading)' }} className="text-5xl md:text-[4.2rem] font-normal leading-[1.08] tracking-[0.01em] text-white mb-8">
                  More than just<br />a pretty face.
                </h1>
                <p className="text-xl text-white/70 leading-relaxed max-w-[480px] mb-12">
                  Couture service for the modern luxury client. Where every fit, consultation, and silhouette tells your story.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link href="/collections" className="bg-white text-[#1B2A5B] px-10 py-4 rounded-[6px] text-base font-semibold tracking-[0.06em] uppercase hover:bg-[#F0EBE3] transition-colors">
                    Shop Collection
                  </Link>
                  <Link href="/consults" className="border-2 border-white/40 text-white px-10 py-4 rounded-[6px] text-base font-semibold tracking-[0.06em] uppercase hover:bg-white/10 transition-colors">
                    Book a Consult
                  </Link>
                </div>
              </div>

              {/* Right — rotating image */}
              <div className="hidden md:flex justify-end">
                <div className="relative" style={{ width: '440px', height: '580px' }}>
                  <div
                    className="rounded-2xl overflow-hidden shadow-2xl"
                    style={{
                      width: '100%',
                      height: '100%',
                      transition: 'opacity 0.6s ease-in-out',
                      opacity: imageLoaded ? 1 : 0,
                    }}
                  >
                    <img
                      src={heroImages[currentImage].src}
                      alt={heroImages[currentImage].alt}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* Image counter dots */}
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
                    {heroImages.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => { setImageLoaded(false); setTimeout(() => { setCurrentImage(i); setImageLoaded(true); }, 300); }}
                        className="transition-all duration-300"
                        style={{
                          width: currentImage === i ? '24px' : '8px',
                          height: '8px',
                          borderRadius: '4px',
                          background: currentImage === i ? '#C41E3A' : 'rgba(255,255,255,0.4)',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
            <div style={{ width: '2px', height: '40px', background: 'rgba(255,255,255,0.3)', borderRadius: '1px' }} />
          </div>
        </section>

        {/* ── NEW COLLECTION: Ghana Jerseys ────────────────────── */}
        {/* Brand feature card — editable from /admin/site-content. */}
        {matchdayFeature.enabled && (
        <section className="relative overflow-hidden py-0 bg-gradient-to-br from-[#F8FAFB] via-[#FFFFFF] to-[#F3F7FB]">
          <div className="absolute inset-0">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#CE1126]/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-72 h-72 bg-[#FCD116]/5 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-[1450px] mx-auto px-6 lg:px-12 py-10 md:py-12">
            <div className="grid lg:grid-cols-3 gap-4 items-start">
              {/* Left — Text & CTA */}
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#CE1126]/10 border border-[#CE1126]/30">
                  <span className="text-xs font-bold tracking-wider uppercase text-[#CE1126]">{matchdayFeature.badgeAccent}</span>
                  <span className="text-xs tracking-wide text-[#1B2A5B]">{matchdayFeature.badge}</span>
                </div>
                
                <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl font-normal text-[#1B2A5B] leading-tight">
                  {matchdayFeature.title}
                </h2>
                
                <p className="text-sm text-[#4B5563] leading-relaxed">
                  {matchdayFeature.body}
                </p>

                {/* Live count + price range — pulled from the actual collection */}
                {jerseys.length > 0 && (() => {
                  const prices = jerseys.map((j) => j.price).filter((p) => typeof p === 'number' && p > 0);
                  const min = Math.min(...prices);
                  const max = Math.max(...prices);
                  return (
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#E5E7EB] shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-[#2D8E5A] animate-pulse" />
                        <span className="font-bold text-[#1B2A5B]">{jerseys.length}</span>
                        <span className="text-[#6B7280]">{jerseys.length === 1 ? 'jersey' : 'jerseys'} in stock</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[#6B7280]">
                        <span>from</span>
                        <span className="font-bold text-[#CE1126]">${min.toFixed(2)}</span>
                        {max > min && <span>up to <span className="font-bold text-[#1B2A5B]">${max.toFixed(2)}</span></span>}
                      </span>
                    </div>
                  );
                })()}

                {/* CTA */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link href={matchdayFeature.ctaPrimaryHref || '/matchday'} className="inline-flex items-center gap-1.5 bg-[#CE1126] hover:bg-[#A3162E] text-white px-5 py-2.5 rounded-lg text-xs font-semibold tracking-[0.06em] uppercase transition-all hover:shadow-lg hover:shadow-[#CE1126]/30">
                    {matchdayFeature.ctaPrimaryLabel || 'Shop Now'}
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </Link>
                  {matchdayFeature.ctaSecondaryHref && (
                    <a href={matchdayFeature.ctaSecondaryHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 border-2 border-[#CE1126] hover:bg-[#CE1126]/5 text-[#CE1126] px-5 py-2.5 rounded-lg text-xs font-semibold tracking-[0.06em] uppercase transition-all">
                      {matchdayFeature.ctaSecondaryLabel || 'TikTok'}
                    </a>
                  )}
                </div>
              </div>

              {/* Right — Jersey Showcase */}
              <div className="lg:col-span-2 relative">
                {(() => {
                  // Jerseys come from the admin Product table. When the
                  // studio hasn't added any yet, show neutral placeholder
                  // cards (no fake prices) so the layout doesn't collapse
                  // but we never invent a price the customer might trust.
                  if (jerseys.length === 0) {
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 bg-white rounded-xl p-4 border border-dashed border-[#E5E7EB] flex flex-col items-center justify-center text-center min-h-[260px]">
                          <div className="text-3xl mb-2 opacity-30">👕</div>
                          <h3 className="text-[#1B2A5B] font-semibold text-sm mb-1">Ghana Jerseys</h3>
                          <p className="text-[#6B7280] text-xs">Matchday gear coming soon</p>
                        </div>
                        <div className="space-y-2">
                          {[0, 1].map((i) => (
                            <div key={i} className="bg-white rounded-lg p-3 border border-dashed border-[#E5E7EB] flex flex-col items-center justify-center text-center min-h-[125px]">
                              <div className="text-xl mb-1 opacity-30">👕</div>
                              <p className="text-[#6B7280] text-xs">Coming soon</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  const list = jerseys.slice(0, 3);
                  const main = list[0];
                  const others = list.slice(1, 3);
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {/* Main featured jersey — opens Matchday to pick size/color & add to cart */}
                      <Link href="/matchday" className="col-span-2 block bg-white rounded-xl p-4 border border-[#E5E7EB] hover:border-[#CE1126]/50 shadow-sm hover:shadow-md transition-all cursor-pointer">
                        <div className="aspect-[3/4] bg-gradient-to-br from-[#F3F4F6] to-[#E5E7EB] rounded-lg overflow-hidden mb-2.5 flex items-center justify-center">
                          <img src={main.image || '/Ghana_jersey_old.webp'} alt={main.name} className="w-full h-full object-cover" />
                        </div>
                        <h3 className="text-[#1B2A5B] font-semibold text-sm mb-0.5">{main.name}</h3>
                        <p className="text-[#6B7280] text-xs mb-1">{main.subcategory || 'World Cup Edition'}</p>
                        <p className="text-[#CE1126] font-bold text-lg">${main.price.toFixed(2)}</p>
                      </Link>

                      {/* Away & Training */}
                      <div className="space-y-2">
                        {others.map((jersey) => (
                          <Link key={jersey.id} href="/matchday" className="block bg-white rounded-lg p-3 border border-[#E5E7EB] hover:border-[#CE1126]/50 shadow-sm hover:shadow-md transition-all cursor-pointer">
                            <div className="aspect-square bg-gradient-to-br from-[#F3F4F6] to-[#E5E7EB] rounded-lg overflow-hidden mb-2 flex items-center justify-center">
                              <img src={jersey.image || '/Ghana_jersey_old.webp'} alt={jersey.name} className="w-full h-full object-cover" />
                            </div>
                            <h3 className="text-[#1B2A5B] font-semibold text-xs mb-0.5">{jersey.name}</h3>
                            <p className="text-[#6B7280] text-xs mb-1">{jersey.subcategory || 'Black Stars'}</p>
                            <p className="text-[#CE1126] font-bold text-sm">${jersey.price.toFixed(2)}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </section>
        )}

        {/* ── Matchday Video Promo ────────────────────────── */}
        <section className="relative bg-[#0F1A3A] overflow-hidden">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12 py-14 md:py-20">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              {/* Video — clicking takes you to /matchday */}
              <Link
                href="/matchday"
                className="relative block rounded-2xl overflow-hidden shadow-2xl group cursor-pointer"
                aria-label="Shop Ghana jerseys on Matchday"
              >
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster="/media/matchday-promo-poster.jpg"
                  preload="metadata"
                  className="w-full h-full object-cover max-h-[520px] transition-transform duration-700 group-hover:scale-105"
                >
                  {/* Always serve the mobile-optimised 720p file — the <source media>
                      attribute is not reliable for <video>, so we use the smaller
                      file everywhere. Still looks great on desktop at this size. */}
                  <source src="/media/matchday-promo-mobile.mp4" type="video/mp4" />
                </video>
                {/* Play icon overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/40 group-hover:scale-110 transition-transform">
                    <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
                {/* Shop Now chip */}
                <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                  <span className="bg-[#CE1126] text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-full shadow-lg">
                    Shop Matchday →
                  </span>
                </div>
              </Link>

              {/* Copy */}
              <div className="text-white space-y-5">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#FCD116]">⭐ Ghana Black Stars</p>
                <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-4xl md:text-5xl font-normal leading-tight">
                  Wear the Pride.<br />Rep the Stars.
                </h2>
                <p className="text-lg text-white/70 leading-relaxed max-w-[420px]">
                  Official Ghana Black Stars jerseys — every style, every kit. Ships within 5–7 business days.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Link
                    href="/matchday"
                    className="inline-flex items-center gap-2 bg-[#CE1126] hover:bg-[#A3162E] text-white px-8 py-3.5 rounded-lg text-sm font-semibold tracking-wider uppercase transition-all hover:shadow-lg hover:shadow-[#CE1126]/40"
                  >
                    Shop Jerseys
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </Link>
                  <Link
                    href="/matchday"
                    className="inline-flex items-center gap-2 border-2 border-white/30 hover:border-white/60 text-white px-8 py-3.5 rounded-lg text-sm font-semibold tracking-wider uppercase transition-all"
                  >
                    View All Kits
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Marquee / Brand Line ───────────────────────── */}
        <section className="border-y border-[rgba(27,42,91,0.08)] py-6 bg-white">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12 flex items-center justify-between gap-8 overflow-hidden">
            {['Bespoke Fit', 'Ethical Production', 'Inclusive Design', 'Sustainable Materials'].map((item, i) => (
              <span key={i} className="text-sm font-semibold tracking-[0.14em] uppercase text-[#8B7569] whitespace-nowrap">
                {item}
              </span>
            ))}
          </div>
        </section>

        {/* ── Shop By Collection (featured banners) ──────── */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12">
            <div className="text-center mb-14">
              <p className="label-accent mb-3 text-base">Explore Our World</p>
              <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl heading-lg">Shop by Collection</h2>
            </div>

            {banners.length > 0 ? (
              /* Admin-managed banners (Marketing → Storefront Control → Banners) */
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {banners.map((b) => (
                  <Link
                    key={b.id}
                    href={b.linkUrl || '/collections'}
                    className="group block rounded-[8px] overflow-hidden"
                  >
                    <div className="relative overflow-hidden" style={{ height: '360px' }}>
                      <RotatingImage images={b.imageList} alt={b.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    </div>
                    <div className="pt-4 pb-2 px-1">
                      <h3 style={{ fontFamily: 'var(--font-heading)' }} className="text-2xl font-normal text-[#1B2A5B] mb-1 group-hover:text-[#C41E3A] transition-colors">{b.title}</h3>
                      {b.subtitle && <p className="text-sm text-[#8B7569] mb-3">{b.subtitle}</p>}
                      <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-[0.08em] uppercase text-[#1B2A5B] group-hover:text-[#E8364F] transition-colors">
                        Shop Now
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-300 group-hover:translate-x-1"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
            <>
            {/* Top row: 2 large banners */}
            <div className="grid md:grid-cols-2 gap-5 mb-5">
              {[
                { name: 'Women', slug: 'women', count: 14, img: '/media/storefront/shopify/bubu-1.jpg', desc: 'Dresses, kimonos, shirts & skirts' },
                { name: 'Men', slug: 'men', count: 8, img: '/media/storefront/shopify/odoi-men-shirt-1.jpg', desc: 'African print shirts & embroidered pieces' },
              ].map((col) => (
                <Link
                  key={col.slug}
                  href={`/collections/${col.slug}`}
                  className="group block rounded-[8px] overflow-hidden"
                >
                  <div className="relative overflow-hidden" style={{ height: '420px' }}>
                    <img src={resolveStorefrontImage(col.img, { category: col.slug, slug: col.slug })} alt={col.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  </div>
                  <div className="pt-4 pb-2 px-1">
                    <span className="text-xs font-semibold tracking-[0.14em] uppercase text-[#E8364F] mb-1 block">{col.count} pieces</span>
                    <h3 style={{ fontFamily: 'var(--font-heading)' }} className="text-2xl font-normal text-[#1B2A5B] mb-1 group-hover:text-[#C41E3A] transition-colors">{col.name}</h3>
                    <p className="text-sm text-[#8B7569] mb-3">{col.desc}</p>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-[0.08em] uppercase text-[#1B2A5B] group-hover:text-[#E8364F] transition-colors">
                      Shop Now
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-300 group-hover:translate-x-1"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Bottom row: 3 smaller banners */}
            <div className="grid sm:grid-cols-3 gap-5">
              {[
                { name: 'Couture', slug: 'couture', img: '/media/IMG_8376.jpg', desc: 'Bespoke luxury gowns' },
                { name: 'Prom', slug: 'prom', img: '/media/storefront/shopify/ariel-corset-gown-1.jpg', desc: 'Custom prom dresses' },
                { name: 'Ghana Jerseys', slug: 'matchday', img: '/Ghana_jersey_old.webp', desc: 'World Cup Collection', href: '/matchday' },
              ].map((col) => (
                <Link
                  key={col.slug}
                  href={(col as any).href || (col.slug === 'couture' ? '/collections' : `/collections/${col.slug}`)}
                  className="group block rounded-[8px] overflow-hidden"
                >
                  <div className="relative overflow-hidden" style={{ height: '300px' }}>
                    <img src={resolveStorefrontImage(col.img, { category: col.slug, slug: col.slug })} alt={col.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  </div>
                  <div className="pt-3 pb-2 px-1">
                    <h3 style={{ fontFamily: 'var(--font-heading)' }} className="text-xl font-normal text-[#1B2A5B] mb-1 group-hover:text-[#C41E3A] transition-colors">{col.name}</h3>
                    <p className="text-xs text-[#8B7569] mb-2">{col.desc}</p>
                    <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.08em] uppercase text-[#1B2A5B] group-hover:text-[#E8364F] transition-colors">
                      Explore
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="transition-transform duration-300 group-hover:translate-x-1"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            </>
            )}
          </div>
        </section>

        {/* ── Collection Grid (signature + admin featured) ── */}
        <section id="collection" className="py-20 md:py-28">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-14">
              <div>
                <p className="label-accent mb-3 text-base">Custom Fits &amp; Showcase</p>
                <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl heading-lg">The Collection</h2>
                <p className="body-text mt-3 max-w-[520px]">Each piece is a showcase of what our atelier can create — and every design can be requested as a custom fit, tailored to your exact measurements.</p>
              </div>
              <Link href="/collections" className="btn-outline text-sm py-3 px-7">View All Collections</Link>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(featuredItems.length > 0 ? featuredItems : products).map((item, index) => {
                const cat = (item.category || '').toLowerCase();
                const isJersey = cat.includes('ghana') || cat.includes('matchday') || cat.includes('sportswear') || cat.includes('jersey');
                // Buyable products link to their PDP; couture/inquiry products go to /consults
                const href = item.slug ? `/products/${item.slug}` : (isJersey ? '/matchday' : '/consults');
                const ctaLabel = isJersey ? 'Shop Now →' : 'View Details →';
                return (
                <Link
                  key={item.slug}
                  href={href}
                  className="group animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="product-image-wrap rounded-[6px] mb-5 overflow-hidden relative">
                    <img
                      src={resolveStorefrontImage(item.src, { category: item.category, slug: item.slug })}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    {item.badge && (
                      <div className="absolute top-3 left-3 z-10">
                        <span className="product-badge">{item.badge}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-[#1B2A5B]/0 group-hover:bg-[#1B2A5B]/10 transition-colors duration-300" />
                    <WishlistButton
                      item={{ id: item.slug, slug: item.slug, name: item.name, price: item.price, compareAt: item.compareAt, image: resolveStorefrontImage(item.src, { category: item.category, slug: item.slug }), category: item.category }}
                      className="absolute top-3 right-3 w-8 h-8 bg-white/90 shadow opacity-0 group-hover:opacity-100 transition-all z-10"
                      size={16}
                    />
                  </div>
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      {item.category && <p className="text-xs font-semibold tracking-[0.1em] uppercase text-[#8B7569] mb-1">{item.category}</p>}
                      <h3 style={{ fontFamily: 'var(--font-heading)' }} className="text-lg font-medium text-[#1B2A5B] group-hover:text-[#C41E3A] transition-colors">{item.name}</h3>
                      {(item.reviewCount ?? 0) > 0 && (
                        <div className="mt-1">
                          <InlineStars avg={item.avgRating ?? 0} count={item.reviewCount ?? 0} />
                        </div>
                      )}
                      <p className="text-xs text-[#8B7569] mt-1">Custom fit available</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-lg font-semibold text-[#1B2A5B]">from ${item.price.toLocaleString()}</span>
                      {item.compareAt && (
                        <p className="text-sm text-[#8B7569] line-through">${item.compareAt.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <span className="inline-block mt-3 text-xs font-semibold tracking-[0.12em] uppercase text-[#C41E3A] group-hover:underline">{ctaLabel}</span>
                </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Split Feature with brand image ─────────────── */}
        <section className="bg-white">
          <div className="grid md:grid-cols-2">
            <div className="relative min-h-[400px] md:min-h-[620px] overflow-hidden">
              <img
                src="/media/IMG_8381.jpg"
                alt="Crimson beaded headpiece set"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            <div className="flex items-center px-6 lg:px-16 py-16 md:py-20">
              <div className="max-w-[480px] animate-fade-in">
                <p className="label-accent mb-4 text-base">The Studio</p>
                <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl heading-lg mb-7">Dressing up as an act of intention.</h2>
                <p className="body-text mb-5">
                  We make clothes meant to feel like you. No concealment, no restriction — just craftsmanship and personal style.
                </p>
                <p className="body-text mb-9">
                  Every consultation and delivery is orchestrated for a seamless luxury journey.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link href="/consults" className="btn-primary px-8 py-3.5">Book Consultation</Link>
                  <Link href="/become-a-designer" className="btn-outline px-8 py-3.5">Become a Designer</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── About the Designer ─────────────────────────── */}
        <section id="about" className="bg-[#FAF7F2]">
          <div className="grid md:grid-cols-2">
            <div className="order-2 md:order-1 flex items-center px-6 lg:px-16 py-16 md:py-20">
              <div className="max-w-[520px] animate-fade-in">
                <p className="label-accent mb-4 text-base">{aboutDesigner.eyebrow}</p>
                <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl heading-lg mb-7">
                  {aboutDesigner.title}
                </h2>
                {aboutDesigner.paragraphs.map((p, i) => (
                  <p key={i} className={`body-text ${i === aboutDesigner.paragraphs.length - 1 ? 'mb-9' : 'mb-5'}`}>
                    {p}
                  </p>
                ))}
                <div className="flex flex-wrap gap-4">
                  {aboutDesigner.ctaPrimaryHref.startsWith('http') ? (
                    <a href={aboutDesigner.ctaPrimaryHref} target="_blank" rel="noopener noreferrer" className="btn-primary px-8 py-3.5">
                      {aboutDesigner.ctaPrimaryLabel}
                    </a>
                  ) : (
                    <Link href={aboutDesigner.ctaPrimaryHref} className="btn-primary px-8 py-3.5">
                      {aboutDesigner.ctaPrimaryLabel}
                    </Link>
                  )}
                  {aboutDesigner.ctaSecondaryHref.startsWith('http') ? (
                    <a href={aboutDesigner.ctaSecondaryHref} target="_blank" rel="noopener noreferrer" className="btn-outline px-8 py-3.5">
                      {aboutDesigner.ctaSecondaryLabel}
                    </a>
                  ) : (
                    <Link href={aboutDesigner.ctaSecondaryHref} className="btn-outline px-8 py-3.5">
                      {aboutDesigner.ctaSecondaryLabel}
                    </Link>
                  )}
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2 relative min-h-[400px] md:min-h-[620px] overflow-hidden">
              <img
                src={aboutDesigner.imageUrl}
                alt={aboutDesigner.imageAlt}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition: 'right center' }}
              />
            </div>
          </div>
        </section>

        {/* ── Lookbook Strip ─────────────────────────────── */}
        <section className="py-6 bg-[#0F1A3A] overflow-hidden">
          <div className="flex gap-4 animate-scroll" style={{ width: 'max-content' }}>
            {[
              ...heroImages,
              { src: '/media/storefront/shopify/adire%F0%9F%92%9A-shift-dress-1.jpg', alt: 'ADIRE Shift Dress' },
              { src: '/media/storefront/shopify/bubu-1.jpg', alt: 'BUBU Dress' },
              { src: '/media/storefront/shopify/nii-1.jpg', alt: 'NII' },
              { src: '/media/storefront/shopify/ariel-corset-gown-1.jpg', alt: 'Ariel Corset Gown' },
              { src: '/media/storefront/shopify/awula-kimono-1.jpg', alt: 'KORKOR Kimono' },
              { src: '/media/storefront/shopify/chawe-1.jpg', alt: 'CHAWE Shirt' },
              { src: '/media/silver-sequin-drape.jpg', alt: 'Silver sequin drape' },
              { src: '/media/orange-corset-pose.jpg', alt: 'Orange corset pose' },
              ...heroImages,
            ].map((img, i) => (
              <div key={i} className="flex-shrink-0 w-[220px] h-[300px] rounded-lg overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
                <img src={resolveStorefrontImage(img.src, { category: img.alt, slug: img.alt })} alt={img.alt} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <style jsx>{`
            @keyframes scrollStrip {
              from { transform: translateX(0); }
              to { transform: translateX(-50%); }
            }
            .animate-scroll {
              animation: scrollStrip 30s linear infinite;
            }
            .animate-scroll:hover {
              animation-play-state: paused;
            }
          `}</style>
        </section>

        {/* ── Services ───────────────────────────────────── */}
        <section id="services" className="py-20 md:py-28">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12">
            <div className="text-center mb-16">
              <p className="label-accent mb-4 text-base">Services</p>
              <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl heading-lg">A modern atelier experience</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {serviceCards.map((service, i) => {
                const Icon = service.icon;

                return (
                <div key={i} className="card p-10 text-center animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className={`w-16 h-16 grid place-items-center mx-auto mb-6 rounded-[1.25rem] bg-gradient-to-br ${service.accent} text-[#1B2A5B] shadow-[0_14px_30px_rgba(27,42,91,0.12)] ring-1 ring-white`}>
                    <Icon className="h-8 w-8" />
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-heading)' }} className="text-lg font-medium tracking-[0.04em] uppercase text-[#1B2A5B] mb-4">{service.title}</h3>
                  <p className="text-base text-[#5C3D2E] leading-relaxed">{service.desc}</p>
                </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── New Arrivals / Featured Picks ──────────────── */}
        <section className="py-16 md:py-20 bg-[#FAF7F2]">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
              <div>
                <p className="label-accent mb-3 text-base">Just Arrived</p>
                <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl heading-lg">New Arrivals &amp; Best Sellers</h2>
              </div>
              <Link href="/collections" className="btn-outline text-sm py-3 px-7">Shop All</Link>
            </div>

            {/* Horizontal scroll strip */}
            <div className="flex gap-5 overflow-x-auto pb-4 -mx-6 px-6 lg:-mx-12 lg:px-12 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
              {(featuredItems.length > 0 ? featuredItems : products).map((item, i) => (
                <Link
                  key={item.slug}
                  href="/collections"
                  className="group flex-shrink-0 animate-fade-in"
                  style={{ width: '280px', animationDelay: `${i * 80}ms` }}
                >
                  <div className="relative rounded-[8px] overflow-hidden mb-4" style={{ aspectRatio: '3/4' }}>
                    <img src={item.src} alt={item.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    {item.badge && (
                      <div className="absolute top-3 left-3">
                        <span className={`product-badge ${
                          item.badge === 'Sale' ? '!bg-[#C41E3A] !text-white' :
                          item.badge === 'New' ? '' : '!bg-[#5C3D2E] !text-white'
                        }`}>{item.badge}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-[#1B2A5B]/0 group-hover:bg-[#1B2A5B]/10 transition-colors duration-300" />
                  </div>
                  <p className="text-xs font-semibold tracking-[0.1em] uppercase text-[#8B7569] mb-1">{item.category}</p>
                  <h3 style={{ fontFamily: 'var(--font-heading)' }} className="text-sm font-medium text-[#1B2A5B] group-hover:text-[#C41E3A] transition-colors mb-1">{item.name}</h3>
                  {(item.reviewCount ?? 0) > 0 && (
                    <div className="mb-1">
                      <InlineStars avg={item.avgRating ?? 0} count={item.reviewCount ?? 0} />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1B2A5B]">${item.price.toFixed(2)}</span>
                    {item.compareAt && <span className="text-xs text-[#8B7569] line-through">${item.compareAt.toFixed(2)}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA with brand image background ──────── */}
        <section className="relative overflow-hidden py-24 md:py-32">
          <div className="absolute inset-0">
            <img
              src="/media/IMG_7454.jpg"
              alt="Chartreuse gown"
              className="w-full h-full object-cover"
              style={{ filter: 'brightness(0.25)' }}
            />
          </div>
          <div className="relative z-10 max-w-2xl mx-auto px-6 lg:px-12 text-center">
            <p className="text-sm font-semibold tracking-[0.14em] uppercase text-[#E8364F] mb-5">Ready to Begin?</p>
            <h2 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl font-normal tracking-[0.02em] text-white mb-5 leading-snug">
              Your couture journey starts with a single conversation.
            </h2>
            <p className="text-base text-white/60 mb-10 leading-relaxed">Book a private consultation or update your measurements to get started.</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/consults" className="bg-white text-[#1B2A5B] px-10 py-4 rounded-[6px] text-[0.95rem] font-semibold tracking-[0.06em] uppercase hover:bg-[#F0EBE3] transition-colors">
                Book a Consult
              </Link>
              <Link href="/measurements" className="border border-white/30 text-white px-10 py-4 rounded-[6px] text-[0.95rem] font-semibold tracking-[0.06em] uppercase hover:bg-white/10 transition-colors">
                Measurements
              </Link>
            </div>
          </div>
        </section>

        {/* ── Instagram Follow Banner ───────────────────── */}
        <section className="py-16 md:py-20 bg-white border-t border-[rgba(27,42,91,0.08)]">
          <div className="max-w-[1450px] mx-auto px-6 lg:px-12 text-center">
            <a
              href="https://www.instagram.com/awula_k_/"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex flex-col items-center gap-5"
            >
              {/* Instagram icon */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold tracking-[0.14em] uppercase text-[#C41E3A] mb-2">Follow Us on Instagram</p>
                <p style={{ fontFamily: 'var(--font-heading)' }} className="text-2xl md:text-3xl font-normal text-[#1B2A5B] group-hover:text-[#C41E3A] transition-colors">@awula_k_</p>
              </div>
              <p className="text-base text-[#8B7569] max-w-md">Behind-the-scenes couture, new arrivals, and styling inspiration — join our community.</p>
            </a>

            {/* Mini gallery strip */}
            <div className="flex justify-center gap-3 mt-10">
              {[
                '/media/orange-mermaid-full.jpg',
                '/media/silver-sequin-pose.jpg',
                '/media/bridal-veil-portrait.jpg',
                '/media/IMG_8376.jpg',
                '/media/orange-corset-closeup.jpg',
                '/media/silver-sequin-flow.jpg',
              ].map((src, i) => (
                <a
                  key={i}
                  href="https://www.instagram.com/awula_k_/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative group/img overflow-hidden rounded-lg"
                  style={{ width: '160px', height: '160px' }}
                >
                  <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110" />
                  <div className="absolute inset-0 bg-[#1B2A5B]/0 group-hover/img:bg-[#1B2A5B]/30 transition-colors duration-300 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-300" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                    </svg>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="bg-[#0F1A3A] text-white/50">
        <div className="max-w-[1450px] mx-auto px-6 lg:px-12 py-16">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
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
              <p className="text-sm font-semibold tracking-[0.1em] uppercase text-white/70 mb-5">Connect</p>
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
            <NewsletterSignup source="footer" />
          </div>
          <div className="border-t border-white/10 mt-12 pt-7 text-sm text-center">
            AWULA K &copy; 2026. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
