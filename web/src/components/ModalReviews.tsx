'use client';

import { useEffect, useState } from 'react';

const STAR_PATH =
  'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z';

function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="relative inline-flex" style={{ width: size * 5, height: size }} aria-label={`${value.toFixed(1)} out of 5 stars`}>
      <span className="absolute inset-0 inline-flex">
        {[0, 1, 2, 3, 4].map((n) => (
          <svg key={n} width={size} height={size} viewBox="0 0 20 20" fill="#D1D5DB"><path d={STAR_PATH} /></svg>
        ))}
      </span>
      <span className="absolute inset-0 inline-flex overflow-hidden" style={{ width: `${pct}%` }}>
        {[0, 1, 2, 3, 4].map((n) => (
          <svg key={n} width={size} height={size} viewBox="0 0 20 20" fill="#F59E0B" className="shrink-0"><path d={STAR_PATH} /></svg>
        ))}
      </span>
    </span>
  );
}

interface Review {
  id: string;
  authorName: string;
  rating: number;
  title?: string;
  body?: string;
  verifiedPurchase?: boolean;
  createdAt: string;
}

/**
 * Compact, read-only reviews block for the quick-view product modal. Shows the
 * average rating + count and the most recent few approved reviews, so shoppers
 * can see social proof before adding to cart. A link opens the full product
 * page (which has the write-a-review form). Renders a gentle empty state when
 * there are no reviews yet.
 */
export default function ModalReviews({ productId, productSlug }: { productId: string; productSlug?: string }) {
  const [stats, setStats] = useState<{ reviews: Review[]; total: number; avg: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/reviews/${productId}`)
      .then((r) => r.json())
      .then((d) => { if (active) setStats({ reviews: d.reviews || [], total: d.total || 0, avg: d.avg || 0 }); })
      .catch(() => { if (active) setStats({ reviews: [], total: 0, avg: 0 }); });
    return () => { active = false; };
  }, [productId]);

  if (!stats) return null;

  return (
    <div className="mt-5 pt-5 border-t border-[#E5E7EB]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#374151]">Customer Reviews</h3>
        {productSlug && (
          <a href={`/products/${productSlug}#reviews`} className="text-xs font-medium text-[#2563EB] hover:underline">
            {stats.total > 0 ? 'See all & write a review' : 'Write a review'}
          </a>
        )}
      </div>

      {stats.total === 0 ? (
        <p className="text-sm text-[#8B7569]">No reviews yet — be the first to share your experience.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg font-semibold text-[#1B2A5B]">{stats.avg.toFixed(1)}</span>
            <StarRow value={stats.avg} size={16} />
            <span className="text-xs text-[#6B7280]">({stats.total})</span>
          </div>
          <div className="space-y-3 max-h-44 overflow-y-auto pr-1">
            {stats.reviews.slice(0, 3).map((r) => (
              <div key={r.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <StarRow value={r.rating} size={12} />
                  {r.verifiedPurchase && (
                    <span className="text-[10px] font-medium text-[#059669] bg-[#D1FAE5] px-1.5 py-0.5 rounded-full">Verified</span>
                  )}
                </div>
                {r.title && <p className="font-semibold text-[#1B2A5B] text-xs mt-1">{r.title}</p>}
                {r.body && <p className="text-xs text-[#4B5563] mt-0.5 leading-relaxed line-clamp-3">{r.body}</p>}
                <p className="text-[11px] text-[#9CA3AF] mt-0.5">— {r.authorName}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
