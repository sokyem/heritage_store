'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CartIcon } from '@/components/CartDrawer';
import { WishlistButton } from '@/components/WishlistContext';
import { SearchBar } from '@/components/SearchBar';
import { InlineStars } from '@/components/ProductRating';
import { trackSearch } from '@/lib/analytics';

interface Result {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAt?: number;
  image: string;
  category: string;
  isNewArrival?: boolean;
  collectionName?: string;
  avgRating?: number;
  reviewCount?: number;
}

const CATEGORIES = ['All', 'Ready-to-Wear', 'Sportswear', 'Accessories', 'Jewelry', 'Fabric'];

function SearchContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get('q') || '';
  const category = sp.get('category') || '';
  const page = parseInt(sp.get('page') || '1', 10);

  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const perPage = 24;
  const totalPages = Math.ceil(total / perPage);

  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category && category !== 'All') params.set('category', category);
      params.set('page', String(page));
      const res = await fetch(`/api/products/search?${params.toString()}`);
      const data = await res.json();
      const products: Result[] = data.products || [];
      setResults(products);
      setTotal(data.total || 0);
      if (q) {
        trackSearch(q, products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          category: p.category,
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [q, category, page]);

  useEffect(() => { doSearch(); }, [doSearch]);

  function setFilter(key: string, value: string) {
    const p = new URLSearchParams(sp.toString());
    p.set(key, value);
    p.set('page', '1');
    router.push(`/search?${p.toString()}`);
  }

  return (
    <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search input */}
      <div className="max-w-2xl mb-8">
        <SearchBar className="w-full" />
        {q && <p className="mt-3 text-sm text-[#8B7569]">{loading ? 'Searching…' : `${total} result${total !== 1 ? 's' : ''} for "${q}"`}</p>}
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map((cat) => {
          const active = (category || 'All') === cat;
          return (
            <button
              key={cat}
              onClick={() => setFilter('category', cat === 'All' ? '' : cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${active ? 'bg-[#1B2A5B] text-white border-[#1B2A5B]' : 'bg-white text-[#374151] border-[#D1D5DB] hover:border-[#1B2A5B]'}`}
            >{cat}</button>
          );
        })}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-[#F3F4F6] animate-pulse aspect-[3/4]" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-lg text-[#8B7569] mb-4">No products found{q ? ` for "${q}"` : ''}.</p>
          <Link href="/collections" className="px-5 py-2.5 rounded-lg bg-[#1B2A5B] text-white font-semibold text-sm hover:bg-[#2D4A8C] transition-colors">Browse Collections</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {results.map((item) => {
              const savePct = item.compareAt
                ? Math.round(((item.compareAt - item.price) / item.compareAt) * 100)
                : 0;
              return (
                <div key={item.id} className="group relative bg-white rounded-xl border border-[#F0EBE3] overflow-hidden hover:shadow-md transition-shadow">
                  <Link href={`/products/${item.slug}`} className="block aspect-square bg-[#F3F4F6] overflow-hidden">
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    {item.isNewArrival && (
                      <span className="absolute top-2 left-2 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#1B2A5B] text-white">New</span>
                    )}
                  </Link>
                  <div className="absolute top-2 right-2">
                    <WishlistButton
                      item={{ id: item.id, slug: item.slug, name: item.name, price: item.price, compareAt: item.compareAt, image: item.image, category: item.category }}
                      className="w-8 h-8 bg-white/90 shadow opacity-0 group-hover:opacity-100 transition-all"
                      size={16}
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-[#8B7569] mb-1">{item.collectionName || item.category}</p>
                    <Link href={`/products/${item.slug}`} className="text-sm font-medium text-[#1B2A5B] line-clamp-2 hover:underline">{item.name}</Link>
                    {(item.reviewCount ?? 0) > 0 && (
                      <div className="mt-1">
                        <InlineStars avg={item.avgRating ?? 0} count={item.reviewCount ?? 0} />
                      </div>
                    )}
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-sm font-semibold text-[#1B2A5B]">${item.price.toFixed(2)}</span>
                      {item.compareAt && (
                        <>
                          <span className="text-xs text-[#9CA3AF] line-through">${item.compareAt.toFixed(2)}</span>
                          <span className="text-xs font-bold text-[#EF4444]">-{savePct}%</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-12">
              <button
                onClick={() => setFilter('page', String(page - 1))}
                disabled={page <= 1}
                className="px-4 py-2 rounded-md border border-[#D1D5DB] text-sm font-medium text-[#374151] disabled:opacity-40 hover:border-[#1B2A5B] transition-colors"
              >← Prev</button>
              <span className="text-sm text-[#6B7280]">Page {page} of {totalPages}</span>
              <button
                onClick={() => setFilter('page', String(page + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 rounded-md border border-[#D1D5DB] text-sm font-medium text-[#374151] disabled:opacity-40 hover:border-[#1B2A5B] transition-colors"
              >Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[#F0EBE3] bg-white sticky top-0 z-30">
        <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <Link href="/" style={{ fontFamily: 'var(--font-playfair)' }} className="text-2xl text-[#1B2A5B] shrink-0">AWULA K</Link>
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <CartIcon className="text-[#1B2A5B] shrink-0" />
          </div>
        </div>
      </header>
      <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh] text-[#8B7569]">Loading…</div>}>
        <SearchContent />
      </Suspense>
    </div>
  );
}
