'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminErrorBanner } from '@/components/admin/AdminErrorBanner';

interface TplRow {
  key: string;
  name: string;
  description: string;
  subject: string;
  enabled: boolean;
  customized: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

type TplSortColumn = 'name' | 'subject' | 'enabled' | 'updatedAt';

export default function EmailTemplatesIndex() {
  const [tpls, setTpls] = useState<TplRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showOnly, setShowOnly] = useState<'all' | 'customized' | 'disabled'>('all');
  const [sortBy, setSortBy] = useState<TplSortColumn>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    setError(null);
    fetch('/api/admin/email-templates')
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => null);
          throw new Error(err?.error || `Email templates failed (${r.status})`);
        }
        return r.json();
      })
      .then((d) => setTpls(d.templates || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load templates'))
      .finally(() => setLoading(false));
  }, []);

  function toggleSort(col: TplSortColumn) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'updatedAt' ? 'desc' : 'asc');
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = tpls.filter((t) => {
      if (showOnly === 'customized' && !t.customized) return false;
      if (showOnly === 'disabled' && t.enabled) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = (a[sortBy] as string | boolean | null) ?? '';
      const bv = (b[sortBy] as string | boolean | null) ?? '';
      if (sortBy === 'enabled') {
        return (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [tpls, search, showOnly, sortBy, sortDir]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--aw-navy)' }}>
          Email Templates
        </h1>
        <p className="text-sm text-[var(--aw-text-light)] mt-1">
          Edit the subject and HTML of every transactional email. Use <code>{'{{variable}}'}</code> placeholders. Customizations override the built-in defaults.
        </p>
      </header>

      <AdminErrorBanner message={error} />

      {/* Search + filter toolbar */}
      <div className="bg-white border border-[var(--aw-border-strong)] p-3 mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, subject, or key…"
          className="border border-[var(--aw-border-strong)] px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <select
          value={showOnly}
          onChange={(e) => setShowOnly(e.target.value as 'all' | 'customized' | 'disabled')}
          className="border border-[var(--aw-border-strong)] px-3 py-2 text-sm"
        >
          <option value="all">All templates</option>
          <option value="customized">Customized only</option>
          <option value="disabled">Disabled only</option>
        </select>
        <span className="text-xs text-[var(--aw-text-light)] ml-auto">
          {visible.length} of {tpls.length}
        </span>
      </div>

      <div className="bg-white border border-[var(--aw-border-strong)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--aw-cream)] text-left text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">
                <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-[var(--aw-navy)]">
                  Template
                  {sortBy === 'name' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" onClick={() => toggleSort('subject')} className="inline-flex items-center gap-1 hover:text-[var(--aw-navy)]">
                  Subject
                  {sortBy === 'subject' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" onClick={() => toggleSort('enabled')} className="inline-flex items-center gap-1 hover:text-[var(--aw-navy)]">
                  Status
                  {sortBy === 'enabled' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" onClick={() => toggleSort('updatedAt')} className="inline-flex items-center gap-1 hover:text-[var(--aw-navy)]">
                  Last updated
                  {sortBy === 'updatedAt' && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
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
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--aw-text-light)]">
                  No templates match this filter.
                </td>
              </tr>
            ) : (
              visible.map((t) => (
                <tr key={t.key} className="border-t border-[var(--aw-border)]">
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-[var(--aw-text-light)]">{t.description}</div>
                    <div className="text-[10px] font-mono text-[var(--aw-text-light)] mt-1">{t.key}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{t.subject}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] uppercase w-fit ${
                          t.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {t.enabled ? 'enabled' : 'disabled'}
                      </span>
                      {t.customized && (
                        <span className="inline-block px-2 py-0.5 text-[10px] uppercase bg-blue-100 text-blue-800 w-fit">
                          custom
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--aw-text-light)]">
                    {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : '—'}
                    {t.updatedBy && <div className="text-[10px]">by {t.updatedBy}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/email-templates/${t.key}`}
                      className="text-xs text-[var(--aw-navy)] underline"
                    >
                      Edit →
                    </Link>
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
