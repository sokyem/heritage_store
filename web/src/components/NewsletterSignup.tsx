'use client';

import { useState } from 'react';

/**
 * Storefront "Get updates" email capture. Posts to /api/newsletter/subscribe.
 * Drop it anywhere on the public site; `source` tags where the signup came
 * from so the admin can see which placements convert.
 */
export default function NewsletterSignup({ source = 'footer' }: { source?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'loading') return;
    setState('loading');
    setMessage('');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState('done');
        setEmail('');
      } else {
        setState('error');
        setMessage(data.error || 'Something went wrong.');
      }
    } catch {
      setState('error');
      setMessage('Something went wrong. Please try again.');
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold tracking-[0.1em] uppercase text-white/70 mb-4">
        Get updates
      </p>
      {state === 'done' ? (
        <p className="text-base text-white/80">
          Thanks — you're on the list. Watch your inbox for new arrivals.
        </p>
      ) : (
        <>
          <p className="text-base leading-relaxed mb-4">
            New arrivals, restocks &amp; private offers — straight to your inbox.
          </p>
          <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              aria-label="Email address"
              className="flex-1 min-w-0 rounded-lg bg-white/10 border border-white/20 px-4 py-3 text-base text-white placeholder-white/40 focus:outline-none focus:border-white/50"
            />
            <button
              type="submit"
              disabled={state === 'loading'}
              className="rounded-lg bg-white px-6 py-3 text-base font-semibold text-[#0F1A3A] hover:bg-white/90 transition-colors disabled:opacity-60"
            >
              {state === 'loading' ? 'Joining…' : 'Subscribe'}
            </button>
          </form>
          {state === 'error' && <p className="text-sm text-red-300 mt-2">{message}</p>}
        </>
      )}
    </div>
  );
}
