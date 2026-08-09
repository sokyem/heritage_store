'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface Application {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  businessName: string | null;
  specialty: string | null;
  portfolioUrl: string | null;
  yearsExperience: number | null;
  bio: string | null;
  status: string;
  identityVerified: boolean;
  portfolioReviewed: boolean;
  referencesChecked: boolean;
  backgroundCheckPassed: boolean;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const CHECKLIST: { key: keyof Application; label: string }[] = [
  { key: 'identityVerified', label: 'Identity verified' },
  { key: 'portfolioReviewed', label: 'Portfolio reviewed' },
  { key: 'referencesChecked', label: 'References checked' },
  { key: 'backgroundCheckPassed', label: 'Background check passed' },
];

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  under_review: 'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

export default function DesignerApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Local edits for the selected application's checklist + notes
  const [draft, setDraft] = useState<Partial<Application>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/designer-applications');
      if (res.ok) setApplications(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = applications.find((a) => a.id === selectedId) || null;

  // Reset the draft whenever a different application is opened.
  useEffect(() => {
    if (selected) {
      setDraft({
        identityVerified: selected.identityVerified,
        portfolioReviewed: selected.portfolioReviewed,
        referencesChecked: selected.referencesChecked,
        backgroundCheckPassed: selected.backgroundCheckPassed,
        reviewNotes: selected.reviewNotes || '',
      });
      setMsg(null);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(
    () => (filter === 'all' ? applications : applications.filter((a) => a.status === filter)),
    [applications, filter],
  );

  const allChecked = CHECKLIST.every((c) => draft[c.key]);
  const isClosed = selected?.status === 'approved' || selected?.status === 'rejected';

  async function patch(action?: 'approve' | 'reject') {
    if (!selected) return;
    if (action === 'approve' && !allChecked) {
      setMsg({ text: 'Complete every verification step before approving.', ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/designer-applications/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, ...(action ? { action } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setMsg({
        text:
          action === 'approve'
            ? 'Approved — the applicant has been emailed to set up their designer account.'
            : action === 'reject'
              ? 'Application rejected.'
              : 'Verification progress saved.',
        ok: true,
      });
      await load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Update failed', ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
          Designer Applications
        </h1>
        <p className="text-base text-[color:var(--aw-text-muted)]">
          Review, verify, and approve people applying to join the designer network.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 bg-[color:var(--aw-cream)] rounded-lg p-1 w-fit mb-6">
        {['all', 'pending', 'under_review', 'approved', 'rejected'].map((s) => {
          const n = s === 'all' ? applications.length : applications.filter((a) => a.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
                filter === s ? 'bg-white text-[color:var(--aw-text-strong)] shadow-sm' : 'text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'
              }`}
            >
              {s.replace('_', ' ')} ({n})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-[color:var(--aw-text-muted)]">Loading…</div>
      ) : (
        <div className="grid lg:grid-cols-[340px_1fr] gap-6">
          {/* List */}
          <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm divide-y divide-[#F0EBE3] overflow-hidden">
            {visible.length === 0 ? (
              <p className="p-6 text-sm text-[color:var(--aw-text-muted)] text-center">No applications.</p>
            ) : (
              visible.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    selectedId === a.id ? 'bg-[color:var(--aw-bg)]' : 'hover:bg-[color:var(--aw-surface-muted)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[color:var(--aw-text-strong)] text-sm truncate">{a.name}</span>
                    <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLES[a.status] || ''}`}>
                      {a.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-[color:var(--aw-text-muted)] truncate mt-0.5">{a.email}</p>
                  {a.specialty && <p className="text-xs text-[color:var(--aw-text-muted)] mt-0.5">{a.specialty}</p>}
                </button>
              ))
            )}
          </div>

          {/* Detail */}
          <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm p-6">
            {!selected ? (
              <p className="text-sm text-[color:var(--aw-text-muted)] text-center py-12">Select an application to review.</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)]">{selected.name}</h2>
                    <p className="text-sm text-[color:var(--aw-text-muted)]">{selected.email}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLES[selected.status] || ''}`}>
                    {selected.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Applicant details */}
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-5">
                  <Detail label="Phone" value={selected.phone} />
                  <Detail label="Location" value={selected.location} />
                  <Detail label="Business" value={selected.businessName} />
                  <Detail label="Specialty" value={selected.specialty} />
                  <Detail
                    label="Experience"
                    value={selected.yearsExperience != null ? `${selected.yearsExperience} years` : null}
                  />
                  <Detail
                    label="Portfolio"
                    value={
                      selected.portfolioUrl ? (
                        <a href={selected.portfolioUrl} target="_blank" rel="noreferrer" className="text-[color:var(--aw-danger)] underline break-all">
                          {selected.portfolioUrl}
                        </a>
                      ) : null
                    }
                  />
                </div>
                {selected.bio && (
                  <div className="mb-5">
                    <p className="text-xs uppercase text-[color:var(--aw-text-muted)] mb-1">About</p>
                    <p className="text-sm text-[color:var(--aw-text-strong)] whitespace-pre-wrap leading-relaxed">{selected.bio}</p>
                  </div>
                )}

                {/* Verification checklist */}
                <div className="border-t border-[color:var(--aw-border)] pt-4 mb-4">
                  <p className="text-sm font-semibold text-[color:var(--aw-text-strong)] mb-3">Verification Checklist</p>
                  <div className="space-y-2">
                    {CHECKLIST.map((c) => (
                      <label key={c.key} className={`flex items-center gap-2.5 text-sm ${isClosed ? 'opacity-70' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          disabled={isClosed}
                          checked={Boolean(draft[c.key])}
                          onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.checked }))}
                        />
                        <span className="text-[color:var(--aw-text-strong)]">{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Review notes */}
                <div className="mb-4">
                  <p className="text-xs uppercase text-[color:var(--aw-text-muted)] mb-1">Review notes</p>
                  <textarea
                    className="w-full border border-[color:var(--aw-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--aw-text-strong)]"
                    rows={3}
                    disabled={isClosed}
                    value={(draft.reviewNotes as string) || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, reviewNotes: e.target.value }))}
                    placeholder="Notes from the review (visible to admins only)…"
                  />
                </div>

                {msg && (
                  <p className={`text-sm mb-3 ${msg.ok ? 'text-green-700' : 'text-[color:var(--aw-danger)]'}`}>{msg.text}</p>
                )}

                {isClosed ? (
                  <p className="text-sm text-[color:var(--aw-text-muted)]">
                    {selected.status === 'approved' ? 'Approved' : 'Rejected'}
                    {selected.reviewedBy ? ` by ${selected.reviewedBy}` : ''}
                    {selected.reviewedAt ? ` on ${new Date(selected.reviewedAt).toLocaleDateString()}` : ''}.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => patch()}
                      disabled={busy}
                      className="px-4 py-2 text-sm font-semibold rounded-md border border-[color:var(--aw-navy)] text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/5 disabled:opacity-50"
                    >
                      Save Progress
                    </button>
                    <button
                      onClick={() => patch('approve')}
                      disabled={busy || !allChecked}
                      title={allChecked ? '' : 'Complete every verification step first'}
                      className="px-4 py-2 text-sm font-semibold rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#22C55E' }}
                    >
                      Approve Designer
                    </button>
                    <button
                      onClick={() => patch('reject')}
                      disabled={busy}
                      className="px-4 py-2 text-sm font-semibold rounded-md text-white disabled:opacity-50"
                      style={{ backgroundColor: '#C41E3A' }}
                    >
                      Reject
                    </button>
                  </div>
                )}
                {!isClosed && !allChecked && (
                  <p className="text-xs text-[color:var(--aw-text-muted)] mt-2">
                    All four verification steps must be ticked before the application can be approved.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs uppercase text-[color:var(--aw-text-muted)]">{label}</span>
      <p className="text-[color:var(--aw-text-strong)]">{value || <span className="text-[color:var(--aw-text-faint)]">—</span>}</p>
    </div>
  );
}
