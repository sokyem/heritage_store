'use client';

import { useEffect, useState } from 'react';

const STAR_PATH =
  'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z';

// Amazon-style star row with partial fill (e.g. 4.3 → fourth star ~30% gold).
function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const gold = '#F59E0B';
  const empty = '#D1D5DB';
  return (
    <span
      className="relative inline-flex"
      style={{ width: size * 5, height: size }}
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      {/* empty base */}
      <span className="absolute inset-0 inline-flex">
        {[0, 1, 2, 3, 4].map((n) => (
          <svg key={n} width={size} height={size} viewBox="0 0 20 20" fill={empty}>
            <path d={STAR_PATH} />
          </svg>
        ))}
      </span>
      {/* gold overlay clipped to pct */}
      <span className="absolute inset-0 inline-flex overflow-hidden" style={{ width: `${pct}%` }}>
        {[0, 1, 2, 3, 4].map((n) => (
          <svg key={n} width={size} height={size} viewBox="0 0 20 20" fill={gold} className="shrink-0">
            <path d={STAR_PATH} />
          </svg>
        ))}
      </span>
    </span>
  );
}

/**
 * Presentational-only star line for listing cards. Data is supplied by the
 * caller (the products list API already returns avgRating + reviewCount),
 * so this fires no network request. Renders nothing when there are no
 * reviews yet, to keep cards clean.
 */
export function InlineStars({ avg, count, size = 13 }: { avg: number; count: number; size?: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <StarRow value={avg} size={size} />
      <span className="text-xs text-[#6B7280]">({count})</span>
    </span>
  );
}

/**
 * Compact, Amazon-style rating summary shown under the product title.
 * Fetches the per-product review stats and links down to the full
 * reviews section (#reviews). Reviews are scoped per product by id.
 */
export default function ProductRating({ productId }: { productId: string }) {
  const [stats, setStats] = useState<{ avg: number; total: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/reviews/${productId}`)
      .then((r) => r.json())
      .then((d) => { if (active) setStats({ avg: d.avg || 0, total: d.total || 0 }); })
      .catch(() => { if (active) setStats({ avg: 0, total: 0 }); });
    return () => { active = false; };
  }, [productId]);

  if (!stats) return null;

  if (stats.total === 0) {
    return (
      <a href="#reviews" className="inline-flex items-center gap-2 group">
        <StarRow value={0} />
        <span className="text-sm text-[#8B7569] group-hover:text-[#1B2A5B] group-hover:underline">
          Be the first to review
        </span>
      </a>
    );
  }

  return (
    <a href="#reviews" className="inline-flex items-center gap-2 group">
      <span className="text-sm font-semibold text-[#1B2A5B]">{stats.avg.toFixed(1)}</span>
      <StarRow value={stats.avg} />
      <span className="text-sm text-[#2563EB] group-hover:underline">
        {stats.total} {stats.total === 1 ? 'rating' : 'ratings'}
      </span>
    </a>
  );
}
