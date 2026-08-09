'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { showSuccessToast, showErrorToast } from '@/components/Toast';

interface Measurement {
  id: string;
  bust?: number;
  waist?: number;
  hip?: number;
  shoulder?: number;
  length?: number;
  inseam?: number;
  sleeveLength?: number;
  neckline?: number;
  fitPreference?: string;
  notes?: string;
  accuracy: number;
  createdAt: string;
}

export default function MeasurementsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    bust: '',
    waist: '',
    hip: '',
    shoulder: '',
    length: '',
    inseam: '',
    sleeveLength: '',
    neckline: '',
    fitPreference: 'regular',
    notes: '',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session?.user?.email) {
      fetchMeasurements();
    }
  }, [session, status]);

  const fetchMeasurements = async () => {
    try {
      const res = await fetch(`/api/measurements?userId=${session?.user?.email}_id`);
      const data = await res.json();
      setMeasurements(data);

      if (data.length > 0) {
        const latest = data[0];
        setFormData({
          bust: latest.bust?.toString() || '',
          waist: latest.waist?.toString() || '',
          hip: latest.hip?.toString() || '',
          shoulder: latest.shoulder?.toString() || '',
          length: latest.length?.toString() || '',
          inseam: latest.inseam?.toString() || '',
          sleeveLength: latest.sleeveLength?.toString() || '',
          neckline: latest.neckline?.toString() || '',
          fitPreference: latest.fitPreference || 'regular',
          notes: latest.notes || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch measurements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session?.user?.email + '_id',
          bust: formData.bust ? parseFloat(formData.bust) : null,
          waist: formData.waist ? parseFloat(formData.waist) : null,
          hip: formData.hip ? parseFloat(formData.hip) : null,
          shoulder: formData.shoulder ? parseFloat(formData.shoulder) : null,
          length: formData.length ? parseFloat(formData.length) : null,
          inseam: formData.inseam ? parseFloat(formData.inseam) : null,
          sleeveLength: formData.sleeveLength ? parseFloat(formData.sleeveLength) : null,
          neckline: formData.neckline ? parseFloat(formData.neckline) : null,
          fitPreference: formData.fitPreference,
          notes: formData.notes,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: session?.user?.email + '_founder',
            type: 'measurement_uploaded',
            title: 'Customer Measurement Recorded',
            message: `${session?.user?.name || 'Customer'} submitted measurements with ${data.accuracy || 0}% accuracy`,
            relatedId: data.id,
          }),
        }).catch(err => console.error('Failed to create notification:', err));

        await fetchMeasurements();
        showSuccessToast('Measurements Saved', 'Your measurements have been recorded successfully!');
      }
    } catch (error) {
      console.error('Failed to save measurements:', error);
      showErrorToast('Error', 'Failed to save measurements');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="label-sm">Loading Measurements</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <header className="border-b border-[rgba(27,42,91,0.08)] bg-white">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <a href="/" className="text-lg font-medium tracking-[0.15em] uppercase text-[#1B2A5B]">AWULA K</a>
              <span className="text-sm text-[#8B7569]">/</span>
              <span className="text-base text-[#1B2A5B]">Measurements</span>
            </div>
            <a href="/customer/dashboard" className="btn-outline text-sm py-1.5 px-4">Dashboard</a>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 lg:px-10 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
            <div className="card p-6 shadow-soft">
              <p className="label-accent mb-1">Body Measurements</p>
              <h2 className="text-2xl heading-lg mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Inches</h2>
              <hr className="divider mb-5" />

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { key: 'bust', placeholder: '36' },
                  { key: 'waist', placeholder: '28' },
                  { key: 'hip', placeholder: '38' },
                  { key: 'shoulder', placeholder: '16' },
                  { key: 'sleeveLength', label: 'Sleeve', placeholder: '32' },
                  { key: 'inseam', placeholder: '28' },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="input-label">
                      {field.label || field.key}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={(formData as any)[field.key]}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      className="input-field"
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-6 shadow-soft">
              <p className="label-accent mb-1">Fit Preferences</p>
              <h2 className="text-2xl heading-lg mb-5" style={{ fontFamily: 'var(--font-heading)' }}>Your Style</h2>

              <div className="mb-5">
                <label className="input-label mb-2">Preferred Fit</label>
                <div className="flex gap-4">
                  {['slim', 'regular', 'relaxed'].map((fit) => (
                    <label key={fit} className="flex items-center gap-2 cursor-pointer text-base">
                      <input
                        type="radio"
                        name="fit"
                        value={fit}
                        checked={formData.fitPreference === fit}
                        onChange={(e) => setFormData({ ...formData, fitPreference: e.target.value })}
                        className="w-4 h-4"
                      />
                      <span className="capitalize font-medium text-[#1B2A5B]">{fit}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="input-label">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input-field resize-none"
                  placeholder="Fitting concerns, body shape notes, or preferences..."
                  rows={4}
                />
              </div>
            </div>

            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? 'Saving...' : 'Save Measurements'}
            </button>
          </form>

          {/* Sidebar */}
          <div className="space-y-4 animate-fade-in">
            {measurements.length > 0 && (
              <div className="card p-6 shadow-soft">
                <h3 className="text-base font-medium tracking-[0.06em] uppercase text-[#1B2A5B] mb-3" style={{ fontFamily: 'var(--font-heading)' }}>Fit Confidence</h3>
                <p className="text-5xl font-normal tracking-wide" style={{
                  fontFamily: 'var(--font-heading)',
                  color: measurements[0].accuracy >= 80 ? '#228B22' : measurements[0].accuracy >= 60 ? '#1B2A5B' : '#C41E3A'
                }}>
                  {measurements[0].accuracy}%
                </p>
                <p className="text-base text-[#5C3D2E] mt-2">
                  {measurements[0].accuracy >= 80 ? 'Perfect for custom orders' :
                   measurements[0].accuracy >= 60 ? 'Good fit potential' :
                   measurements[0].accuracy >= 40 ? 'Additional details recommended' :
                   'Complete all measurements for best results'}
                </p>
              </div>
            )}

            <div className="card p-6 shadow-soft">
              <h3 className="text-base font-medium tracking-[0.06em] uppercase text-[#1B2A5B] mb-3" style={{ fontFamily: 'var(--font-heading)' }}>History</h3>
              <div className="space-y-3">
                {measurements.map((m, idx) => (
                  <div key={m.id} className={`pb-3 ${idx < measurements.length - 1 ? 'border-b border-[rgba(27,42,91,0.06)]' : ''}`}>
                    <p className="text-base font-medium text-[#1B2A5B]">
                      {idx === 0 ? 'Latest' : `${idx} month${idx > 1 ? 's' : ''} ago`}
                    </p>
                    <p className="text-sm text-[#8B7569] mt-0.5">
                      {m.bust}&quot;-{m.waist}&quot;-{m.hip}&quot;
                    </p>
                    <p className="text-sm text-[#8B7569] mt-0.5">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-[4px] bg-[#1B2A5B] text-white">
              <p className="text-sm font-medium tracking-[0.09em] uppercase text-white/60 mb-3">How to Measure</p>
              <ul className="text-base space-y-1.5 text-white/85">
                <li><strong>Bust:</strong> Around the fullest part</li>
                <li><strong>Waist:</strong> At your natural waist</li>
                <li><strong>Hip:</strong> Around the fullest part of hips</li>
                <li><strong>Shoulder:</strong> Seam to seam across back</li>
                <li><strong>Sleeve:</strong> From shoulder to wrist</li>
                <li><strong>Inseam:</strong> Inner leg seam length</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
