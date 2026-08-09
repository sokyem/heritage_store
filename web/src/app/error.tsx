'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Top-level error boundary for the storefront. Next.js requires this to be a
// Client Component. Anything thrown deeper in the tree without its own
// `error.tsx` ends up here. We surface a friendly fallback + a retry button
// instead of the default Next.js dev page.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to the browser console so devs see it and so any future telemetry
    // (Sentry / Datadog) can pick it up. `digest` lets us correlate with
    // server logs when the error originated on the server.
    console.error('Storefront error boundary caught:', error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[color:var(--aw-cream,#FAF7F1)] px-6 py-20">
      <div className="max-w-xl text-center">
        <p
          className="text-xs uppercase tracking-[0.3em] text-[color:var(--aw-text-muted,#8B7569)] mb-4"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Something went wrong
        </p>
        <h1
          className="text-4xl sm:text-5xl mb-4 text-[color:var(--aw-text-strong,#1B2A5B)]"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          We hit an unexpected snag.
        </h1>
        <p className="text-base text-[color:var(--aw-text-muted,#5A4A40)] mb-2">
          The team has been notified. Please try again, or head back to the homepage and pick up
          where you left off.
        </p>
        {error?.digest && (
          <p className="text-xs text-[color:var(--aw-text-muted,#8B7569)] mb-8 font-mono">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-[color:var(--aw-navy,#1B2A5B)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md border border-[color:var(--aw-border,#E8E3DB)] text-sm font-medium text-[color:var(--aw-text-strong,#1B2A5B)] hover:bg-white transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
