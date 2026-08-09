'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface PageRow {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export default function PagesIndex() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pages');
      const data = await res.json();
      setPages(data.pages ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    setErr(null);
    if (!newSlug.trim() || !newTitle.trim()) {
      setErr('Slug and title are required');
      return;
    }
    const res = await fetch('/api/admin/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: newSlug.trim(), title: newTitle.trim(), blocks: [] }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || 'Failed to create');
      return;
    }
    setCreating(false);
    setNewSlug('');
    setNewTitle('');
    refresh();
    window.location.href = `/admin/pages/${data.page.id}`;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--aw-navy)' }}>
            Pages
          </h1>
          <p className="text-sm text-[var(--aw-text-light)] mt-1">
            Build storefront pages from drag-and-drop blocks. Drafts are private; published pages are live at <code>/p/&lt;slug&gt;</code>.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-5 py-2 bg-[var(--aw-navy)] text-white text-sm font-medium"
        >
          + New page
        </button>
      </header>

      {creating && (
        <div className="bg-white border border-[var(--aw-border-strong)] p-5 mb-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--aw-navy)]">
            New page
          </h2>
          {err && <div className="text-xs text-red-700 bg-red-50 p-2">{err}</div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider block mb-1">Title</span>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
                placeholder="About AWULA K"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider block mb-1">
                Slug (live at /p/&lt;slug&gt;)
              </span>
              <input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
                className="w-full border border-[var(--aw-border-strong)] px-3 py-2 text-sm font-mono"
                placeholder="about"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={create} className="px-4 py-2 bg-[var(--aw-navy)] text-white text-sm">
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="px-4 py-2 border border-[var(--aw-border-strong)] text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-[var(--aw-border-strong)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--aw-cream)] text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--aw-text-light)]">
                  Loading…
                </td>
              </tr>
            ) : pages.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--aw-text-light)]">
                  No pages yet. Create your first one above.
                </td>
              </tr>
            ) : (
              pages.map((p) => (
                <tr key={p.id} className="border-t border-[var(--aw-border)]">
                  <td className="px-4 py-3 font-medium">{p.title}</td>
                  <td className="px-4 py-3 font-mono text-xs">/p/{p.slug}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        p.status === 'published'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--aw-text-light)]">
                    {new Date(p.updatedAt).toLocaleString()}
                    {p.updatedBy && <div className="text-[10px]">by {p.updatedBy}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/pages/${p.id}`}
                      className="text-xs text-[var(--aw-navy)] underline"
                    >
                      Edit →
                    </Link>
                    {p.status === 'published' && (
                      <a
                        href={`/p/${p.slug}`}
                        target="_blank"
                        rel="noopener"
                        className="ml-3 text-xs text-[var(--aw-text-light)] underline"
                      >
                        View
                      </a>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
