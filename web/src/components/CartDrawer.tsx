'use client';

import Link from 'next/link';
import { useCart } from './CartContext';

export function CartIcon({ className = '' }: { className?: string }) {
  const { count, openCart } = useCart();
  return (
    <button
      onClick={openCart}
      aria-label={`Open cart (${count} items)`}
      className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#F0EBE3] transition-colors ${className}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-2.4-8M7 13l-2 5h13" />
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="17" cy="20" r="1.5" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C41E3A] text-white text-[10px] font-bold flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

export function CartDrawer() {
  const { items, count, subtotal, isOpen, closeCart, removeItem, setQty } = useCart();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeCart} />
      <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[420px] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0EBE3]">
          <h2 className="text-lg font-semibold text-[#1B2A5B]">Your Cart {count > 0 && <span className="text-sm text-[#8B7569]">({count})</span>}</h2>
          <button onClick={closeCart} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center text-[#374151]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-8 text-center text-[#8B7569]">
              <p className="mb-4">Your cart is empty.</p>
              <Link href="/collections" onClick={closeCart} className="inline-block px-5 py-2.5 rounded-md bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C]">
                Continue Shopping
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-[#F3F4F6]">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3 p-4">
                  {item.image && (
                    <Link href={item.slug ? `/products/${item.slug}` : '#'} onClick={closeCart} className="w-20 h-20 rounded-md overflow-hidden bg-[#F3F4F6] flex-shrink-0 block">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    </Link>
                  )}
                  <div className="flex-1 min-w-0">
                    <Link href={item.slug ? `/products/${item.slug}` : '#'} onClick={closeCart} className="text-sm font-semibold text-[#1B2A5B] hover:underline line-clamp-2">{item.name}</Link>
                    {(item.size || item.color) && (
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        {[item.color, item.size].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {item.customization && (
                      <p className="text-[11px] text-[#1B2A5B] mt-0.5 line-clamp-2">✏️ {item.customization}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="inline-flex items-center border border-[#E5E7EB] rounded-md overflow-hidden">
                        <button onClick={() => setQty(item.id, item.qty - 1)} className="px-2 py-1 text-[#374151] hover:bg-[#F9FAFB]" aria-label="Decrease">−</button>
                        <span className="px-3 text-sm font-semibold min-w-[28px] text-center">{item.qty}</span>
                        <button onClick={() => setQty(item.id, item.qty + 1)} className="px-2 py-1 text-[#374151] hover:bg-[#F9FAFB]" aria-label="Increase">+</button>
                      </div>
                      <span className="text-sm font-semibold text-[#1B2A5B]">${(item.price * item.qty).toFixed(2)}</span>
                    </div>
                  </div>
                  <button onClick={() => removeItem(item.id)} aria-label="Remove" className="self-start text-[#9CA3AF] hover:text-[#C41E3A]">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-[#F0EBE3] p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[#6B7280]">Subtotal</span>
              <span className="font-semibold text-[#1B2A5B]">${subtotal.toFixed(2)}</span>
            </div>
            <p className="text-xs text-[#9CA3AF]">Shipping &amp; taxes calculated at checkout.</p>
            <Link
              href="/cart"
              onClick={closeCart}
              className="w-full inline-flex justify-center py-3 px-6 rounded-lg bg-[#1B2A5B] text-white font-semibold hover:bg-[#2D4A8C] transition-colors"
            >
              Review Cart &amp; Checkout
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
