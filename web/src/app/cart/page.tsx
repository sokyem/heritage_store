'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useCart } from '@/components/CartContext';
import { CUSTOMIZATION_FEE } from '@/lib/pricing';

export default function CartPage() {
  const { items, count, subtotal, removeItem, setQty, clear, refreshPrices } = useCart();
  const { data: session } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [priceChanges, setPriceChanges] = useState<Array<{ name: string; oldPrice: number; newPrice: number }>>([]);

  // Pull fresh catalog prices when the cart opens so the customer never sees
  // (or pays) a stale price after admin updates the catalog.
  useEffect(() => {
    let cancelled = false;
    refreshPrices().then((changed) => {
      if (cancelled) return;
      if (changed.length > 0) {
        setPriceChanges(changed.map(({ name, oldPrice, newPrice }) => ({ name, oldPrice, newPrice })));
      }
    });
    return () => { cancelled = true; };
    // refreshPrices is stable enough to omit; only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCheckout() {
    if (items.length === 0) return;
    setBusy(true);

    // One last refresh right before checkout — if catalog changed between
    // when cart was opened and Checkout was clicked, we re-warn and stop.
    try {
      const lastMinuteChanges = await refreshPrices();
      if (lastMinuteChanges.length > 0) {
        setPriceChanges(lastMinuteChanges.map(({ name, oldPrice, newPrice }) => ({ name, oldPrice, newPrice })));
        setBusy(false);
        return;
      }
    } catch {
      // If the refresh fails (network), proceed — server will still enforce
      // the authoritative price and reject if it's stale.
    }

    try {
      const itemsSummary = items
        .map((it) => {
          const opts = [it.color, it.size].filter(Boolean).join(' / ');
          const custom = it.customization ? `\n   ✏️ Custom (+$15): ${it.customization}` : '';
          return `${it.qty}× ${it.name}${opts ? ` (${opts})` : ''} — $${(it.price * it.qty).toFixed(2)}${custom}`;
        })
        .join('\n');
      // Clean order title: group identical product names so several size/color
      // lines of the same jersey read "Ghana Black Stars Jersey × 4" rather than
      // a repeated "4 items: name, name, name…" list. (Per-item color/size still
      // lives in customNotes below.)
      const byName = new Map<string, number>();
      for (const it of items) byName.set(it.name, (byName.get(it.name) || 0) + it.qty);
      const grouped = [...byName.entries()];
      const label = ([name, qty]: [string, number]) => (qty > 1 ? `${name} × ${qty}` : name);
      let productName: string;
      if (grouped.length === 1) {
        productName = label(grouped[0]);
      } else {
        const shown = grouped.slice(0, 2).map(label).join(', ');
        const remaining = grouped.length - 2;
        productName = remaining > 0 ? `${shown} + ${remaining} more` : shown;
      }
      // Safety net: flag any line with neither a size nor a color so the admin
      // confirms with the customer before shipping (prevents another order that
      // can't be fulfilled because the variant is unknown).
      const missingVariant = items.filter((it) => !it.color && !it.size);
      const variantFlag = missingVariant.length
        ? `⚠ NEEDS SIZE/COLOR — confirm with customer: ${missingVariant.map((i) => i.name).join(', ')}\n`
        : '';
      const customNotes = `${variantFlag}Cart order (${count} items):\n${itemsSummary}`;

      // Total personalisation surcharge already baked into each line's price —
      // forwarded so the server can reconcile its catalog-derived total.
      const customizationFee = items.reduce(
        (s, it) => s + (it.customization ? CUSTOMIZATION_FEE * it.qty : 0),
        0,
      );

      if (session) {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productName, amount: subtotal, customNotes, customizationFee }),
        });
        if (!res.ok) throw new Error('Failed to create order');
        const order = await res.json();
        clear();
        router.push(`/checkout/${order.id}`);
      } else {
        const firstImage = items[0]?.image || '';
        // Also pass productId so /api/checkout can look up the authoritative
        // catalog price (and reject if our subtotal disagrees by > $0.01)
        const firstId = items[0]?.productId || '';
        const params = new URLSearchParams({
          productName,
          amount: String(subtotal),
          notes: customNotes,
          ...(customizationFee > 0 ? { customizationFee: String(customizationFee) } : {}),
          ...(firstImage ? { productImage: firstImage } : {}),
          ...(firstId && items.length === 1 ? { productId: firstId } : {}),
          // Pass structured variant fields for single-item orders so inventory
          // can be automatically decremented when payment is confirmed.
          ...(items.length === 1 && items[0].size ? { size: items[0].size } : {}),
          ...(items.length === 1 && items[0].color ? { color: items[0].color } : {}),
        });
        router.push(`/checkout?${params.toString()}`);
      }
    } catch (e) {
      console.error(e);
      alert('Could not start checkout. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF8F4]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 style={{ fontFamily: 'var(--font-playfair)' }} className="text-3xl md:text-4xl text-[#1B2A5B] mb-2">Your Cart</h1>
        <p className="text-sm text-[#8B7569] mb-6">{count > 0 ? `${count} item${count > 1 ? 's' : ''} ready to check out.` : 'Your cart is empty.'}</p>

        {/* Price-change notice — appears when admin updated the catalog
            after the customer added something to their cart. */}
        {priceChanges.length > 0 && (
          <div className="mb-6 rounded-lg border border-[#F59E0B] bg-[#FEF3E2] p-4 flex items-start gap-3">
            <span className="text-xl shrink-0">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#78350F] mb-1">Prices updated</p>
              <ul className="text-xs text-[#92400E] space-y-1">
                {priceChanges.map((pc, i) => (
                  <li key={i}>
                    <strong>{pc.name}</strong>: was ${pc.oldPrice.toFixed(2)} · now ${pc.newPrice.toFixed(2)}
                    <span className={pc.newPrice > pc.oldPrice ? ' text-[#9A3412]' : ' text-[#166534]'}>
                      {' '}({pc.newPrice > pc.oldPrice ? '+' : ''}{(pc.newPrice - pc.oldPrice).toFixed(2)})
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setPriceChanges([])}
                className="mt-2 text-xs font-semibold text-[#78350F] underline hover:no-underline"
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="bg-white rounded-lg p-10 text-center shadow-sm border border-[#F0EBE3]">
            <p className="text-[#6B7280] mb-6">Browse our collections to find something you love.</p>
            <Link href="/collections" className="inline-block px-6 py-3 rounded-md bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C]">
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-8">
            {/* Items */}
            <div className="bg-white rounded-lg shadow-sm border border-[#F0EBE3] divide-y divide-[#F3F4F6]">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 p-4 sm:p-5">
                  {item.image && (
                    <Link href={item.slug ? `/products/${item.slug}` : '#'} className="w-24 h-24 sm:w-28 sm:h-28 rounded-md overflow-hidden bg-[#F3F4F6] flex-shrink-0 block">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    </Link>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <Link href={item.slug ? `/products/${item.slug}` : '#'} className="font-semibold text-[#1B2A5B] hover:underline">{item.name}</Link>
                      {(item.size || item.color) && (
                        <p className="text-sm text-[#6B7280] mt-1">{[item.color, item.size].filter(Boolean).join(' · ')}</p>
                      )}
                      {item.customization && (
                        <p className="text-xs text-[#1B2A5B] mt-1 bg-[#F0EBE3] rounded px-2 py-1 inline-block">✏️ {item.customization}</p>
                      )}
                      <p className="text-sm text-[#1B2A5B] mt-1 sm:hidden">${item.price.toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-4 mt-3">
                      <div className="inline-flex items-center border border-[#E5E7EB] rounded-md overflow-hidden">
                        <button onClick={() => setQty(item.id, item.qty - 1)} className="px-3 py-1.5 text-[#374151] hover:bg-[#F9FAFB]" aria-label="Decrease">−</button>
                        <span className="px-3 text-sm font-semibold min-w-[32px] text-center">{item.qty}</span>
                        <button onClick={() => setQty(item.id, item.qty + 1)} className="px-3 py-1.5 text-[#374151] hover:bg-[#F9FAFB]" aria-label="Increase">+</button>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="text-sm text-[#9CA3AF] hover:text-[#C41E3A] underline">Remove</button>
                    </div>
                  </div>
                  <div className="hidden sm:flex flex-col items-end justify-between text-right">
                    <span className="text-sm text-[#6B7280]">${item.price.toFixed(2)}</span>
                    <span className="text-base font-semibold text-[#1B2A5B]">${(item.price * item.qty).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-[#F0EBE3] p-6 h-fit lg:sticky lg:top-6">
              <h2 className="text-lg font-semibold text-[#1B2A5B] mb-4">Order Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[#6B7280]">Subtotal</span><span className="font-semibold text-[#1B2A5B]">${subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-[#6B7280]">Shipping</span><span className="text-[#6B7280]">Calculated at checkout</span></div>
              </div>
              <div className="border-t border-[#F0EBE3] mt-4 pt-4 flex justify-between text-base">
                <span className="font-semibold text-[#1B2A5B]">Total</span>
                <span className="font-bold text-[#1B2A5B]">${subtotal.toFixed(2)}</span>
              </div>
              <button
                onClick={handleCheckout}
                disabled={busy}
                className="w-full mt-5 py-3.5 px-6 rounded-lg bg-[#1B2A5B] text-white font-semibold hover:bg-[#2D4A8C] transition-colors disabled:opacity-50"
              >
                {busy ? 'Starting checkout…' : 'Proceed to Checkout'}
              </button>
              <Link href="/collections" className="block w-full mt-3 text-center py-2 text-sm text-[#1B2A5B] hover:underline">Continue Shopping</Link>
              <button onClick={clear} className="block w-full mt-2 text-center py-2 text-xs text-[#9CA3AF] hover:text-[#C41E3A]">Clear cart</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
