'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Pickup {
  confirmationNumber: string;
  pickupDate: string;
  packageCount: number;
  estimatedWeight: number;
  packageType: string;
  packageLocation: string;
  notificationEmail?: string;
  createdAt: string;
}

interface ApiResp {
  pickups: Pickup[];
  configured: boolean;
  eligibility: { eligible: boolean; reason?: string };
}

const PACKAGE_TYPES = ['USPS_GROUND_ADVANTAGE', 'PRIORITY_MAIL', 'PRIORITY_MAIL_EXPRESS', 'RETURNS', 'INTERNATIONAL', 'OTHER'];
const LOCATIONS = ['FRONT_DOOR', 'BACK_DOOR', 'SIDE_DOOR', 'KNOCK_ON_DOOR', 'MAIL_ROOM', 'OFFICE', 'PORCH', 'RECEPTION', 'MAILBOX', 'OTHER'];

export default function CarrierPickupPage() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [form, setForm] = useState({
    pickupDate: tomorrow,
    packageType: 'USPS_GROUND_ADVANTAGE',
    packageCount: '1',
    estimatedWeight: '5',
    packageLocation: 'FRONT_DOOR',
    specialInstructions: '',
    dogPresent: false,
    notificationEmail: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/shipping/pickup');
      const j = await r.json();
      setData(j);
    } catch {
      setData({ pickups: [], configured: false, eligibility: { eligible: false, reason: 'load failed' } });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleSchedule = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/shipping/pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupDate: form.pickupDate,
          packages: [{ packageType: form.packageType, packageCount: parseInt(form.packageCount, 10) || 1 }],
          estimatedWeight: parseFloat(form.estimatedWeight) || 1,
          packageLocation: form.packageLocation,
          specialInstructions: form.specialInstructions || undefined,
          dogPresent: form.dogPresent,
          notificationEmail: form.notificationEmail || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || 'Failed to schedule');
      } else {
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (confirmationNumber: string) => {
    if (!confirm(`Cancel pickup ${confirmationNumber}?`)) return;
    try {
      const res = await fetch(`/api/admin/shipping/pickup?confirmationNumber=${encodeURIComponent(confirmationNumber)}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || 'Cancel failed');
        return;
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Cancel failed');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin h-8 w-8 border-2 border-[#C41E3A] border-t-transparent rounded-full" /></div>;
  }

  const inp = 'w-full px-3 py-2.5 border border-[#E8E3DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C41E3A]/20';
  const lbl = 'block text-xs font-semibold text-[color:var(--aw-text-strong)] mb-1.5 uppercase tracking-wider';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--aw-text-strong)]">USPS Carrier Pickup</h1>
          <p className="text-sm text-[color:var(--aw-text-muted)] mt-1">Schedule a free USPS pickup at your studio. Mon–Sat; same-day cutoff is 2:00 AM CT.</p>
        </div>
        <Link href="/admin/shipping" className="text-sm text-[#3B82F6] hover:underline">← Back to Shipping</Link>
      </div>

      {!data?.configured && (
        <div className="rounded-lg p-4 bg-[#FFFBEB] border border-[#FDE68A] text-[color:var(--aw-warning)] text-sm">
          USPS is not fully configured. Set <code>USPS_CLIENT_ID</code>, <code>USPS_CLIENT_SECRET</code>, and your <code>USPS_SHIPPER_*</code> env vars to enable carrier pickup.
        </div>
      )}

      {data?.configured && data.eligibility && !data.eligibility.eligible && (
        <div className="rounded-lg p-4 bg-[#FEF2F2] border border-[#FECACA] text-[color:var(--aw-danger)] text-sm">
          <p className="font-semibold">Carrier pickup not available at your address.</p>
          {data.eligibility.reason && <p className="mt-1 text-xs">{data.eligibility.reason}</p>}
        </div>
      )}

      {/* Scheduled pickups */}
      <div className="bg-white rounded-xl border border-[#E8E3DB] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8E3DB]">
          <h2 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider">Active pickups</h2>
        </div>
        {data?.pickups.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[color:var(--aw-text-muted)]">No active pickups scheduled.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--aw-bg)] text-[10px] tracking-wider uppercase text-[color:var(--aw-text-muted)]">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Confirmation</th>
                <th className="text-left px-5 py-3 font-semibold">Date</th>
                <th className="text-left px-5 py-3 font-semibold">Service</th>
                <th className="text-left px-5 py-3 font-semibold">Packages</th>
                <th className="text-left px-5 py-3 font-semibold">Weight</th>
                <th className="text-left px-5 py-3 font-semibold">Location</th>
                <th className="text-right px-5 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {data?.pickups.map((p) => (
                <tr key={p.confirmationNumber} className="border-t border-[color:var(--aw-border)]">
                  <td className="px-5 py-3 font-mono text-xs">{p.confirmationNumber}</td>
                  <td className="px-5 py-3">{p.pickupDate}</td>
                  <td className="px-5 py-3 text-xs">{p.packageType.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-3">{p.packageCount}</td>
                  <td className="px-5 py-3">{p.estimatedWeight} lb</td>
                  <td className="px-5 py-3 text-xs">{p.packageLocation.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleCancel(p.confirmationNumber)} className="text-xs text-[color:var(--aw-danger)] hover:underline">Cancel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Schedule form */}
      <div className="bg-white rounded-xl border border-[#E8E3DB] p-6">
        <h2 className="text-sm font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wider mb-4">Schedule new pickup</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Pickup Date</label>
            <input type="date" value={form.pickupDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => setForm({ ...form, pickupDate: e.target.value })} className={inp} />
          </div>
          <div>
            <label className={lbl}>Estimated weight (lbs total)</label>
            <input type="number" min="0.1" step="0.1" value={form.estimatedWeight} onChange={(e) => setForm({ ...form, estimatedWeight: e.target.value })} className={inp} />
          </div>
          <div>
            <label className={lbl}>Service class</label>
            <select value={form.packageType} onChange={(e) => setForm({ ...form, packageType: e.target.value })} className={inp}>
              {PACKAGE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Number of packages</label>
            <input type="number" min="1" step="1" value={form.packageCount} onChange={(e) => setForm({ ...form, packageCount: e.target.value })} className={inp} />
          </div>
          <div>
            <label className={lbl}>Where to find packages</label>
            <select value={form.packageLocation} onChange={(e) => setForm({ ...form, packageLocation: e.target.value })} className={inp}>
              {LOCATIONS.map((l) => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Notification email (optional)</label>
            <input type="email" value={form.notificationEmail} onChange={(e) => setForm({ ...form, notificationEmail: e.target.value })} className={inp} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Special instructions (required if location is OTHER)</label>
            <textarea rows={2} value={form.specialInstructions} onChange={(e) => setForm({ ...form, specialInstructions: e.target.value })} className={`${inp} resize-none`} />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="dog" checked={form.dogPresent} onChange={(e) => setForm({ ...form, dogPresent: e.target.checked })} className="accent-[#C41E3A]" />
            <label htmlFor="dog" className="text-sm text-[color:var(--aw-text-muted)]">Dog present at pickup location</label>
          </div>
        </div>

        {error && <div className="mt-4 rounded-lg p-3 bg-[#FEF2F2] border border-[#FECACA] text-[color:var(--aw-danger)] text-sm">{error}</div>}

        <div className="flex justify-end mt-5">
          <button
            onClick={handleSchedule}
            disabled={submitting || !data?.configured}
            className="px-5 py-2.5 rounded-lg bg-[color:var(--aw-danger)] text-white text-sm font-semibold hover:bg-[#A31830] disabled:opacity-40"
          >
            {submitting ? 'Scheduling…' : 'Schedule Pickup'}
          </button>
        </div>
      </div>
    </div>
  );
}
