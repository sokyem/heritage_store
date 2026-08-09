'use client';

import { useEffect } from 'react';

// Last-resort error boundary. Renders only when the root layout itself throws
// (so we can't rely on any provider, theme, or shared styling). Must include
// its own <html> and <body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root-layout error boundary caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#FAF7F1', color: '#1B2A5B' }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <p style={{ fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#8B7569', marginBottom: 16 }}>
              Something went wrong
            </p>
            <h1 style={{ fontSize: '2.5rem', margin: '0 0 1rem' }}>We hit an unexpected snag.</h1>
            <p style={{ color: '#5A4A40', marginBottom: 24 }}>
              Please try again — if the problem persists, head back to the homepage.
            </p>
            {error?.digest && (
              <p style={{ fontSize: 12, color: '#8B7569', marginBottom: 16, fontFamily: 'monospace' }}>
                Reference: {error.digest}
              </p>
            )}
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '10px 20px',
                borderRadius: 6,
                border: 'none',
                background: '#1B2A5B',
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
                marginRight: 12,
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '10px 20px',
                borderRadius: 6,
                border: '1px solid #E8E3DB',
                color: '#1B2A5B',
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Back to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
