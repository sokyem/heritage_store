'use client';

import { useEffect, useState } from 'react';

/* ══════════════════════════════════════════════════════════
   Settings Sections — backed by /api/admin/settings
   ══════════════════════════════════════════════════════════ */

type Section = 'general' | 'business' | 'scheduling' | 'notifications' | 'integrations' | 'shipper';

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: 'general', label: 'General', icon: '⚙️' },
  { key: 'business', label: 'Business Info', icon: '🏪' },
  { key: 'scheduling', label: 'Scheduling', icon: '📅' },
  { key: 'notifications', label: 'Notifications', icon: '🔔' },
  { key: 'integrations', label: 'Integrations', icon: '🔗' },
  { key: 'shipper', label: 'Shipping Origin', icon: '📦' },
];

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface GeneralSettings {
  siteName: string;
  tagline: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  language: string;
}
interface BusinessSettings {
  businessName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  taxRate: number;
  depositPercent: number;
}
interface SchedulingSettings {
  consultationDuration: number;
  fittingDuration: number;
  bufferTime: number;
  maxBookingsPerSlot: number;
  workDays: string[];
  workStart: string;
  workEnd: string;
  autoConfirm: boolean;
  reminderHoursBefore: number;
  consultationPrice: number;
  firstConsultationFree: boolean;
}
interface NotificationSettings {
  emailOrderConfirm: boolean;
  emailPaymentReceived: boolean;
  emailConsultationReminder: boolean;
  emailFittingReminder: boolean;
  lowStockAlert: boolean;
  lowStockThreshold: number;
  dailyDigest: boolean;
}
interface IntegrationSettings {
  stripeEnabled: boolean;
  stripePublishableKey: string;
  paypalEnabled: boolean;
  paypalClientId: string;
  googleCalendarEnabled: boolean;
  googleCalendarId: string;
  instagramEnabled: boolean;
  instagramHandle: string;
}
interface ShipperAddressSettings {
  name: string;
  attentionName: string;
  firstName: string;
  lastName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  absorbShippingCost: boolean;
}

interface AllSettings {
  general: GeneralSettings;
  business: BusinessSettings;
  scheduling: SchedulingSettings;
  notifications: NotificationSettings;
  integrations: IntegrationSettings;
  shipper: ShipperAddressSettings;
}

const FALLBACK_SETTINGS: AllSettings = {
  general: { siteName: 'AWULA K', tagline: '', currency: 'USD', timezone: 'America/New_York', dateFormat: 'MM/DD/YYYY', language: 'en' },
  business: { businessName: 'AWULA K Luxury Fashion', email: 'info@awulak.com', phone: '', address: '', city: '', state: '', zip: '', country: 'US', taxRate: 0, depositPercent: 50 },
  scheduling: { consultationDuration: 30, fittingDuration: 45, bufferTime: 15, maxBookingsPerSlot: 1, workDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], workStart: '09:00', workEnd: '18:00', autoConfirm: false, reminderHoursBefore: 24, consultationPrice: 40, firstConsultationFree: true },
  notifications: { emailOrderConfirm: true, emailPaymentReceived: true, emailConsultationReminder: true, emailFittingReminder: true, lowStockAlert: true, lowStockThreshold: 5, dailyDigest: false },
  integrations: { stripeEnabled: true, stripePublishableKey: '', paypalEnabled: false, paypalClientId: '', googleCalendarEnabled: false, googleCalendarId: '', instagramEnabled: false, instagramHandle: '' },
  shipper: { name: 'AWULA K', attentionName: 'AWULA K Studio', firstName: '', lastName: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', zip: '', country: 'US', absorbShippingCost: true },
};

export default function SettingsPage() {
  const [section, setSection] = useState<Section>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [settings, setSettings] = useState<AllSettings>(FALLBACK_SETTINGS);
  // Test-email diagnostic state — drives the panel at the bottom of the Notifications tab.
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/settings')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (!cancelled && data?.settings) setSettings({ ...FALLBACK_SETTINGS, ...data.settings });
      })
      .catch(() => {
        if (!cancelled) setStatus({ type: 'err', msg: 'Could not load settings — showing defaults.' });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function patch<K extends Section>(key: K, partial: Partial<AllSettings[K]>) {
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], ...partial } }));
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/settings/${section}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: settings[section] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const issues = Array.isArray(data?.issues)
          ? data.issues.map((i: any) => `${i.path?.join('.') || 'field'}: ${i.message}`).join('; ')
          : null;
        throw new Error(issues || data?.error || 'Save failed');
      }
      if (data?.value) setSettings((prev) => ({ ...prev, [section]: { ...prev[section], ...data.value } }));
      setStatus({ type: 'ok', msg: 'Saved.' });
      setTimeout(() => setStatus(null), 2500);
    } catch (e: any) {
      setStatus({ type: 'err', msg: e?.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  const { general, business, scheduling, notifications, integrations, shipper } = settings;

  return (
    <div className="p-8 lg:p-10 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Settings</h1>
        <p className="text-base text-[color:var(--aw-text-muted)]">Configure your platform — changes save to the database and apply across the site.</p>
      </div>

      <div className="flex gap-6">
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {SECTIONS.map((s) => (
              <button key={s.key} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${section === s.key ? 'bg-[color:var(--aw-navy)] text-white' : 'text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)] hover:text-[color:var(--aw-text-strong)]'}`} onClick={() => setSection(s.key)}>
                <span className="mr-2">{s.icon}</span>{s.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 bg-white rounded-lg border border-[color:var(--aw-border)] p-6">
          {loading && <p className="text-sm text-[color:var(--aw-text-muted)]">Loading settings…</p>}

          {!loading && section === 'general' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-4">General Settings</h2>
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Site Name</label><input className="input-field text-base py-2.5 w-full max-w-md" value={general.siteName} onChange={(e) => patch('general', { siteName: e.target.value })} /></div>
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Tagline</label><input className="input-field text-base py-2.5 w-full max-w-md" value={general.tagline} onChange={(e) => patch('general', { tagline: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Currency</label>
                  <select className="input-field text-sm py-2 w-full" value={general.currency} onChange={(e) => patch('general', { currency: e.target.value })}>
                    {['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR', 'XOF', 'XAF', 'EGP'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Timezone</label>
                  <select className="input-field text-sm py-2 w-full" value={general.timezone} onChange={(e) => patch('general', { timezone: e.target.value })}>
                    {['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Africa/Accra', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Cairo', 'Africa/Casablanca'].map((tz) => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Date Format</label>
                  <select className="input-field text-sm py-2 w-full" value={general.dateFormat} onChange={(e) => patch('general', { dateFormat: e.target.value })}>
                    {['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Language</label>
                  <select className="input-field text-sm py-2 w-full" value={general.language} onChange={(e) => patch('general', { language: e.target.value })}>
                    {['en', 'fr', 'es', 'pt'].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {!loading && section === 'business' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-4">Business Information</h2>
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Business Name</label><input className="input-field text-base py-2.5 w-full max-w-md" value={business.businessName} onChange={(e) => patch('business', { businessName: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Email</label><input className="input-field text-sm py-2 w-full" type="email" value={business.email} onChange={(e) => patch('business', { email: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Phone</label><input className="input-field text-sm py-2 w-full" value={business.phone} onChange={(e) => patch('business', { phone: e.target.value })} /></div>
              </div>
              <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Address</label><input className="input-field text-sm py-2 w-full max-w-md" value={business.address} onChange={(e) => patch('business', { address: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-4 max-w-md">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">City</label><input className="input-field text-sm py-2 w-full" value={business.city} onChange={(e) => patch('business', { city: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">State</label><input className="input-field text-sm py-2 w-full" value={business.state} onChange={(e) => patch('business', { state: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">ZIP</label><input className="input-field text-sm py-2 w-full" value={business.zip} onChange={(e) => patch('business', { zip: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4 max-w-md">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Country (ISO-2)</label><input className="input-field text-sm py-2 w-full uppercase" maxLength={2} value={business.country} onChange={(e) => patch('business', { country: e.target.value.toUpperCase() })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Tax Rate (%)</label><input className="input-field text-sm py-2 w-full" type="number" step="0.5" value={business.taxRate} onChange={(e) => patch('business', { taxRate: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Deposit (%)</label><input className="input-field text-sm py-2 w-full" type="number" value={business.depositPercent} onChange={(e) => patch('business', { depositPercent: parseInt(e.target.value) || 50 })} /></div>
              </div>
            </div>
          )}

          {!loading && section === 'scheduling' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-4">Scheduling Defaults</h2>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Consultation (min)</label><input className="input-field text-sm py-2 w-full" type="number" value={scheduling.consultationDuration} onChange={(e) => patch('scheduling', { consultationDuration: parseInt(e.target.value) || 30 })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Fitting (min)</label><input className="input-field text-sm py-2 w-full" type="number" value={scheduling.fittingDuration} onChange={(e) => patch('scheduling', { fittingDuration: parseInt(e.target.value) || 45 })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Buffer (min)</label><input className="input-field text-sm py-2 w-full" type="number" value={scheduling.bufferTime} onChange={(e) => patch('scheduling', { bufferTime: parseInt(e.target.value) || 15 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4 max-w-lg">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Work Starts</label><input className="input-field text-sm py-2 w-full" type="time" value={scheduling.workStart} onChange={(e) => patch('scheduling', { workStart: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Work Ends</label><input className="input-field text-sm py-2 w-full" type="time" value={scheduling.workEnd} onChange={(e) => patch('scheduling', { workEnd: e.target.value })} /></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-2">Work Days</label>
                <div className="flex gap-2 flex-wrap">
                  {ALL_DAYS.map((d) => (
                    <button key={d} type="button" className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${scheduling.workDays.includes(d) ? 'bg-[color:var(--aw-navy)] text-white border-[color:var(--aw-navy)]' : 'border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)]'}`}
                      onClick={() => patch('scheduling', { workDays: scheduling.workDays.includes(d) ? scheduling.workDays.filter((x) => x !== d) : [...scheduling.workDays, d] })}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 max-w-lg">
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Max bookings / slot</label><input className="input-field text-sm py-2 w-full" type="number" min={1} value={scheduling.maxBookingsPerSlot} onChange={(e) => patch('scheduling', { maxBookingsPerSlot: parseInt(e.target.value) || 1 })} /></div>
                <div><label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Reminder (h before)</label><input className="input-field text-sm py-2 w-full" type="number" value={scheduling.reminderHoursBefore} onChange={(e) => patch('scheduling', { reminderHoursBefore: parseInt(e.target.value) || 24 })} /></div>
              </div>
              <label className="inline-flex items-center gap-3">
                <input type="checkbox" checked={scheduling.autoConfirm} onChange={(e) => patch('scheduling', { autoConfirm: e.target.checked })} />
                <span className="text-sm text-[color:var(--aw-text-muted)]">Auto-confirm bookings</span>
              </label>

              <div className="pt-4 border-t border-[color:var(--aw-border)]">
                <h3 className="text-base font-semibold text-[color:var(--aw-text-strong)] mb-3">Consultation Pricing</h3>
                <div className="grid grid-cols-2 gap-4 max-w-lg">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Consultation price ($)</label>
                    <input
                      className="input-field text-sm py-2 w-full"
                      type="number"
                      min={0}
                      step="0.01"
                      value={scheduling.consultationPrice}
                      onChange={(e) => patch('scheduling', { consultationPrice: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <label className="inline-flex items-center gap-3 self-end pb-2">
                    <input
                      type="checkbox"
                      checked={scheduling.firstConsultationFree}
                      onChange={(e) => patch('scheduling', { firstConsultationFree: e.target.checked })}
                    />
                    <span className="text-sm text-[color:var(--aw-text-muted)]">First consultation free</span>
                  </label>
                </div>
                <p className="text-xs text-[color:var(--aw-text-muted)] mt-2">
                  Applies to new consultation bookings. Existing bookings keep their original price.
                </p>
              </div>
            </div>
          )}

          {!loading && section === 'notifications' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-4">Notification Preferences</h2>
              {([
                ['emailOrderConfirm', 'Email: Order confirmation'],
                ['emailPaymentReceived', 'Email: Payment received'],
                ['emailConsultationReminder', 'Email: Consultation reminder'],
                ['emailFittingReminder', 'Email: Fitting reminder'],
                ['lowStockAlert', 'Low stock alerts'],
                ['dailyDigest', 'Daily digest email'],
              ] as [keyof NotificationSettings, string][]).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between max-w-md">
                  <span className="text-sm text-[#2D2D2D]">{label}</span>
                  <button
                    type="button"
                    className={`w-10 h-5 rounded-full transition-colors relative ${notifications[key] ? 'bg-[#22C55E]' : 'bg-[#D1D5DB]'}`}
                    onClick={() => patch('notifications', { [key]: !notifications[key] } as Partial<NotificationSettings>)}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${notifications[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
              {notifications.lowStockAlert && (
                <div className="max-w-xs">
                  <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Low stock threshold</label>
                  <input className="input-field text-sm py-2 w-full" type="number" value={notifications.lowStockThreshold} onChange={(e) => patch('notifications', { lowStockThreshold: parseInt(e.target.value) || 5 })} />
                </div>
              )}

              <div className="mt-8 pt-5 border-t border-[color:var(--aw-border)] max-w-xl">
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-1">Test email delivery</h3>
                <p className="text-xs text-[color:var(--aw-text-muted)] mb-3">
                  Sends a one-off test email via SendGrid. Use this to confirm new-order alerts will actually reach your inbox. Leave the field blank to send to the configured admin notification address.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="(blank = admin notification address)"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                    className="input-field text-sm py-2 flex-1"
                  />
                  <button
                    type="button"
                    disabled={testEmailSending}
                    onClick={async () => {
                      setTestEmailSending(true);
                      setTestEmailResult(null);
                      try {
                        const res = await fetch('/api/admin/notifications/test-email', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(testEmailTo ? { to: testEmailTo } : {}),
                        });
                        const data = await res.json();
                        setTestEmailResult({
                          ok: data.ok === true,
                          msg: data.ok ? `Sent to ${data.sentTo} (check spam folder if it doesn't arrive within ~30 seconds)` : (data.error || 'Failed'),
                        });
                      } catch (e) {
                        setTestEmailResult({ ok: false, msg: e instanceof Error ? e.message : 'Network error' });
                      } finally {
                        setTestEmailSending(false);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-[color:var(--aw-navy)] text-white text-sm font-semibold hover:bg-[#0F1A3A] disabled:opacity-50"
                  >
                    {testEmailSending ? 'Sending…' : 'Send test'}
                  </button>
                </div>
                {testEmailResult && (
                  <div className={`mt-3 text-xs rounded-lg p-3 ${testEmailResult.ok ? 'bg-[#ECFDF5] text-[color:var(--aw-success)] border border-[#A7F3D0]' : 'bg-[#FEF2F2] text-[color:var(--aw-danger)] border border-[#FECACA]'}`}>
                    {testEmailResult.msg}
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && section === 'integrations' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-4">Integrations</h2>

              <div className="border border-[color:var(--aw-border)] rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">💳</span>
                    <div><h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)]">Stripe Payments</h3><p className="text-xs text-[color:var(--aw-text-muted)]">Accept card and digital payments</p></div>
                  </div>
                  <button type="button" className="text-xs px-3 py-1.5 rounded-lg border border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)]" onClick={() => patch('integrations', { stripeEnabled: !integrations.stripeEnabled })}>{integrations.stripeEnabled ? 'Disable' : 'Enable'}</button>
                </div>
                <input className="input-field text-sm py-2 w-full max-w-md" placeholder="Publishable key (pk_…)" value={integrations.stripePublishableKey} onChange={(e) => patch('integrations', { stripePublishableKey: e.target.value })} />
                <p className="text-xs text-[color:var(--aw-text-muted)] mt-2">Secret key remains in server env (STRIPE_SECRET_KEY).</p>
              </div>

              <div className="border border-[color:var(--aw-border)] rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🅿️</span>
                    <div><h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)]">PayPal</h3><p className="text-xs text-[color:var(--aw-text-muted)]">Accept PayPal at checkout</p></div>
                  </div>
                  <button type="button" className="text-xs px-3 py-1.5 rounded-lg border border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)]" onClick={() => patch('integrations', { paypalEnabled: !integrations.paypalEnabled })}>{integrations.paypalEnabled ? 'Disable' : 'Enable'}</button>
                </div>
                <input className="input-field text-sm py-2 w-full max-w-md" placeholder="Client ID" value={integrations.paypalClientId} onChange={(e) => patch('integrations', { paypalClientId: e.target.value })} />
              </div>

              <div className="border border-[color:var(--aw-border)] rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📅</span>
                    <div><h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)]">Google Calendar</h3><p className="text-xs text-[color:var(--aw-text-muted)]">Sync consultations and fittings</p></div>
                  </div>
                  <button type="button" className="text-xs px-3 py-1.5 rounded-lg border border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)]" onClick={() => patch('integrations', { googleCalendarEnabled: !integrations.googleCalendarEnabled })}>{integrations.googleCalendarEnabled ? 'Disable' : 'Enable'}</button>
                </div>
                <input className="input-field text-sm py-2 w-full max-w-md" placeholder="Calendar ID" value={integrations.googleCalendarId} onChange={(e) => patch('integrations', { googleCalendarId: e.target.value })} />
              </div>

              <div className="border border-[color:var(--aw-border)] rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📷</span>
                    <div><h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)]">Instagram</h3><p className="text-xs text-[color:var(--aw-text-muted)]">Link your storefront to Instagram</p></div>
                  </div>
                  <button type="button" className="text-xs px-3 py-1.5 rounded-lg border border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)]" onClick={() => patch('integrations', { instagramEnabled: !integrations.instagramEnabled })}>{integrations.instagramEnabled ? 'Disable' : 'Enable'}</button>
                </div>
                <input className="input-field text-sm py-2 w-full max-w-md" placeholder="@handle" value={integrations.instagramHandle} onChange={(e) => patch('integrations', { instagramHandle: e.target.value })} />
              </div>
            </div>
          )}

          {!loading && section === 'shipper' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)]">Shipping Origin</h2>
                <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">The address printed as the &quot;From&quot; on every label and used for USPS carrier pickup. Changes apply immediately to new shipments.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">Business / Firm Name</label>
                  <input className="input-field text-sm py-2 w-full" value={shipper.name} onChange={(e) => patch('shipper', { name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">Attention (UPS)</label>
                  <input className="input-field text-sm py-2 w-full" value={shipper.attentionName} onChange={(e) => patch('shipper', { attentionName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">First Name (USPS)</label>
                  <input className="input-field text-sm py-2 w-full" value={shipper.firstName} onChange={(e) => patch('shipper', { firstName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">Last Name (USPS)</label>
                  <input className="input-field text-sm py-2 w-full" value={shipper.lastName} onChange={(e) => patch('shipper', { lastName: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">Street Address</label>
                  <input className="input-field text-sm py-2 w-full" value={shipper.addressLine1} onChange={(e) => patch('shipper', { addressLine1: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">Address Line 2</label>
                  <input className="input-field text-sm py-2 w-full" placeholder="Apt, suite, unit (optional)" value={shipper.addressLine2} onChange={(e) => patch('shipper', { addressLine2: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">City</label>
                  <input className="input-field text-sm py-2 w-full" value={shipper.city} onChange={(e) => patch('shipper', { city: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">State</label>
                    <input className="input-field text-sm py-2 w-full" maxLength={2} placeholder="MA" value={shipper.state} onChange={(e) => patch('shipper', { state: e.target.value.toUpperCase() })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">ZIP</label>
                    <input className="input-field text-sm py-2 w-full" placeholder="01610-3597" value={shipper.zip} onChange={(e) => patch('shipper', { zip: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">Phone</label>
                  <input className="input-field text-sm py-2 w-full" placeholder="+1 555 555 5555" value={shipper.phone} onChange={(e) => patch('shipper', { phone: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[color:var(--aw-text-muted)] mb-1 uppercase tracking-wider">Country</label>
                  <input className="input-field text-sm py-2 w-full" maxLength={2} value={shipper.country} onChange={(e) => patch('shipper', { country: e.target.value.toUpperCase() })} />
                </div>
              </div>

              <div className="mt-6 border-t border-[color:var(--aw-border)] pt-5">
                <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-3">Shipping cost policy</h3>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shipper.absorbShippingCost}
                    onChange={(e) => patch('shipper', { absorbShippingCost: e.target.checked })}
                    className="mt-1 accent-[#1B2A5B]"
                  />
                  <div>
                    <p className="text-sm font-medium text-[color:var(--aw-text-strong)]">Absorb shipping cost (don&apos;t charge customers)</p>
                    <p className="text-xs text-[color:var(--aw-text-muted)] mt-0.5">
                      Checkout still fetches carrier rates so they&apos;re saved on the order (you can see what each shipment will cost you), but the customer is only charged the product price. Turn this off once your carrier account is set up to auto-buy postage and you want to pass shipping through.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {!loading && (
            <div className="flex items-center gap-3 mt-8 pt-5 border-t border-[color:var(--aw-border)]">
              <button className="btn-primary text-sm px-6 py-2.5 disabled:opacity-60" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : `Save ${SECTIONS.find((s) => s.key === section)?.label}`}
              </button>
              {status && (
                <span className={`text-sm font-medium ${status.type === 'ok' ? 'text-[color:var(--aw-success)]' : 'text-[color:var(--aw-danger)]'}`}>
                  {status.msg}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
