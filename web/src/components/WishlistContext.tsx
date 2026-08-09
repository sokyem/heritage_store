'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

export interface WishlistItem {
  id: string;         // productId
  slug: string;
  name: string;
  price: number;
  compareAt?: number;
  image: string;
  category?: string;
  addedAt: number;    // unix ms
}

interface WishlistCtx {
  items: WishlistItem[];
  count: number;
  has: (productId: string) => boolean;
  add: (item: Omit<WishlistItem, 'addedAt'>) => void;
  remove: (productId: string) => void;
  toggle: (item: Omit<WishlistItem, 'addedAt'>) => void;
  clear: () => void;
}

const Ctx = createContext<WishlistCtx>({
  items: [],
  count: 0,
  has: () => false,
  add: () => undefined,
  remove: () => undefined,
  toggle: () => undefined,
  clear: () => undefined,
});

const STORAGE_KEY = 'awulak_wishlist_v1';

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, [items, ready]);

  const has = useCallback((id: string) => items.some((i) => i.id === id), [items]);

  const add = useCallback((item: Omit<WishlistItem, 'addedAt'>) => {
    setItems((prev) => {
      if (prev.some((i) => i.id === item.id)) return prev;
      return [{ ...item, addedAt: Date.now() }, ...prev];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const toggle = useCallback((item: Omit<WishlistItem, 'addedAt'>) => {
    setItems((prev) => {
      if (prev.some((i) => i.id === item.id)) return prev.filter((i) => i.id !== item.id);
      return [{ ...item, addedAt: Date.now() }, ...prev];
    });
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return (
    <Ctx.Provider value={{ items, count: items.length, has, add, remove, toggle, clear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWishlist() {
  return useContext(Ctx);
}

/** Heart icon button — use anywhere on a product card */
export function WishlistButton({
  item,
  className = '',
  size = 22,
}: {
  item: Omit<WishlistItem, 'addedAt'>;
  className?: string;
  size?: number;
}) {
  const { has, toggle } = useWishlist();
  const saved = has(item.id);

  return (
    <button
      aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(item); }}
      className={`group flex items-center justify-center rounded-full transition-all ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={saved ? '#C41E3A' : 'none'}
        stroke={saved ? '#C41E3A' : 'currentColor'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-colors"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
