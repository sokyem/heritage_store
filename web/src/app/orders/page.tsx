'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart, buildCartLineId } from '@/components/CartContext';

interface Product {
  id: number | string;
  name: string;
  slug?: string;
  price: number;
  compareAt?: number;
  image: string;
  category: string;
  description?: string;
  badge?: string;
  buyable?: boolean;
}

export default function Collection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const { addItem } = useCart();
  const router = useRouter();

  const handleAddToCart = (product: Product) => {
    addItem({
      id: buildCartLineId(String(product.id)),
      productId: String(product.id),
      slug: product.slug,
      name: product.name,
      price: product.price,
      image: product.image,
    });
    router.push('/cart');
  };

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to load products:', err))
      .finally(() => setLoading(false));
  }, []);

  // Build categories dynamically — fixed order
  const categoryOrder = ['All', 'Women', 'Men', 'Jewelry', 'Accessories', 'Couture', 'Bridal', 'Prom'];
  const categorySet = new Set(products.map((p) => p.category));
  const categories = categoryOrder.filter((c) => c === 'All' || categorySet.has(c));

  const filtered =
    activeCategory === 'All'
      ? products
      : products.filter((p) => p.category === activeCategory);

  const badgeColors: Record<string, { bg: string; text: string }> = {
    Sale: { bg: '#C41E3A', text: '#FFF' },
    New: { bg: '#1B2A5B', text: '#FFF' },
    'Sold out': { bg: '#6B7280', text: '#FFF' },
    Featured: { bg: '#D4A574', text: '#FFF' },
    Signature: { bg: '#8B7569', text: '#FFF' },
    Limited: { bg: '#7C3AED', text: '#FFF' },
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <header className="border-b border-[rgba(27,42,91,0.08)] bg-white">
        <div className="max-w-[1300px] mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-lg font-medium tracking-[0.15em] uppercase text-[#1B2A5B]">AWULA K</Link>
              <span className="text-sm text-[#8B7569]">/</span>
              <span className="text-base text-[#1B2A5B]">Collection</span>
            </div>
            <Link href="/customer/dashboard" className="btn-outline text-sm py-1.5 px-4">Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1300px] mx-auto px-6 lg:px-10 py-10 animate-fade-in">
        <h1 className="heading-lg text-[#1B2A5B] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          Our Collection
        </h1>
        <p className="text-base text-[#8B7569] mb-8">
          Handcrafted pieces rooted in Ghanaian heritage — from everyday wear to bespoke couture.
        </p>

        {/* Category filter */}
        <div className="flex flex-wrap gap-3 mb-10">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={
                cat === activeCategory
                  ? 'btn-accent text-sm py-1.5 px-5'
                  : 'btn-outline text-sm py-1.5 px-5'
              }
            >
              {cat}
              {cat !== 'All' && (
                <span className="ml-1.5 text-xs opacity-60">
                  ({products.filter((p) => p.category === cat).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="loading-spinner mx-auto" />
          </div>
        )}

        {/* Product grid */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((product) => {
              const isSoldOut = product.badge === 'Sold out';
              const hasComparePrice = product.compareAt && product.compareAt > product.price;

              return (
                <div key={product.id} className="card shadow-soft overflow-hidden flex flex-col group">
                  <div className="product-image-wrap relative" style={{ aspectRatio: '3/4' }}>
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      className={`object-cover transition-transform duration-500 group-hover:scale-105 ${isSoldOut ? 'opacity-60' : ''}`}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                    {/* Badge */}
                    {product.badge && (
                      <span
                        className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded"
                        style={{
                          background: badgeColors[product.badge]?.bg || '#1B2A5B',
                          color: badgeColors[product.badge]?.text || '#FFF',
                        }}
                      >
                        {product.badge}
                      </span>
                    )}
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <span className="label-accent text-xs mb-2">{product.category}</span>
                    <h3 className="text-lg font-medium text-[#1B2A5B] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
                      {product.slug ? (
                        <Link href={`/products/${product.slug}`} className="hover:underline">
                          {product.name}
                        </Link>
                      ) : (
                        product.name
                      )}
                    </h3>

                    {/* Pricing */}
                    <div className="flex items-baseline gap-2 mb-2">
                      <p className="text-xl font-medium text-[#1B2A5B]" style={{ fontFamily: 'var(--font-heading)' }}>
                        ${product.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                      {hasComparePrice && (
                        <p className="text-sm text-[#8B7569] line-through">
                          ${product.compareAt!.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>

                    <p className="text-sm text-[#8B7569] mb-4 flex-1 leading-relaxed">
                      {product.description}
                    </p>

                    {/* Action buttons — buyable items get Add to Cart */}
                    <div className="flex gap-3 mt-auto">
                      {isSoldOut ? (
                        <button className="btn-outline text-sm py-2 px-4 flex-1 opacity-50 cursor-not-allowed" disabled>
                          Sold Out
                        </button>
                      ) : product.buyable !== false ? (
                        <>
                          <button
                            onClick={() => handleAddToCart(product)}
                            className="btn-primary text-sm py-2 px-4 flex-1"
                          >
                            Add to Cart
                          </button>
                          <button
                            onClick={() => router.push('/consults')}
                            className="btn-outline text-sm py-2 px-4"
                          >
                            Custom Fit
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => router.push('/consults')}
                            className="btn-primary text-sm py-2 px-4 flex-1"
                          >
                            Inquire
                          </button>
                          <button
                            onClick={() => router.push('/consults')}
                            className="btn-outline text-sm py-2 px-4"
                          >
                            Custom Fit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-base text-[#8B7569]">No items in this category yet.</p>
          </div>
        )}
      </main>
    </div>
  );
}
