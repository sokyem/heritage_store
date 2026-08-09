'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface Review {
  id: string;
  authorName: string;
  rating: number;
  title?: string;
  body?: string;
  verifiedPurchase?: boolean;
  helpfulCount?: number;
  createdAt: string;
}

interface ReviewStats {
  reviews: Review[];
  total: number;
  avg: number;
  distribution: Record<number, number>;
}

function Stars({ rating, size = 16, color = '#F59E0B' }: { rating: number; size?: number; color?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 20 20" fill={n <= Math.round(rating) ? color : 'none'} stroke={color} strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export function StarRating({ rating, onChange }: { rating: number; onChange: (n: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <span className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <svg width={24} height={24} viewBox="0 0 20 20" fill={(hovered || rating) >= n ? '#F59E0B' : 'none'} stroke="#F59E0B" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </span>
  );
}

export default function ReviewsSection({ productId }: { productId: string }) {
  const { data: session } = useSession();
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    authorName: (session?.user?.name as string) || '',
    authorEmail: (session?.user?.email as string) || '',
    rating: 0,
    title: '',
    reviewBody: '',
  });

  useEffect(() => {
    fetch(`/api/reviews/${productId}`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => null);
  }, [productId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.rating === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${productId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSuccess(true);
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!stats) return null;

  return (
    <section className="mt-16 pt-10 border-t border-[#E5E7EB]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h2 style={{ fontFamily: 'var(--font-playfair)' }} className="text-2xl text-[#1B2A5B] mb-2">
            Customer Reviews
          </h2>
          {stats.total > 0 && (
            <div className="flex items-center gap-3">
              <Stars rating={stats.avg} size={20} />
              <span className="text-2xl font-semibold text-[#1B2A5B]">{stats.avg}</span>
              <span className="text-sm text-[#8B7569]">out of 5 · {stats.total} review{stats.total !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
        {!showForm && !success && (
          <button
            onClick={() => setShowForm(true)}
            className="self-start px-5 py-2.5 rounded-lg border-2 border-[#1B2A5B] text-[#1B2A5B] text-sm font-semibold hover:bg-[#F9FAFB] transition-colors"
          >
            Write a Review
          </button>
        )}
      </div>

      {/* Rating distribution */}
      {stats.total > 0 && (
        <div className="flex flex-col gap-1.5 max-w-sm mb-8">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = stats.distribution[n] || 0;
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return (
              <div key={n} className="flex items-center gap-2 text-xs text-[#6B7280]">
                <span className="w-4 text-right">{n}</span>
                <svg className="w-3 h-3 text-[#F59E0B]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                <div className="flex-1 bg-[#E5E7EB] rounded-full h-2">
                  <div className="bg-[#F59E0B] h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Write review form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-6 mb-8 max-w-xl">
          <h3 className="font-semibold text-[#1B2A5B] mb-4">Your Review</h3>
          <div className="mb-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#374151] block mb-2">Rating *</label>
            <StarRating rating={form.rating} onChange={(n) => setForm((f) => ({ ...f, rating: n }))} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#374151] block mb-1">Name *</label>
              <input
                value={form.authorName}
                onChange={(e) => setForm((f) => ({ ...f, authorName: e.target.value }))}
                required
                className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/30 focus:border-[#1B2A5B]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#374151] block mb-1">Email</label>
              <input
                type="email"
                value={form.authorEmail}
                onChange={(e) => setForm((f) => ({ ...f, authorEmail: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/30 focus:border-[#1B2A5B]"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#374151] block mb-1">Review Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Summarize your experience"
              className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/30 focus:border-[#1B2A5B]"
            />
          </div>
          <div className="mb-5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#374151] block mb-1">Your Review</label>
            <textarea
              rows={4}
              value={form.reviewBody}
              onChange={(e) => setForm((f) => ({ ...f, reviewBody: e.target.value }))}
              placeholder="Tell others what you loved (or didn't) about this piece…"
              className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1B2A5B]/30 focus:border-[#1B2A5B] resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting || form.rating === 0} className="px-6 py-2.5 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#2D4A8C] transition-colors">
              {submitting ? 'Submitting…' : 'Submit Review'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 text-sm text-[#6B7280] hover:text-[#374151]">Cancel</button>
          </div>
        </form>
      )}

      {success && (
        <div className="mb-6 p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-sm text-[#166534]">
          Thank you! Your review has been submitted and will appear after moderation.
        </div>
      )}

      {/* Review list */}
      {stats.reviews.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-[#8B7569] text-sm">No reviews yet. Be the first to share your experience!</p>
        </div>
      ) : (
        <div className="divide-y divide-[#F0EBE3]">
          {stats.reviews.map((r) => (
            <div key={r.id} className="py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Stars rating={r.rating} size={14} />
                    {r.verifiedPurchase && (
                      <span className="text-xs font-medium text-[#059669] bg-[#D1FAE5] px-2 py-0.5 rounded-full">Verified Purchase</span>
                    )}
                  </div>
                  {r.title && <p className="font-semibold text-[#1B2A5B] text-sm">{r.title}</p>}
                </div>
                <span className="text-xs text-[#9CA3AF] shrink-0">
                  {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              {r.body && <p className="mt-2 text-sm text-[#4B5563] leading-relaxed">{r.body}</p>}
              <p className="mt-2 text-xs text-[#8B7569]">{r.authorName}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
