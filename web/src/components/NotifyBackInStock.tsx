'use client';

import { useState } from 'react';

/**
 * "Notify me when back in stock" capture shown on a sold-out product page.
 * Posts to /api/back-in-stock; the back-in-stock cron emails the customer
 * once the product is restocked.
 */
export default function NotifyBackInStock({ productId }: { productId: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'loading') return;
    setState('loading');
    setMessage('');
    try {
      const res = await fetch('/api/back-in-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, productId }),
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
    <div className="w-full rounded-lg border-2 border-[#1B2A5B]/20 bg-[#F9FAFB] p-4">
      <p className="text-sm font-semibold text-[#1B2A5B] mb-1">Sold out</p>
      {state === 'done' ? (
        <p className="text-sm text-[#166534]">
          Got it — we'll email you the moment this is back.
        </p>
      ) : (
        <>
          <p className="text-xs text-[#4B5563] mb-3">
            Enter your email and we'll let you know when it's back in stock.
          </p>
          <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              aria-label="Email address"
              className="flex-1 min-w-0 rounded-md border border-[#D1D5DB] px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B2A5B]"
            />
            <button
              type="submit"
              disabled={state === 'loading'}
              className="rounded-md bg-[#1B2A5B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2D4A8C] transition-colors disabled:opacity-60"
            >
              {state === 'loading' ? 'Saving…' : 'Notify me'}
            </button>
          </form>
          {state === 'error' && <p className="text-xs text-[#C41E3A] mt-2">{message}</p>}
        </>
      )}
    </div>
  );
}
