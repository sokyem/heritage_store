'use client';

import { useEffect, useState } from 'react';
import { showSuccessToast, showErrorToast } from '@/components/Toast';
import { DEFAULT_ABOUT_DESIGNER, type AboutDesignerContent } from '@/lib/site-content-defaults';
import { HeroContentSection } from './hero';
import { MatchdayFeatureSection } from './matchday-feature';

const KEY = 'about_designer';

export default function SiteContentAdminPage() {
  const [content, setContent] = useState<AboutDesignerContent>(DEFAULT_ABOUT_DESIGNER);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/site-content/${KEY}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.value) {
          setContent({ ...DEFAULT_ABOUT_DESIGNER, ...(data.value as Partial<AboutDesignerContent>) });
          setUpdatedAt(data.updatedAt ?? null);
        }
      })
      .catch(() => {
        /* fall back to defaults */
      })
      .finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof AboutDesignerContent>(key: K, value: AboutDesignerContent[K]) {
    setContent((prev) => ({ ...prev, [key]: value }));
  }

  function setParagraph(index: number, value: string) {
    setContent((prev) => {
      const next = [...prev.paragraphs];
      next[index] = value;
      return { ...prev, paragraphs: next };
    });
  }

  function addParagraph() {
    setContent((prev) => ({ ...prev, paragraphs: [...prev.paragraphs, ''] }));
  }

  function removeParagraph(index: number) {
    setContent((prev) => ({
      ...prev,
      paragraphs: prev.paragraphs.filter((_, i) => i !== index),
    }));
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'site-content');
      fd.append('type', 'image');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setField('imageUrl', data.url);
      showSuccessToast('Uploaded', 'New designer image is ready. Click Save to publish.');
    } catch (err: any) {
      showErrorToast('Upload failed', err?.message || 'Could not upload image.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/site-content/${KEY}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      setUpdatedAt(data.updatedAt ?? new Date().toISOString());
      showSuccessToast('Saved', 'About the Designer is now live on the homepage.');
    } catch (err: any) {
      showErrorToast('Save failed', err?.message || 'Could not save content.');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (confirm('Reset to default content? This will overwrite your edits in the form (not saved until you click Save).')) {
      setContent(DEFAULT_ABOUT_DESIGNER);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-[color:var(--aw-text-muted)]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <header className="mb-12">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-[color:var(--aw-danger)] mb-2">Site Content Management</p>
        <h1 style={{ fontFamily: 'var(--font-heading)' }} className="text-3xl md:text-4xl text-[color:var(--aw-text-strong)] mb-2">
          Homepage Editor
        </h1>
        <p className="text-sm text-[color:var(--aw-text-muted)]">
          Manage hero videos, animations, and other dynamic homepage content. All changes go live immediately after saving.
        </p>
      </header>

      {/* ── Hero Video Section ─────────────────────────── */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-[color:var(--aw-text-strong)] mb-4">Hero Animation</h2>
        <HeroContentSection />
      </section>

      {/* ── Matchday / Jerseys Feature Card ────────────── */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-[color:var(--aw-text-strong)] mb-4">Matchday Feature Card</h2>
        <MatchdayFeatureSection />
      </section>

      {/* ── About the Designer Section ─────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-[color:var(--aw-text-strong)] mb-4">About the Designer</h2>

        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* ── Form ─────────────────────────────────────── */}
          <div className="bg-white rounded-lg border border-[color:var(--aw-border)] p-6 space-y-5">
          <Field label="Eyebrow (small label above title)">
            <input
              type="text"
              value={content.eyebrow}
              onChange={(e) => setField('eyebrow', e.target.value)}
              className="form-input"
              maxLength={80}
            />
          </Field>

          <Field label="Title">
            <input
              type="text"
              value={content.title}
              onChange={(e) => setField('title', e.target.value)}
              className="form-input"
              maxLength={140}
            />
          </Field>

          <Field label="Body paragraphs">
            <div className="space-y-3">
              {content.paragraphs.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <textarea
                    value={p}
                    onChange={(e) => setParagraph(i, e.target.value)}
                    rows={4}
                    className="form-input flex-1"
                    placeholder={`Paragraph ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeParagraph(i)}
                    className="px-3 self-start text-xs text-[color:var(--aw-danger)] hover:underline"
                    title="Remove"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addParagraph}
                className="text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-strong)] hover:text-[color:var(--aw-danger)]"
              >
                + Add Paragraph
              </button>
            </div>
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Primary CTA label">
              <input
                type="text"
                value={content.ctaPrimaryLabel}
                onChange={(e) => setField('ctaPrimaryLabel', e.target.value)}
                className="form-input"
              />
            </Field>
            <Field label="Primary CTA link (URL or path)">
              <input
                type="text"
                value={content.ctaPrimaryHref}
                onChange={(e) => setField('ctaPrimaryHref', e.target.value)}
                className="form-input"
              />
            </Field>
            <Field label="Secondary CTA label">
              <input
                type="text"
                value={content.ctaSecondaryLabel}
                onChange={(e) => setField('ctaSecondaryLabel', e.target.value)}
                className="form-input"
              />
            </Field>
            <Field label="Secondary CTA link (URL or path)">
              <input
                type="text"
                value={content.ctaSecondaryHref}
                onChange={(e) => setField('ctaSecondaryHref', e.target.value)}
                className="form-input"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-3 pt-3 border-t border-[color:var(--aw-border)]">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary px-6 py-2.5 text-sm"
            >
              {saving ? 'Saving…' : 'Save & Publish'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="btn-outline px-6 py-2.5 text-sm"
            >
              Reset to Default
            </button>
            <a
              href="/#about"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] self-center"
            >
              Preview on site →
            </a>
          </div>
        </div>

        {/* ── Image + alt ─────────────────────────────── */}
        <div className="bg-white rounded-lg border border-[color:var(--aw-border)] p-6 space-y-4 self-start">
          <h2 className="text-sm font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-strong)]">Designer Portrait</h2>

          <div className="aspect-square rounded-lg overflow-hidden bg-[color:var(--aw-bg)] border border-[color:var(--aw-border)]">
            {content.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={content.imageUrl} alt={content.imageAlt} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-[color:var(--aw-text-muted)]">No image</div>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-2 block">
              Upload new image
            </span>
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageUpload(f);
              }}
              className="block w-full text-xs text-[color:var(--aw-text-strong)] file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-[color:var(--aw-navy)] file:text-white file:text-xs file:font-semibold hover:file:bg-[#2D4A8C] disabled:opacity-50"
            />
            {uploading && <p className="text-xs text-[color:var(--aw-text-muted)] mt-2">Uploading…</p>}
          </label>

          <Field label="Image URL (or paste a path)">
            <input
              type="text"
              value={content.imageUrl}
              onChange={(e) => setField('imageUrl', e.target.value)}
              className="form-input text-xs"
            />
          </Field>

          <Field label="Alt text (accessibility)">
            <input
              type="text"
              value={content.imageAlt}
              onChange={(e) => setField('imageAlt', e.target.value)}
              className="form-input text-xs"
            />
          </Field>
        </div>
      </div>

      {/* ── About the Designer Info ────────────────────── */}
      {updatedAt && (
        <div className="mt-4 p-4 bg-[#F0FDF4] border border-[#DCFCE7] rounded-lg text-xs text-[#166534]">
          About the Designer last updated: {new Date(updatedAt).toLocaleString()}
        </div>
      )}
      </section>

      <style jsx>{`
        :global(.form-input) {
          width: 100%;
          padding: 0.625rem 0.875rem;
          border: 1px solid #f0ebe3;
          border-radius: 6px;
          font-size: 0.875rem;
          color: #2c1a11;
          background: #faf7f2;
          transition: border-color 0.2s;
        }
        :global(.form-input:focus) {
          outline: none;
          border-color: #1b2a5b;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}
