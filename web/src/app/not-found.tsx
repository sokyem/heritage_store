import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found',
  description: "The page you're looking for has moved, been renamed, or never existed.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[color:var(--aw-cream,#FAF7F1)] px-6 py-20">
      <div className="max-w-xl text-center">
        <p
          className="text-xs uppercase tracking-[0.3em] text-[color:var(--aw-text-muted,#8B7569)] mb-4"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Error 404
        </p>
        <h1
          className="text-4xl sm:text-5xl mb-4 text-[color:var(--aw-text-strong,#1B2A5B)]"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          We couldn&apos;t find that page.
        </h1>
        <p className="text-base text-[color:var(--aw-text-muted,#5A4A40)] mb-8">
          The link may be broken or the piece may have been moved. Try one of the routes below or
          start a fresh search.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-[color:var(--aw-navy,#1B2A5B)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Back to home
          </Link>
          <Link
            href="/collections"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md border border-[color:var(--aw-border,#E8E3DB)] text-sm font-medium text-[color:var(--aw-text-strong,#1B2A5B)] hover:bg-white transition-colors"
          >
            Browse collections
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md border border-[color:var(--aw-border,#E8E3DB)] text-sm font-medium text-[color:var(--aw-text-strong,#1B2A5B)] hover:bg-white transition-colors"
          >
            Search
          </Link>
          <Link
            href="/consultations"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md border border-[color:var(--aw-border,#E8E3DB)] text-sm font-medium text-[color:var(--aw-text-strong,#1B2A5B)] hover:bg-white transition-colors"
          >
            Book a consultation
          </Link>
        </div>
      </div>
    </main>
  );
}
