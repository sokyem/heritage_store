'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { trackAddToCart } from '@/lib/analytics';
import { CUSTOMIZATION_FEE } from '@/lib/pricing';

const STORAGE_KEY = 'awulak_cart_v1';

export interface CartItem {
  /** Stable line id (e.g. productId-size-color). One per "row" in the cart. */
  id: string;
  productId: string;
  slug?: string;
  name: string;
  price: number;
  image?: string;
  qty: number;
  size?: string;
  color?: string;
  /** Free-text personalisation (e.g. "Name: KOFI, No: 10"). When set, `price`
   *  already includes the customization surcharge. */
  customization?: string;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, 'qty'> & { qty?: number }) => void;
  removeItem: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  /**
   * Refetch the catalog price for every item in the cart and update local
   * prices. Returns the list of items whose price changed (so the UI can
   * notify the user if they were about to check out at a stale amount).
   */
  refreshPrices: () => Promise<Array<{ id: string; name: string; oldPrice: number; newPrice: number }>>;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function loadInitial(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.id === 'string' && typeof x.qty === 'number');
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setItems(loadInitial());
    setHydrated(true);
  }, []);

  // Persist whenever items change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, hydrated]);

  const addItem = useCallback((incoming: Omit<CartItem, 'qty'> & { qty?: number }) => {
    setItems((prev) => {
      const qty = Math.max(1, incoming.qty || 1);
      const idx = prev.findIndex((it) => it.id === incoming.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [...prev, { ...incoming, qty }];
    });
    setIsOpen(true);
    trackAddToCart({
      id: incoming.productId,
      name: incoming.name,
      price: incoming.price,
      quantity: Math.max(1, incoming.qty || 1),
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, qty: Math.max(1, qty) } : it)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  /**
   * Refresh prices by re-querying /api/products for each distinct productId
   * in the cart. Critical for the catalog-changes-mid-cart case: admin
   * updates a price → next time the customer opens cart, prices update +
   * caller can show a "price changed" notice.
   */
  const refreshPrices = useCallback(async () => {
    if (items.length === 0) return [];
    const distinctIds = Array.from(new Set(items.map((it) => it.productId)));
    const priceMap = new Map<string, number>();

    await Promise.all(
      distinctIds.map(async (pid) => {
        try {
          // /api/products returns an array, no single-product endpoint by ID,
          // so we scan published products for the one we want. Cache:no-store
          // is critical — without it Next.js may serve a stale CDN copy.
          const res = await fetch('/api/products', { cache: 'no-store' });
          if (!res.ok) return;
          const arr = await res.json();
          const match = Array.isArray(arr) ? arr.find((p: { id?: string }) => p?.id === pid) : null;
          if (match && typeof match.price === 'number') priceMap.set(pid, match.price);
        } catch {
          // Network error — leave price as-is rather than zeroing it out
        }
      }),
    );

    const changed: Array<{ id: string; name: string; oldPrice: number; newPrice: number }> = [];
    setItems((prev) =>
      prev.map((it) => {
        const base = priceMap.get(it.productId);
        if (base === undefined) return it;
        // Re-apply the personalisation surcharge so a catalog price change
        // doesn't silently drop the +fee the customer agreed to.
        const newPrice = it.customization ? base + CUSTOMIZATION_FEE : base;
        if (Math.abs(newPrice - it.price) > 0.01) {
          changed.push({ id: it.id, name: it.name, oldPrice: it.price, newPrice });
          return { ...it, price: newPrice };
        }
        return it;
      }),
    );
    return changed;
  }, [items]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((sum, it) => sum + it.qty, 0),
    subtotal: items.reduce((sum, it) => sum + it.qty * it.price, 0),
    addItem,
    removeItem,
    setQty,
    clear,
    refreshPrices,
    isOpen,
    openCart: () => setIsOpen(true),
    closeCart: () => setIsOpen(false),
  }), [items, isOpen, addItem, removeItem, setQty, clear, refreshPrices]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

/** Build a stable line id from product attributes. A distinct customization
 *  makes a distinct line so two differently-personalised jerseys don't merge. */
export function buildCartLineId(productId: string, size?: string, color?: string, customization?: string) {
  return [productId, size || '_', color || '_', customization ? `c:${customization}` : '_'].join('|');
}
