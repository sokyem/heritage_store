'use client';

import { useEffect, useState } from 'react';

interface ThemeSettings {
  logoUrl: string;
  faviconUrl: string;
  brandPrimary: string;
  brandSecondary: string;
  brandAccent: string;
  background: string;
  surface: string;
  textPrimary: string;
  textMuted: string;
  border: string;
  fontHeading: string;
  fontBody: string;
  radius: string;
  buttonStyle: 'square' | 'rounded' | 'pill';
  customCss: string;
}

const FALLBACK: ThemeSettings = {
  logoUrl: '',
  faviconUrl: '',
  brandPrimary: '#1B2A5B',
  brandSecondary: '#8F6F1A',
  brandAccent: '#8B7569',
  background: '#FAF7F2',
  surface: '#FFFFFF',
  textPrimary: '#2C1A11',
  textMuted: '#5C3D2E',
  border: '#E7E1D8',
  fontHeading: 'Playfair Display',
  fontBody: 'DM Sans',
  radius: '6px',
  buttonStyle: 'square',
  customCss: '',
};

const FONT_PRESETS = [
  'Playfair Display',
  'Cormorant Garamond',
  'Cormorant',
  'Libre Caslon Text',
  'EB Garamond',
  'DM Sans',
  'Inter',
  'Manrope',
  'Poppins',
  'Lato',
];

const COLOR_FIELDS: { key: keyof ThemeSettings; label: string; help: string }[] = [
  { key: 'brandPrimary', label: 'Brand Primary', help: 'Main brand color (navy)' },
  { key: 'brandSecondary', label: 'Brand Secondary', help: 'Accent / CTA color (deep gold — keep dark enough for white button text)' },
  { key: 'brandAccent', label: 'Brand Accent', help: 'Tertiary highlight' },
  { key: 'background', label: 'Page Background', help: 'Ivory / off-white canvas' },
  { key: 'surface', label: 'Card Surface', help: 'Cards, modals, drawers' },
  { key: 'textPrimary', label: 'Primary Text', help: 'Headings & body copy' },
  { key: 'textMuted', label: 'Muted Text', help: 'Subtitles & secondary text' },
  { key: 'border', label: 'Border Color', help: 'Divider lines' },
];

export default function ThemePage() {
  const [t, setT] = useState<ThemeSettings>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string; issues?: { path: string; message: string }[] } | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings/theme')
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => null);
          throw new Error(err?.error || `Theme settings failed to load (${r.status})`);
        }
        return r.json();
      })
      .then((d) => setT({ ...FALLBACK, ...(d?.value ?? d) }))
      .catch((err) => {
        setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed to load theme settings.' });
      })
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof ThemeSettings>(k: K, v: ThemeSettings[K]) {
    setT((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/settings/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(t),
      });
      const body = await res.json();
      if (!res.ok) {
        setMsg({
          type: 'err',
          text: body.error || 'Failed to save',
          issues: body.issues?.map((i: { path: (string | number)[]; message: string }) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        });
      } else {
        setMsg({ type: 'ok', text: 'Theme saved. Reload the storefront to see changes.' });
      }
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (confirm('Reset theme to AWULA K defaults? This will not save until you click Save.')) {
      setT(FALLBACK);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-[var(--aw-text-light)]">Loading theme…</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--aw-navy)' }}>
            Theme & Branding
          </h1>
          <p className="text-sm text-[var(--aw-text-light)] mt-1">
            Colors, fonts, logo, favicon, and custom CSS — applied site-wide. No deployment required.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="px-4 py-2 border border-[var(--aw-border-strong)] text-sm hover:bg-[var(--aw-cream)]"
          >
            Reset to defaults
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-[var(--aw-navy)] text-white text-sm font-medium disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save theme'}
          </button>
        </div>
      </header>

      {msg && (
        <div
          className={`p-3 text-sm border-l-4 ${
            msg.type === 'ok'
              ? 'bg-green-50 border-green-600 text-green-900'
              : 'bg-red-50 border-red-600 text-red-900'
          }`}
        >
          <div>{msg.text}</div>
          {msg.issues && msg.issues.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs">
              {msg.issues.map((i, idx) => (
                <li key={idx}>
                  <strong>{i.path}:</strong> {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left: form ───────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-8">
          {/* Brand assets */}
          <section className="bg-white border border-[var(--aw-border-strong)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--aw-navy)] mb-4">
              Brand Assets
            </h2>
            <div className="space-y-4">
              <Field label="Logo URL" hint="Public URL or /uploaded path (e.g. /media/logo.png)">
                <input
                  type="text"
                  value={t.logoUrl}
                  onChange={(e) => set('logoUrl', e.target.value)}
                  className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
                  placeholder="/media/logo.png"
                />
              </Field>
              <Field label="Favicon URL" hint="32×32 .ico, .png or .svg">
                <input
                  type="text"
                  value={t.faviconUrl}
                  onChange={(e) => set('faviconUrl', e.target.value)}
                  className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
                  placeholder="/favicon.ico"
                />
              </Field>
            </div>
          </section>

          {/* Colors */}
          <section className="bg-white border border-[var(--aw-border-strong)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--aw-navy)] mb-4">
              Colors
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {COLOR_FIELDS.map((c) => (
                <Field key={c.key} label={c.label} hint={c.help}>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={t[c.key] as string}
                      onChange={(e) => set(c.key, e.target.value as never)}
                      className="h-10 w-14 border border-[var(--aw-border-strong)] p-0"
                    />
                    <input
                      type="text"
                      value={t[c.key] as string}
                      onChange={(e) => set(c.key, e.target.value as never)}
                      className="flex-1 border border-[var(--aw-border-strong)] px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </Field>
              ))}
            </div>
          </section>

          {/* Typography */}
          <section className="bg-white border border-[var(--aw-border-strong)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--aw-navy)] mb-4">
              Typography
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Heading font" hint="Used for h1–h6 and brand wordmarks">
                <select
                  value={t.fontHeading}
                  onChange={(e) => set('fontHeading', e.target.value)}
                  className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
                >
                  {FONT_PRESETS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Body font" hint="Default text font">
                <select
                  value={t.fontBody}
                  onChange={(e) => set('fontBody', e.target.value)}
                  className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
                >
                  {FONT_PRESETS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-xs text-[var(--aw-text-light)] mt-3">
              Fonts must be loaded via Google Fonts in the layout or self-hosted. Current bundled fonts: Playfair Display, DM Sans.
            </p>
          </section>

          {/* Shapes */}
          <section className="bg-white border border-[var(--aw-border-strong)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--aw-navy)] mb-4">
              Shapes & Buttons
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Base radius" hint="Card / input corner radius (e.g. 0px, 6px, 12px)">
                <input
                  type="text"
                  value={t.radius}
                  onChange={(e) => set('radius', e.target.value)}
                  className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Button style" hint="Square, rounded, or fully pill-shaped">
                <select
                  value={t.buttonStyle}
                  onChange={(e) => set('buttonStyle', e.target.value as ThemeSettings['buttonStyle'])}
                  className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
                >
                  <option value="square">Square (0px)</option>
                  <option value="rounded">Rounded (12px)</option>
                  <option value="pill">Pill (full)</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Custom CSS */}
          <section className="bg-white border border-[var(--aw-border-strong)] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--aw-navy)] mb-2">
              Custom CSS
            </h2>
            <p className="text-xs text-[var(--aw-text-light)] mb-3">
              Advanced. Injected into every page after the theme variables. Use with care — invalid CSS can break the site.
            </p>
            <textarea
              value={t.customCss}
              onChange={(e) => set('customCss', e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-xs font-mono"
              placeholder="/* e.g. */&#10;.hero-banner { letter-spacing: 0.4em; }"
            />
          </section>
        </div>

        {/* ── Right: live preview ─────────────────────────────── */}
        <aside className="lg:col-span-1">
          <div className="sticky top-6 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--aw-navy)]">
              Live Preview
            </h2>
            <ThemePreview t={t} />
            <p className="text-xs text-[var(--aw-text-light)]">
              This preview uses inline styles. Click <strong>Save theme</strong> and refresh the storefront to see the live site update.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--aw-text)] mb-1 block">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-[var(--aw-text-light)] mt-1 block">{hint}</span>}
    </label>
  );
}

function ThemePreview({ t }: { t: ThemeSettings }) {
  const btnRadius = t.buttonStyle === 'pill' ? 9999 : t.buttonStyle === 'rounded' ? 12 : 0;
  return (
    <div
      style={{
        background: t.background,
        color: t.textPrimary,
        border: `1px solid ${t.border}`,
        fontFamily: t.fontBody,
      }}
      className="overflow-hidden"
    >
      <div
        style={{ background: t.brandPrimary, color: '#fff', padding: '14px 16px' }}
        className="flex items-center justify-between"
      >
        {t.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.logoUrl} alt="Logo" style={{ height: 28, width: 'auto' }} />
        ) : (
          <span style={{ fontFamily: t.fontHeading, fontWeight: 600, letterSpacing: '0.18em' }}>
            AWULA K
          </span>
        )}
        <span style={{ fontSize: 11, opacity: 0.7 }}>Cart · 0</span>
      </div>

      <div style={{ padding: 20 }}>
        <h3
          style={{
            fontFamily: t.fontHeading,
            fontSize: 22,
            color: t.textPrimary,
            margin: '0 0 6px',
            letterSpacing: '0.02em',
          }}
        >
          New Collection
        </h3>
        <p style={{ fontSize: 13, color: t.textMuted, margin: '0 0 14px' }}>
          Bespoke African couture, handcrafted to your measurements.
        </p>

        <div
          style={{
            background: t.surface,
            border: `1px solid ${t.border}`,
            borderRadius: parseInt(t.radius) || 0,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              height: 80,
              background: `linear-gradient(135deg, ${t.brandPrimary}, ${t.brandSecondary})`,
              marginBottom: 8,
            }}
          />
          <div style={{ fontFamily: t.fontHeading, fontSize: 14, fontWeight: 500 }}>
            Ankara Maxi Dress
          </div>
          <div style={{ fontSize: 12, color: t.brandSecondary, fontWeight: 600 }}>$285</div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{
              background: t.brandPrimary,
              color: '#fff',
              padding: '10px 16px',
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              borderRadius: btnRadius,
              border: 'none',
              fontFamily: t.fontBody,
            }}
          >
            Shop now
          </button>
          <button
            style={{
              background: 'transparent',
              color: t.brandSecondary,
              border: `1px solid ${t.brandSecondary}`,
              padding: '10px 16px',
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              borderRadius: btnRadius,
              fontFamily: t.fontBody,
            }}
          >
            Book
          </button>
        </div>
      </div>
    </div>
  );
}
