'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      // Auto sign-in after successful signup (no redirect to NextAuth's hosted page).
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError('Account created, but sign-in failed. Please sign in manually.');
        setLoading(false);
        return;
      }
      window.location.href = '/';
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 min-h-screen">
      {/* Left column – brand image (hidden on mobile) */}
      <div
        className="hidden md:flex relative items-center justify-center"
        style={{
          backgroundImage: 'url(/media/IMG_8381.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* dark overlay */}
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 text-center text-white px-8">
          <h2
            className="text-3xl font-medium tracking-[0.25em] uppercase"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            AWULA K
          </h2>
          <p className="mt-3 text-base tracking-wide text-white/80">
            Elegance, redefined.
          </p>
        </div>
      </div>

      {/* Right column – sign-up form */}
      <div className="flex items-center justify-center bg-[#FAF7F2] px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8">
            <a
              href="/"
              className="text-lg font-medium tracking-[0.2em] uppercase text-[#1B2A5B]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              AWULA K
            </a>
            <hr className="divider mx-auto mt-4" />
          </div>
          <form onSubmit={handleSubmit} className="card p-8 shadow-card">
            <p className="label-accent mb-1">Join Us</p>
            <h1
              className="text-3xl heading-lg mb-6"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Create Account
            </h1>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="input-label text-base">Full Name</label>
                <input
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field text-base"
                />
              </div>
              <div>
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
              <div>
                <label className="input-label text-base">Password</label>
                <input
                  type="password"
                  placeholder="Min 8 characters"
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
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input-field text-base"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-6 py-3 disabled:opacity-60"
            >
              {loading ? 'Creating Account…' : 'Create Account'}
            </button>

            <p className="text-center text-sm mt-5 text-[#8B7569]">
              Already have an account?{' '}
              <a
                href="/auth/signin"
                className="font-medium text-[#C41E3A] hover:underline"
              >
                Sign In
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
