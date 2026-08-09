'use client';

import { useEffect, useState } from 'react';
import { showSuccessToast, showErrorToast } from '@/components/Toast';
import { DEFAULT_HERO, type HeroContent } from '@/lib/site-content-defaults';

const KEY = 'hero_content';

export function HeroContentSection() {
  const [content, setContent] = useState<HeroContent>(DEFAULT_HERO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/site-content/${KEY}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.value) {
          setContent({ ...DEFAULT_HERO, ...(data.value as Partial<HeroContent>) });
          setUpdatedAt(data.updatedAt ?? null);
        }
      })
      .catch(() => {
        /* fall back to defaults */
      })
      .finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof HeroContent>(key: K, value: HeroContent[K]) {
    setContent((prev) => ({ ...prev, [key]: value }));
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
      setField('videoUrl', data.url);
      showSuccessToast('Uploaded', 'New hero video is ready. Click Save to publish.');
    } catch (err: any) {
      showErrorToast('Upload failed', err?.message || 'Could not upload video.');
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
      showSuccessToast('Saved', 'Hero video is now live on the homepage.');
    } catch (err: any) {
      showErrorToast('Save failed', err?.message || 'Could not save content.');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (confirm('Reset to default hero video? This will revert to the original video.')) {
      setContent(DEFAULT_HERO);
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-[color:var(--aw-text-muted)]">Loading…</div>;
  }

  return (
    <div className="bg-white rounded-lg border border-[color:var(--aw-border)] p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-1">Hero Video</h3>
        <p className="text-sm text-[color:var(--aw-text-muted)]">
          Update the homepage hero background video.
          {updatedAt && (
            <span className="block text-xs text-[color:var(--aw-text-muted)] mt-1">
              Last updated: {new Date(updatedAt).toLocaleString()}
            </span>
          )}
        </p>
      </div>

      <div className="space-y-4">
        {/* Video Preview */}
        <div>
          <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-3">
            Current Video Preview
          </label>
          <div className="aspect-video rounded-lg overflow-hidden bg-[color:var(--aw-navy)] border border-[color:var(--aw-border)]">
            {content.videoUrl ? (
              <video
                src={content.videoUrl}
                controls
                className="w-full h-full object-cover"
                controlsList="nodownload"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-white/50">
                No video
              </div>
            )}
          </div>
        </div>

        {/* Video Upload */}
        <div>
          <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-2">
            Upload New Video (MP4, WebM)
          </label>
          <input
            type="file"
            accept="video/mp4,video/webm"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleVideoUpload(f);
            }}
            className="block w-full text-xs text-[color:var(--aw-text-strong)] file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-[color:var(--aw-navy)] file:text-white file:text-xs file:font-semibold hover:file:bg-[#2D4A8C] disabled:opacity-50"
          />
          {uploading && <p className="text-xs text-[color:var(--aw-text-muted)] mt-2">Uploading…</p>}
        </div>

        {/* Video URL */}
        <div>
          <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-2">
            Video URL (or paste a path)
          </label>
          <input
            type="text"
            value={content.videoUrl}
            onChange={(e) => setField('videoUrl', e.target.value)}
            className="form-input"
            placeholder="/media/hero-video.mp4"
          />
        </div>

        {/* Alt Text */}
        <div>
          <label className="block text-xs font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] mb-2">
            Video Description (for accessibility)
          </label>
          <input
            type="text"
            value={content.videoAlt}
            onChange={(e) => setField('videoAlt', e.target.value)}
            className="form-input"
            placeholder="Describe the video content"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-4 border-t border-[color:var(--aw-border)]">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary px-6 py-2.5 text-sm"
          >
            {saving ? 'Saving…' : 'Save & Publish'}
          </button>
          <button
            onClick={handleReset}
            className="btn-outline px-6 py-2.5 text-sm"
          >
            Reset to Default
          </button>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold tracking-[0.1em] uppercase text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)] self-center"
          >
            Preview on site →
          </a>
        </div>
      </div>

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
          box-shadow: 0 0 0 3px rgba(27, 42, 91, 0.1);
        }
      `}</style>
    </div>
  );
}
