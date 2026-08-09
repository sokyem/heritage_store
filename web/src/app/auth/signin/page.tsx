'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

function getSafeCallbackUrl(value: string | null | undefined) {
  if (!value) return '/';
  if (value.startsWith('/')) return value;

  try {
    const parsed = new URL(value);
    if (parsed.hostname === 'awulak.com' || parsed.hostname === 'www.awulak.com' || parsed.hostname === 'localhost') {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    }
  } catch {
    // Ignore invalid callback URLs and fall back.
  }

  return '/';
}

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [safeCallbackUrl, setSafeCallbackUrl] = useState('/');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackUrl = params.get('callbackUrl');
    const nextCallback = getSafeCallbackUrl(callbackUrl);
    setSafeCallbackUrl(nextCallback);

    // If NextAuth redirected here with an error code, show a friendly message inline.
    const errorCode = params.get('error');
    if (errorCode) {
      setError(
        errorCode === 'CredentialsSignin'
          ? 'Invalid email or password. Please try again.'
          : 'Sign-in failed. Please try again.'
      );
      // Strip the error param from the URL so a refresh doesn’t keep showing it.
      params.delete('error');
      const cleanQuery = params.toString();
      router.replace(`/auth/signin${cleanQuery ? `?${cleanQuery}` : ''}`);
    }

    if (!callbackUrl) return;
    if (nextCallback === '/' && callbackUrl !== '/') {
      router.replace('/auth/signin');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (!result) {
        setError('Sign-in failed. Please try again.');
        return;
      }
      if (result.error) {
        setError(
          result.error === 'CredentialsSignin'
            ? 'Invalid email or password.'
            : 'Sign-in failed. Please try again.'
        );
        return;
      }

      // Successful auth: navigate using the same-origin sanitized callback.
      router.push(safeCallbackUrl || '/');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
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

      {/* Right column – sign-in form */}
      <div className="flex items-center justify-center bg-[#FAF7F2] px-6">
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
            <p className="label-accent mb-1">Welcome Back</p>
            <h1
              className="text-3xl heading-lg mb-6"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Sign In
            </h1>
            <div className="space-y-4">
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
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field text-base pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B7569] hover:text-[#1B2A5B] transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-2">
              <a href="/auth/forgot-password" className="text-xs text-[#8B7569] hover:text-[#C41E3A] transition-colors">
                Forgot password?
              </a>
            </div>
            {error && (
              <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full mt-4 py-3 disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <p className="text-center text-sm mt-5 text-[#8B7569]">
              New to AWULA K?{' '}
              <a href="/auth/signup" className="font-medium text-[#C41E3A] hover:underline">Create an Account</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
