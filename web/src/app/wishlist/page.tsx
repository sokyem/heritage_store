'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useWishlist } from '@/components/WishlistContext';
import { useCart, buildCartLineId } from '@/components/CartContext';
import { CartIcon } from '@/components/CartDrawer';
import { InlineStars } from '@/components/ProductRating';

export default function WishlistPage() {
  const { items, remove } = useWishlist();
  const { addItem } = useCart();

  // Wishlist items live in localStorage and carry no rating data, so fetch the
  // product list once and build an id → rating map to show stars on the cards.
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({});
  useEffect(() => {
    fetch('/api/products?limit=100')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.items || [];
        const map: Record<string, { avg: number; count: number }> = {};
        for (const p of list) {
          if (p.reviewCount > 0) map[p.id] = { avg: p.avgRating || 0, count: p.reviewCount };
        }
        setRatings(map);
      })
      .catch(() => null);
  }, []);

  function moveToCart(item: typeof items[number]) {
    addItem({
      id: buildCartLineId(item.id),
      productId: item.id,
      slug: item.slug,
      name: item.name,
      price: item.price,
      image: item.image,
      qty: 1,
    });
    remove(item.id);
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[#F0EBE3] bg-white sticky top-0 z-30">
        <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link href="/" style={{ fontFamily: 'var(--font-playfair)' }} className="text-2xl text-[#1B2A5B]">AWULA K</Link>
          <div className="flex items-center gap-3">
            <Link href="/collections" className="hidden sm:block text-sm text-[#374151] hover:text-[#1B2A5B] px-3 py-2">Collections</Link>
            <CartIcon className="text-[#1B2A5B]" />
          </div>
        </div>
      </header>

      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <svg className="w-6 h-6 text-[#C41E3A]" fill="#C41E3A" viewBox="0 0 24 24" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <h1 style={{ fontFamily: 'var(--font-playfair)' }} className="text-3xl text-[#1B2A5B]">My Wishlist</h1>
          {items.length > 0 && <span className="text-sm text-[#8B7569]">({items.length} {items.length === 1 ? 'item' : 'items'})</span>}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-24 flex flex-col items-center gap-4">
            <svg className="w-16 h-16 text-[#E5E7EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <p className="text-lg text-[#8B7569]">Your wishlist is empty.</p>
            <Link href="/collections" className="px-6 py-3 rounded-lg bg-[#1B2A5B] text-white font-semibold text-sm hover:bg-[#2D4A8C] transition-colors">Browse Collections</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {items.map((item) => {
                const savePct = item.compareAt
                  ? Math.round(((item.compareAt - item.price) / item.compareAt) * 100)
                  : 0;
                return (
                  <div key={item.id} className="group relative bg-white rounded-xl border border-[#F0EBE3] overflow-hidden hover:shadow-md transition-shadow">
                    <Link href={`/products/${item.slug}`} className="block aspect-square bg-[#F3F4F6] overflow-hidden">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </Link>
                    <button
                      aria-label="Remove from wishlist"
                      onClick={() => remove(item.id)}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center hover:bg-white shadow transition-all opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-4 h-4 text-[#C41E3A]" fill="#C41E3A" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <div className="p-3">
                      {item.category && <p className="text-xs text-[#8B7569] mb-1">{item.category}</p>}
                      <Link href={`/products/${item.slug}`} className="text-sm font-medium text-[#1B2A5B] line-clamp-2 hover:underline">{item.name}</Link>
                      {ratings[item.id] && (
                        <div className="mt-1">
                          <InlineStars avg={ratings[item.id].avg} count={ratings[item.id].count} />
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
                      <button
                        onClick={() => moveToCart(item)}
                        className="mt-3 w-full py-2 rounded-md bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C] transition-colors"
                      >
                        Move to Cart
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-12 text-center">
              <Link href="/collections" className="text-sm text-[#1B2A5B] hover:underline">← Continue browsing</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
