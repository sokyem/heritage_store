'use client';

import { Fragment, useEffect, useState } from 'react';

interface AuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string | null;
  diff: unknown;
  ip: string | null;
  createdAt: string;
}

const ACTION_BADGES: Record<string, string> = {
  create: 'bg-[#22C55E]/10 text-[color:var(--aw-success)]',
  update: 'bg-[color:var(--aw-navy)]/10 text-[color:var(--aw-text-strong)]',
  delete: 'bg-[color:var(--aw-danger)]/10 text-[color:var(--aw-danger)]',
  login: 'bg-[#8B7569]/10 text-[color:var(--aw-text-muted)]',
  other: 'bg-[#9CA3AF]/10 text-[color:var(--aw-text-faint)]',
};

function fmt(ts: string) {
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const take = 50;

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (entity) params.set('entity', entity);
    if (action) params.set('action', action);
    if (actor) params.set('actor', actor);
    params.set('take', String(take));
    params.set('skip', String(skip));
    fetch(`/api/admin/audit?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items || []);
        setTotal(d.total || 0);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Audit Log</h1>
        <p className="text-base text-[color:var(--aw-text-muted)]">Append-only record of admin changes.</p>
      </div>

      <div className="bg-white border border-[color:var(--aw-border)] rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">Entity</label>
          <input className="input-field text-sm py-2 w-40" placeholder="AppSetting" value={entity} onChange={(e) => setEntity(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">Action</label>
          <select className="input-field text-sm py-2 w-32" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Any</option>
            <option value="create">create</option>
            <option value="update">update</option>
            <option value="delete">delete</option>
            <option value="login">login</option>
            <option value="other">other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">Actor email</label>
          <input className="input-field text-sm py-2 w-56" placeholder="contains…" value={actor} onChange={(e) => setActor(e.target.value)} />
        </div>
        <button className="btn-primary text-sm px-5 py-2" onClick={() => { setSkip(0); load(); }}>Filter</button>
        <button className="text-sm px-4 py-2 text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]" onClick={() => { setEntity(''); setAction(''); setActor(''); setSkip(0); setTimeout(load, 0); }}>Reset</button>
        <span className="ml-auto text-xs text-[color:var(--aw-text-muted)]">{total} total entries</span>
      </div>

      <div className="bg-white border border-[color:var(--aw-border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--aw-surface-muted)] text-xs uppercase text-[color:var(--aw-text-muted)]">
            <tr>
              <th className="text-left px-4 py-3 font-medium">When</th>
              <th className="text-left px-4 py-3 font-medium">Actor</th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
              <th className="text-left px-4 py-3 font-medium">Entity</th>
              <th className="text-left px-4 py-3 font-medium">Summary</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EBE3]">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-[color:var(--aw-text-muted)]">Loading…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-[color:var(--aw-text-muted)]">No audit entries.</td></tr>
            )}
            {!loading && items.map((e) => (
              <Fragment key={e.id}>
                <tr className="hover:bg-[color:var(--aw-surface-muted)]/40">
                  <td className="px-4 py-3 whitespace-nowrap text-[#2D2D2D]">{fmt(e.createdAt)}</td>
                  <td className="px-4 py-3 text-[#2D2D2D]">{e.actorEmail || '—'}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ACTION_BADGES[e.action] ?? ACTION_BADGES.other}`}>{e.action}</span></td>
                  <td className="px-4 py-3 text-[color:var(--aw-text-strong)] font-medium">{e.entity}{e.entityId ? <span className="text-[color:var(--aw-text-muted)]"> · {e.entityId}</span> : null}</td>
                  <td className="px-4 py-3 text-[color:var(--aw-text-muted)]">{e.summary || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {e.diff != null && (
                      <button className="text-xs text-[color:var(--aw-text-strong)] hover:underline" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                        {expanded === e.id ? 'Hide' : 'Diff'}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === e.id && (
                  <tr key={`${e.id}-d`} className="bg-[color:var(--aw-bg)]">
                    <td colSpan={6} className="px-4 py-3">
                      <pre className="text-xs text-[#2D2D2D] whitespace-pre-wrap break-words overflow-x-auto max-h-80">{JSON.stringify(e.diff, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-[color:var(--aw-text-muted)]">Showing {items.length === 0 ? 0 : skip + 1}–{skip + items.length} of {total}</span>
        <div className="flex gap-2">
          <button className="text-sm px-4 py-2 border border-[#E8E3DB] rounded-lg disabled:opacity-50" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - take))}>Prev</button>
          <button className="text-sm px-4 py-2 border border-[#E8E3DB] rounded-lg disabled:opacity-50" disabled={skip + take >= total} onClick={() => setSkip(skip + take)}>Next</button>
        </div>
      </div>
    </div>
  );
}
