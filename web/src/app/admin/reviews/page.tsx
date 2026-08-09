'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Review {
  id: string;
  authorName: string;
  rating: number;
  title?: string;
  body?: string;
  status: string;
  verifiedPurchase: boolean;
  createdAt: string;
  product: { id: string; name: string; slug?: string };
}

function Stars({ rating }: { rating: number }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? 'text-[#F59E0B]' : 'text-[#D1D5DB]'}>★</span>
      ))}
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[#FEF3C7] text-[#92400E]',
  approved: 'bg-[#D1FAE5] text-[#065F46]',
  rejected: 'bg-[#FEE2E2] text-[#991B1B]',
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reviews?status=${filter}`);
      const data = await res.json();
      setReviews(data.reviews || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter]);

  async function moderate(id: string, status: 'approved' | 'rejected') {
    setActioning(id);
    try {
      await fetch(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setActioning(null);
    }
  }

  async function deleteReview(id: string) {
    if (!confirm('Delete this review permanently?')) return;
    setActioning(id);
    try {
      await fetch(`/api/admin/reviews/${id}`, { method: 'DELETE' });
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setActioning(null);
    }
  }

  const tabs = ['pending', 'approved', 'rejected', 'all'] as const;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-[#1B2A5B]">Product Reviews</h1>
        <span className="text-sm text-[#8B7569]">{reviews.length} showing</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[#E5E7EB] pb-0">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-colors ${filter === t ? 'border-[#1B2A5B] text-[#1B2A5B]' : 'border-transparent text-[#6B7280] hover:text-[#374151]'}`}
          >{t}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#8B7569]">Loading…</div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[#8B7569]">No {filter === 'all' ? '' : filter} reviews.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#F0EBE3]">
          {reviews.map((r) => (
            <div key={r.id} className="py-5 flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Stars rating={r.rating} />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || ''}`}>{r.status}</span>
                  {r.verifiedPurchase && <span className="text-xs text-[#059669] bg-[#D1FAE5] px-2 py-0.5 rounded-full">Verified Purchase</span>}
                </div>
                <Link href={`/products/${r.product.slug || r.product.id}`} className="text-sm font-medium text-[#8B7569] hover:underline">{r.product.name}</Link>
                {r.title && <p className="font-semibold text-[#1B2A5B] text-sm mt-1">{r.title}</p>}
                {r.body && <p className="text-sm text-[#4B5563] mt-1 leading-relaxed">{r.body}</p>}
                <p className="text-xs text-[#9CA3AF] mt-2">by {r.authorName} · {new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.status !== 'approved' && (
                  <button
                    onClick={() => moderate(r.id, 'approved')}
                    disabled={actioning === r.id}
                    className="px-3 py-1.5 rounded-md bg-[#D1FAE5] text-[#065F46] text-xs font-semibold hover:bg-[#A7F3D0] transition-colors disabled:opacity-50"
                  >Approve</button>
                )}
                {r.status !== 'rejected' && (
                  <button
                    onClick={() => moderate(r.id, 'rejected')}
                    disabled={actioning === r.id}
                    className="px-3 py-1.5 rounded-md bg-[#FEE2E2] text-[#991B1B] text-xs font-semibold hover:bg-[#FECACA] transition-colors disabled:opacity-50"
                  >Reject</button>
                )}
                <button
                  onClick={() => deleteReview(r.id)}
                  disabled={actioning === r.id}
                  className="px-3 py-1.5 rounded-md bg-[#F3F4F6] text-[#6B7280] text-xs font-semibold hover:bg-[#E5E7EB] transition-colors disabled:opacity-50"
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
