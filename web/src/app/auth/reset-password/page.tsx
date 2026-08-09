'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <div className="card p-8 shadow-card text-center">
        <h1 className="text-2xl heading-lg mb-3" style={{ fontFamily: 'var(--font-heading)' }}>Invalid Link</h1>
        <p className="text-sm text-[#8B7569] mb-6">
          This password reset link is invalid or missing. Please request a new one.
        </p>
        <Link href="/auth/forgot-password" className="btn-primary inline-block py-2.5 px-6 text-sm">
          Request New Link
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="card p-8 shadow-card text-center">
        <div className="text-4xl mb-4">&#10003;</div>
        <h1 className="text-2xl heading-lg mb-3" style={{ fontFamily: 'var(--font-heading)' }}>Password Reset</h1>
        <p className="text-sm text-[#8B7569] mb-6">
          Your password has been updated. You can now sign in with your new password.
        </p>
        <Link href="/auth/signin" className="btn-primary inline-block py-2.5 px-6 text-sm">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-8 shadow-card">
      <p className="label-accent mb-1">Account Recovery</p>
      <h1 className="text-3xl heading-lg mb-2" style={{ fontFamily: 'var(--font-heading)' }}>New Password</h1>
      <p className="text-sm text-[#8B7569] mb-6">Choose a new password for your account.</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      <div className="space-y-4 mb-6">
        <div>
          <label className="input-label text-base">New Password</label>
          <input
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field text-base"
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="input-label text-base">Confirm Password</label>
          <input
            type="password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-field text-base"
            required
          />
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full py-3 disabled:opacity-50">
        {loading ? 'Resetting...' : 'Reset Password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
          <Suspense fallback={<div className="text-center"><p className="text-sm text-[#8B7569]">Loading...</p></div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
