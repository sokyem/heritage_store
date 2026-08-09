'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function AcceptInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [info, setInfo] = useState<{ email: string; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing token.');
      setLoading(false);
      return;
    }
    fetch(`/api/admin/invites/accept?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setInfo(d);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      router.push('/auth/signin?accepted=1');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-12 text-center text-sm">Loading…</div>;
  if (error)
    return (
      <div className="max-w-md mx-auto p-12 text-center">
        <h1 className="text-xl font-semibold mb-2">Invitation problem</h1>
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
        Accept invitation
      </h1>
      <p className="text-sm text-[var(--aw-text-light)] mb-6">
        You've been invited as <strong>{info?.role}</strong> on AWULA K with the email{' '}
        <strong>{info?.email}</strong>. Set a name and password to finish.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-xs block mb-1">Full name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs block mb-1">Password (min 8 chars)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2 text-sm bg-[var(--aw-navy)] text-white disabled:opacity-60"
        >
          {submitting ? 'Creating account…' : 'Accept & create account'}
        </button>
      </form>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm">Loading…</div>}>
      <AcceptInner />
    </Suspense>
  );
}
