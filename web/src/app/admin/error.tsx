'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Admin-scoped error boundary. Keeps the staff inside the workspace instead of
// being bounced to the storefront error page, and surfaces the digest so we
// can correlate with server logs.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin error boundary caught:', error);
  }, [error]);

  return (
    <div className="p-8 lg:p-10 max-w-3xl">
      <div className="bg-white rounded-xl border border-[color:var(--aw-border)] shadow-sm p-8">
        <p className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] font-medium mb-2">
          Something broke
        </p>
        <h1
          className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-2"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          This admin screen couldn&apos;t load.
        </h1>
        <p className="text-sm text-[color:var(--aw-text-muted)] mb-4">
          Try again — if it keeps happening, take a screenshot of this page (including the
          reference below) and share it with engineering.
        </p>
        {error?.digest && (
          <p className="text-xs font-mono text-[color:var(--aw-text-muted)] bg-[color:var(--aw-cream)] px-3 py-2 rounded mb-6 break-all">
            digest: {error.digest}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="btn-primary text-sm px-4 py-2"
          >
            Try again
          </button>
          <Link href="/admin" className="btn-outline text-sm px-4 py-2">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
