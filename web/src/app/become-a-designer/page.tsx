'use client';

import { useState } from 'react';
import Link from 'next/link';

const SPECIALTIES = [
  'Bridal',
  'Evening wear',
  'Menswear',
  'Ready-to-wear',
  'Accessories',
  'Tailoring',
  'Other',
];

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  location: '',
  businessName: '',
  specialty: '',
  yearsExperience: '',
  portfolioUrl: '',
  bio: '',
};

export default function BecomeADesignerPage() {
  const [form, setForm] = useState({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError('Your name and email are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/designer-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit your application.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your application.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#FAF7F2' }}>
        <div className="bg-white rounded-2xl shadow-sm border border-[#F0EBE3] max-w-md w-full p-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5" style={{ backgroundColor: '#22C55E' }}>
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-light mb-3" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
            Application Received
          </h1>
          <p className="text-[#6B7280] leading-relaxed mb-6">
            Thank you for applying to the AWULA K designer network. Our team will review your
            portfolio and complete identity and background verification. We&apos;ll email you as
            soon as a decision is made.
          </p>
          <Link href="/" className="inline-block px-6 py-3 rounded-lg bg-[#1B2A5B] text-white text-sm font-semibold hover:bg-[#2D4A8C]">
            Back to AWULA K
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: '#FAF7F2' }}>
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C41E3A] mb-3">
            Designer Network
          </p>
          <h1 className="text-4xl font-light mb-3" style={{ color: '#1B2A5B', fontFamily: 'var(--font-heading)' }}>
            Become an AWULA K Designer
          </h1>
          <p className="text-[#6B7280] leading-relaxed max-w-lg mx-auto">
            Join our network of vetted couture designers. Every applicant goes through portfolio
            review, identity verification, and a background check before being approved.
          </p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-[#F0EBE3] p-6 sm:p-8 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Full name *">
              <input className="aw-input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </Field>
            <Field label="Email *">
              <input type="email" className="aw-input" value={form.email} onChange={(e) => set('email', e.target.value)} required />
            </Field>
            <Field label="Phone">
              <input type="tel" className="aw-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Location (city, country)">
              <input className="aw-input" value={form.location} onChange={(e) => set('location', e.target.value)} />
            </Field>
            <Field label="Business / label name">
              <input className="aw-input" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} />
            </Field>
            <Field label="Specialty">
              <select className="aw-input" value={form.specialty} onChange={(e) => set('specialty', e.target.value)}>
                <option value="">Select…</option>
                {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Years of experience">
              <input type="number" min={0} className="aw-input" value={form.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value)} />
            </Field>
            <Field label="Portfolio URL">
              <input type="url" placeholder="https://" className="aw-input" value={form.portfolioUrl} onChange={(e) => set('portfolioUrl', e.target.value)} />
            </Field>
          </div>

          <Field label="Tell us about your work">
            <textarea
              className="aw-input"
              rows={4}
              placeholder="Your design background, the clients you serve, and why you'd like to join AWULA K."
              value={form.bio}
              onChange={(e) => set('bio', e.target.value)}
            />
          </Field>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-lg bg-[#1B2A5B] text-white font-semibold hover:bg-[#2D4A8C] transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Application'}
          </button>
          <p className="text-xs text-[#9CA3AF] text-center">
            Submitting an application does not create an account. If approved, you&apos;ll receive
            an email invitation to set up your designer login.
          </p>
        </form>

        <div className="text-center mt-6">
          <Link href="/" className="text-sm text-[#1B2A5B] hover:underline">← Back to AWULA K</Link>
        </div>
      </div>

      <style jsx>{`
        .aw-input {
          width: 100%;
          padding: 0.625rem 0.75rem;
          border: 1px solid #E5E7EB;
          border-radius: 0.5rem;
          font-size: 0.9rem;
          color: #1B2A5B;
          background: #fff;
          outline: none;
        }
        .aw-input:focus {
          border-color: #1B2A5B;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-[#1B2A5B] mb-1.5">{label}</span>
      {children}
    </label>
  );
}
