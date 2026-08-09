'use client';

import { useEffect, useState, useCallback } from 'react';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  subcategory: string | null;
  price: number;
  totalStock: number;
  isPublished: boolean;
  images: string | null;
  variants?: { id: string; sku: string; size: string | null; color: string | null; stock: number; isAvailable: boolean }[];
}

function fmtCurrency(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FinishedInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<string>('');
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  useEffect(() => {
    fetch('/api/admin/settings/notifications')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const t = d?.value?.lowStockThreshold;
        if (typeof t === 'number') setLowStockThreshold(t);
      })
      .catch(() => { /* keep default */ });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((d) => setProducts(Array.isArray(d) ? d : d.products || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    const matchStock = !stockFilter || (stockFilter === 'low' && p.totalStock > 0 && p.totalStock <= lowStockThreshold) || (stockFilter === 'out' && p.totalStock === 0) || (stockFilter === 'in' && p.totalStock > lowStockThreshold);
    return matchSearch && matchStock;
  });

  const totalStock = products.reduce((s, p) => s + p.totalStock, 0);
  const totalValue = products.reduce((s, p) => s + p.price * p.totalStock, 0);
  const lowStock = products.filter((p) => p.totalStock > 0 && p.totalStock <= lowStockThreshold).length;
  const outOfStock = products.filter((p) => p.totalStock === 0).length;

  const stats = [
    { label: 'Total Products', value: products.length, color: '#1B2A5B' },
    { label: 'Total Stock', value: totalStock, color: '#6366F1' },
    { label: 'Inventory Value', value: fmtCurrency(totalValue), color: '#22C55E' },
    { label: 'Low / Out of Stock', value: `${lowStock} / ${outOfStock}`, color: lowStock + outOfStock > 0 ? '#C41E3A' : '#22C55E' },
  ];

  async function updateStock(productId: string, newStock: number) {
    await fetch(`/api/admin/products/${productId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalStock: newStock }),
    });
    load();
  }

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Finished Products Inventory</h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">Track stock levels for ready-to-wear &amp; finished goods</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="card bg-white rounded-lg border border-[color:var(--aw-border)] p-4">
            <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] mb-1">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input className="input-field text-base py-2.5 flex-1 max-w-md" placeholder="Search by name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input-field text-base py-2.5 max-w-xs" value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
          <option value="">All Stock Levels</option>
          <option value="in">In Stock ({lowStockThreshold + 1}+)</option>
          <option value="low">Low Stock (1–{lowStockThreshold})</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      {error && <div className="bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)] rounded-lg px-4 py-3 mb-5 text-sm">{error}</div>}

      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-[color:var(--aw-border)] overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-[#E8E3DB] bg-[color:var(--aw-surface-muted)]">
                {['SKU', 'Product', 'Category', 'Price', 'Stock', 'Value', 'Status', 'Quick Update'].map((h) => (
                  <th key={h} className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-5 py-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const stockColor = p.totalStock === 0 ? '#C41E3A' : p.totalStock <= 5 ? '#F59E0B' : '#22C55E';
                return (
                  <tr key={p.id} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-surface-muted)] transition-colors">
                    <td className="px-5 py-4 text-[15px] font-mono text-[color:var(--aw-text-muted)]">{p.sku}</td>
                    <td className="px-5 py-4 text-[15px] font-semibold text-[color:var(--aw-text-strong)]">{p.name}</td>
                    <td className="px-5 py-4 text-sm text-[color:var(--aw-text-muted)]">{p.category}{p.subcategory ? ` / ${p.subcategory}` : ''}</td>
                    <td className="px-5 py-4 text-[15px]">{fmtCurrency(p.price)}</td>
                    <td className="px-5 py-4 text-[15px] font-bold" style={{ color: stockColor }}>{p.totalStock}</td>
                    <td className="px-5 py-4 text-[15px] text-[color:var(--aw-text-strong)]">{fmtCurrency(p.price * p.totalStock)}</td>
                    <td className="px-5 py-4">
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: stockColor + '18', color: stockColor }}>
                        {p.totalStock === 0 ? 'Out' : p.totalStock <= 5 ? 'Low' : 'In Stock'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button className="w-7 h-7 rounded border border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)] text-sm" onClick={() => updateStock(p.id, Math.max(0, p.totalStock - 1))}>−</button>
                        <span className="w-8 text-center text-sm font-medium">{p.totalStock}</span>
                        <button className="w-7 h-7 rounded border border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)] text-sm" onClick={() => updateStock(p.id, p.totalStock + 1)}>+</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-[color:var(--aw-text-muted)]">No products found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
