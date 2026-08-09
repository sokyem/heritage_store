'use client';

import { useEffect, useRef, useState } from 'react';
import { showSuccessToast, showErrorToast } from '@/components/Toast';
import { DEFAULT_MATCHDAY_FEATURE, type MatchdayFeatureContent } from '@/lib/site-content-defaults';

const KEY = 'matchday_feature';

export function MatchdayFeatureSection() {
  const [content, setContent] = useState<MatchdayFeatureContent>(DEFAULT_MATCHDAY_FEATURE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/admin/site-content/${KEY}`)
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => null);
          throw new Error(err?.error || `Failed to load matchday content (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        if (data?.value) {
          setContent({ ...DEFAULT_MATCHDAY_FEATURE, ...(data.value as Partial<MatchdayFeatureContent>) });
          setUpdatedAt(data.updatedAt ?? null);
        }
      })
      .catch((err) => {
        showErrorToast(
          'Could not load matchday content',
          err instanceof Error ? err.message : 'Unknown error',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof MatchdayFeatureContent>(key: K, value: MatchdayFeatureContent[K]) {
    setContent((prev) => ({ ...prev, [key]: value }));
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
      showSuccessToast('Saved', 'Matchday feature card is live on the homepage.');
    } catch (err: any) {
      showErrorToast('Save failed', err?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (confirm('Reset to default copy?')) setContent(DEFAULT_MATCHDAY_FEATURE);
  }

  async function handleVideoUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'site-content');
      fd.append('type', 'video');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setField('promoVideoUrl', data.url);
      showSuccessToast('Uploaded', 'New promo video ready — click Save to publish.');
    } catch (err: any) {
      showErrorToast('Upload failed', err?.message || 'Could not upload video.');
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <div className="p-4 text-sm text-[color:var(--aw-text-muted)]">Loading…</div>;

  return (
    <div className="bg-white rounded-lg border border-[color:var(--aw-border)] p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-1">Matchday / Ghana Jerseys Feature Card</h3>
        <p className="text-sm text-[color:var(--aw-text-muted)]">
          The promo block on the homepage that links to the Matchday subdomain and your TikTok shop.
          {updatedAt && (
            <span className="block text-xs text-[color:var(--aw-text-muted)] mt-1">
              Last updated: {new Date(updatedAt).toLocaleString()}
            </span>
          )}
        </p>
      </div>

      <label className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--aw-text-strong)]">
        <input
          type="checkbox"
          checked={content.enabled}
          onChange={(e) => setField('enabled', e.target.checked)}
          className="w-4 h-4"
        />
        Show this card on the homepage
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-1">Badge accent (small)</label>
          <input className="form-input w-full" maxLength={32} value={content.badgeAccent} onChange={(e) => setField('badgeAccent', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-1">Badge label</label>
          <input className="form-input w-full" maxLength={48} value={content.badge} onChange={(e) => setField('badge', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-1">Title</label>
        <input className="form-input w-full" maxLength={120} value={content.title} onChange={(e) => setField('title', e.target.value)} />
      </div>

      <div>
        <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-1">Body</label>
        <textarea className="form-input w-full" rows={3} maxLength={300} value={content.body} onChange={(e) => setField('body', e.target.value)} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-1">Primary CTA label</label>
          <input className="form-input w-full" value={content.ctaPrimaryLabel} onChange={(e) => setField('ctaPrimaryLabel', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-1">Primary CTA link</label>
          <input className="form-input w-full" value={content.ctaPrimaryHref} onChange={(e) => setField('ctaPrimaryHref', e.target.value)} placeholder="/matchday or https://matchday.awulak.com" />
        </div>
        <div>
          <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-1">Secondary CTA label</label>
          <input className="form-input w-full" value={content.ctaSecondaryLabel} onChange={(e) => setField('ctaSecondaryLabel', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-1">Secondary CTA link</label>
          <input className="form-input w-full" value={content.ctaSecondaryHref} onChange={(e) => setField('ctaSecondaryHref', e.target.value)} placeholder="https://www.tiktok.com/t/ZP9YR5dxa5uEn-IDKgJ/" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-2">
          Promo Video (homepage + matchday page)
        </label>
        {/* Preview */}
        {content.promoVideoUrl && (
          <video
            src={content.promoVideoUrl}
            muted
            loop
            autoPlay
            playsInline
            className="w-full max-h-40 rounded-lg object-cover mb-3 border border-[color:var(--aw-border)]"
          />
        )}
        <div className="flex gap-2 items-center flex-wrap">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleVideoUpload(f);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => videoInputRef.current?.click()}
            className="btn-outline text-sm px-4 py-2"
          >
            {uploading ? 'Uploading…' : '↑ Upload new video'}
          </button>
          <input
            className="form-input flex-1 min-w-0 text-xs"
            value={content.promoVideoUrl}
            onChange={(e) => setField('promoVideoUrl', e.target.value)}
            placeholder="/media/matchday-promo.mp4 or Cloudinary URL"
          />
        </div>
        <p className="text-xs text-[color:var(--aw-text-muted)] mt-1">
          Upload an MP4/WebM, or paste any URL (Cloudinary, etc.). Changes go live after Save.
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-[color:var(--aw-border)]">
        <button onClick={handleReset} className="text-sm px-4 py-2 rounded-lg border border-[#E8E3DB] text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-surface-muted)]">Reset to default</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-5 py-2.5">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
