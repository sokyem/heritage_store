'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 min-h-screen">
      <div
        className="hidden md:flex relative items-center justify-center"
        style={{ backgroundImage: 'url(/media/IMG_8381.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 text-center text-white px-8">
          <h2 className="text-3xl font-medium tracking-[0.25em] uppercase" style={{ fontFamily: 'var(--font-heading)' }}>
            AWULA K
          </h2>
          <p className="mt-3 text-base tracking-wide text-white/80">Elegance, redefined.</p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-[#FAF7F2] px-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8">
            <Link href="/" className="text-lg font-medium tracking-[0.2em] uppercase text-[#1B2A5B]" style={{ fontFamily: 'var(--font-heading)' }}>
              AWULA K
            </Link>
            <hr className="divider mx-auto mt-4" />
          </div>

          {sent ? (
            <div className="card p-8 shadow-card text-center">
              <div className="text-4xl mb-4">&#9993;</div>
              <h1 className="text-2xl heading-lg mb-3" style={{ fontFamily: 'var(--font-heading)' }}>Check Your Email</h1>
              <p className="text-sm text-[#8B7569] mb-6">
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link. Check your inbox and spam folder.
              </p>
              <Link href="/auth/signin" className="btn-primary inline-block py-2.5 px-6 text-sm">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="card p-8 shadow-card">
              <p className="label-accent mb-1">Account Recovery</p>
              <h1 className="text-3xl heading-lg mb-2" style={{ fontFamily: 'var(--font-heading)' }}>Forgot Password</h1>
              <p className="text-sm text-[#8B7569] mb-6">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>
              )}

              <div className="mb-4">
                <label className="input-label text-base">Email</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field text-base"
                  required
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3 disabled:opacity-50">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <p className="text-center text-sm mt-5 text-[#8B7569]">
                Remember your password?{' '}
                <Link href="/auth/signin" className="font-medium text-[#C41E3A] hover:underline">Sign In</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
