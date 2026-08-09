'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

/* ── types ──
   These mirror the AdminConsultation Prisma model exactly:
   scheduledDate (DateTime) + scheduledTime (String "HH:MM") + duration (Int).
   The form keeps scheduledDate as a plain "YYYY-MM-DD" string for the
   <input type="date">; the API does new Date() on it. */
interface Client { id: string; clientId: string; name: string; }

interface Consultation {
  id: string;
  source?: 'admin' | 'booking';   // 'booking' = customer-initiated slot booking
  consultId: string;
  clientId: string | null;
  clientName: string;
  type: 'virtual' | 'in_person' | 'phone';
  purpose: 'custom_design' | 'styling' | 'bridal' | 'fitting' | 'follow_up';
  scheduledDate: string;   // "YYYY-MM-DD" (form) or ISO datetime (from API)
  scheduledTime: string;   // "HH:MM"
  duration: number;
  assignedTo: string;
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  preNotes: string;
  sessionNotes: string;
  outcome: 'booked_order' | 'follow_up_needed' | 'no_action' | 'cancelled' | '';
  followUpDate: string;
  aiSummary: string;
  meetingLink?: string;
  customerEmail?: string;
  customerPhone?: string;
  callTranscript?: string;       // AI transcript captured during the call
  transcriptStatus?: string;     // '' | 'processing' | 'done' | 'failed'
  callSummary?: string;          // AI-generated summary of the call
  callRecordingUrl?: string;     // JaaS cloud-recording link (via webhook)
  callRecordingAt?: string;      // ISO timestamp the recording was attached
}

type Tab = 'calendar' | 'list';

const STATUS_COLORS: Record<Consultation['status'], string> = {
  scheduled: '#3B82F6',
  confirmed: '#22C55E',
  in_progress: '#F59E0B',
  completed: '#9CA3AF',
  cancelled: '#DC2626',
  no_show: '#7F1D1D',
};

const STATUS_BG: Record<Consultation['status'], string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-gray-100 text-gray-600 border-gray-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  no_show: 'bg-red-100 text-red-900 border-red-300',
};

const TYPE_LABELS: Record<Consultation['type'], string> = { virtual: 'Virtual', in_person: 'In-Person', phone: 'Phone' };
const PURPOSE_LABELS: Record<Consultation['purpose'], string> = { custom_design: 'Custom Design', styling: 'Styling', bridal: 'Bridal', fitting: 'Fitting', follow_up: 'Follow-up' };
const DURATIONS = [15, 30, 45, 60, 90];

const EMPTY: Partial<Consultation> = {
  clientId: '', clientName: '', type: 'in_person', purpose: 'custom_design',
  scheduledDate: '', scheduledTime: '09:00', duration: 30, assignedTo: '',
  preNotes: '', sessionNotes: '', outcome: '', followUpDate: '', aiSummary: '',
  status: 'scheduled',
};

/* ── helpers ── */
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Normalize whatever the API returns for scheduledDate down to "YYYY-MM-DD". */
function dateKey(scheduledDate: string): string {
  if (!scheduledDate) return '';
  // API returns full ISO ("2026-05-21T00:00:00.000Z"); form holds "2026-05-21"
  return scheduledDate.slice(0, 10);
}

/** Format a "HH:MM" string into "2:30 PM". Falls back gracefully. */
function fmtTime(time: string): string {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return time || '—';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function isSameDayKey(scheduledDate: string, day: Date): boolean {
  const key = dateKey(scheduledDate);
  if (!key) return false;
  const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  return key === dayKey;
}

/* ── component ── */
export default function ConsultationsPage() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('calendar');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [modal, setModal] = useState<'schedule' | 'detail' | null>(null);
  const [form, setForm] = useState<Partial<Consultation>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  /** Build the full, shareable video-call URL from a (possibly relative) link. */
  function absoluteMeetingUrl(link: string): string {
    if (!link) return '';
    if (link.startsWith('http')) return link;
    if (typeof window !== 'undefined') return window.location.origin + link;
    return link;
  }

  async function copyMeetingLink(link: string) {
    const url = absoluteMeetingUrl(link);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard API blocked — fall back to a prompt the admin can copy from
      window.prompt('Copy this video consultation link:', url);
    }
  }

  /** Ensure a virtual consultation has a room, then open it. Opens the tab
   *  synchronously first so the browser doesn't block it after the await. */
  async function startRoom(c: Consultation) {
    const win = window.open('about:blank', '_blank');
    try {
      const res = await fetch(`/api/admin/consultations/${c.id}/ensure-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: c.source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.meetingLink) {
        if (win) win.close();
        alert(data.error || 'Could not start the video room.');
        return;
      }
      const url = absoluteMeetingUrl(data.meetingLink);
      if (win) win.location.href = url; else window.open(url, '_blank', 'noopener');
      load(); // refresh so the row now shows a direct Join link
    } catch {
      if (win) win.close();
      alert('Could not start the video room.');
    }
  }

  /** Flip a consultation to "completed" in one click — for use right after the
   *  call wraps up. Works for both AdminConsultation and customer-initiated
   *  ConsultationBooking rows; their respective PUT endpoints both accept a
   *  status field with the same vocabulary. */
  async function markDone(c: Consultation) {
    if (c.status === 'completed') return;
    if (!confirm(`Mark consultation with ${c.clientName} as completed?`)) return;
    try {
      const url = c.source === 'booking'
        ? `/api/consultation-bookings/${c.id}`
        : `/api/admin/consultations/${c.id}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update status');
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not mark as completed.');
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cRes, clRes] = await Promise.all([
        fetch('/api/admin/consultations'),
        fetch('/api/admin/clients'),
      ]);
      if (!cRes.ok) throw new Error('Failed to load consultations');
      const raw = await cRes.json();
      // Normalize: scheduledDate ISO → "YYYY-MM-DD" so the form + filters
      // all work with the same shape.
      const normalized: Consultation[] = (Array.isArray(raw) ? raw : []).map((c: Consultation & { client?: { name?: string } }) => ({
        ...c,
        scheduledDate: dateKey(c.scheduledDate),
        scheduledTime: c.scheduledTime || '',
        clientName: c.clientName || c.client?.name || 'Walk-in',
      }));
      setConsultations(normalized);
      if (clRes.ok) setClients(await clRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── stats ── */
  const today = new Date();
  const stats = useMemo(() => {
    const total = consultations.length;
    const todayCount = consultations.filter(c => isSameDayKey(c.scheduledDate, today)).length;
    const upcoming = consultations.filter(c => {
      if (!['scheduled', 'confirmed'].includes(c.status)) return false;
      const key = dateKey(c.scheduledDate);
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      return key >= todayKey;
    }).length;
    const completed = consultations.filter(c => c.status === 'completed').length;
    return { total, todayCount, upcoming, completed };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultations]);

  /* ── filtered list ── */
  const filtered = useMemo(() => {
    return consultations.filter(c => {
      if (search && !c.clientName.toLowerCase().includes(search.toLowerCase()) && !c.consultId.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      const key = dateKey(c.scheduledDate);
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      return true;
    });
  }, [consultations, search, statusFilter, dateFrom, dateTo]);

  /* ── calendar week data ── */
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  /* ── CRUD ── */
  async function save() {
    if (!form.clientName?.trim() || !form.scheduledDate) {
      setError('Client name and date are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Customer-initiated bookings live in ConsultationBooking, not
      // AdminConsultation. We can only update their status + notes —
      // the slot owns date/time/type.
      if (form.source === 'booking' && form.id) {
        const res = await fetch(`/api/consultation-bookings/${form.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: form.status,
            sessionNotes: form.sessionNotes || '',
            callSummary: form.callSummary || '',
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || 'Save failed');
        }
        setModal(null);
        await load();
        return;
      }

      const isNew = !form.id;
      const url = isNew ? '/api/admin/consultations' : `/api/admin/consultations/${form.id}`;
      // Send exactly the fields the API + Prisma model expect.
      const payload = {
        clientId: form.clientId || null,
        clientName: form.clientName.trim(),
        type: form.type || 'in_person',
        purpose: form.purpose || 'custom_design',
        scheduledDate: form.scheduledDate,           // "YYYY-MM-DD"
        scheduledTime: form.scheduledTime || '09:00', // "HH:MM"
        duration: Number(form.duration) || 30,
        status: form.status || 'scheduled',
        assignedTo: form.assignedTo || null,
        preNotes: form.preNotes || null,
        sessionNotes: form.sessionNotes || null,
        outcome: form.outcome || null,
        followUpDate: form.followUpDate || null,
        aiSummary: form.aiSummary || null,
      };
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Save failed');
      }
      setModal(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save consultation');
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Consultation) {
    // Booking-sourced rows cancel the booking (frees the slot);
    // admin-sourced rows delete the AdminConsultation.
    const isBooking = c.source === 'booking';
    if (!confirm(isBooking ? 'Cancel this customer booking?' : 'Delete this consultation?')) return;
    try {
      const url = isBooking
        ? `/api/consultation-bookings/${c.id}`
        : `/api/admin/consultations/${c.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      await load();
    } catch {
      setError(isBooking ? 'Failed to cancel booking' : 'Failed to delete consultation');
    }
  }

  function openDetail(c: Consultation) {
    setForm({ ...c, scheduledDate: dateKey(c.scheduledDate) });
    setModal('detail');
  }

  function openSchedule() {
    setError('');
    setForm({ ...EMPTY });
    setModal('schedule');
  }

  const updateForm = (patch: Partial<Consultation>) => setForm(prev => ({ ...prev, ...patch }));

  // Summarize the call transcript (+ any notes) into a structured summary and
  // drop it into the form's callSummary field. Saved with the booking on Save.
  const handleSummarize = async () => {
    if (!form.callTranscript?.trim() && !form.sessionNotes?.trim()) {
      setError('There is no transcript or notes to summarize yet.');
      return;
    }
    setSummarizing(true);
    setError('');
    try {
      const res = await fetch('/api/transcribe/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: form.callTranscript, notes: form.sessionNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Summary failed');
      updateForm({ callSummary: data.summary || '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Summary failed');
    } finally {
      setSummarizing(false);
    }
  };

  /* ── render helpers ── */
  function StatCard({ label, value }: { label: string; value: number }) {
    return (
      <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm p-5 flex-1 min-w-[140px]">
        <p className="text-sm text-[color:var(--aw-text-muted)] mb-1">{label}</p>
        <p className="text-2xl font-semibold text-[color:var(--aw-text-strong)]">{value}</p>
      </div>
    );
  }

  function StatusBadge({ status }: { status: Consultation['status'] }) {
    return (
      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_BG[status]}`}>
        {status.replace('_', ' ')}
      </span>
    );
  }

  function TypeBadge({ type }: { type: Consultation['type'] }) {
    const bg = type === 'virtual' ? 'bg-indigo-50 text-indigo-700' : type === 'phone' ? 'bg-teal-50 text-teal-700' : 'bg-orange-50 text-orange-700';
    return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${bg}`}>{TYPE_LABELS[type]}</span>;
  }

  /* ── calendar view ── */
  function CalendarView() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button className="text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 px-3 py-1.5 rounded text-sm font-medium transition-colors" onClick={() => setWeekStart(addDays(weekStart, -7))}>&#8592; Prev</button>
          <h3 className="text-base font-semibold text-[color:var(--aw-text-strong)]">{fmtDate(weekStart)} &mdash; {fmtDate(addDays(weekStart, 6))}</h3>
          <button className="text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 px-3 py-1.5 rounded text-sm font-medium transition-colors" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next &#8594;</button>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map(day => {
            const isToday = isSameDayKey(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`, today);
            const dayCons = consultations
              .filter(c => isSameDayKey(c.scheduledDate, day))
              .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
            return (
              <div key={day.toISOString()} className={`rounded-lg border min-h-[260px] ${isToday ? 'border-[#C41E3A] bg-[#FFF5F6]' : 'border-[color:var(--aw-border)] bg-white'}`}>
                <div className={`text-center py-2 border-b text-sm font-semibold ${isToday ? 'bg-[color:var(--aw-danger)] text-white border-[#C41E3A]' : 'bg-[color:var(--aw-surface-muted)] text-[color:var(--aw-text-strong)] border-[color:var(--aw-border)]'} rounded-t-lg`}>
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}<br />
                  <span className="text-xs font-normal">{day.getDate()}</span>
                </div>
                <div className="p-1.5 space-y-1.5">
                  {dayCons.map(c => (
                    <button key={c.id} onClick={() => openDetail(c)} className="w-full text-left bg-[color:var(--aw-surface-muted)] hover:bg-[color:var(--aw-cream)] rounded p-2 transition-colors">
                      <p className="text-xs font-semibold text-[color:var(--aw-text-strong)]">{fmtTime(c.scheduledTime)}</p>
                      <p className="text-xs text-[#2D2D2D] truncate">{c.clientName}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <TypeBadge type={c.type} />
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[c.status] }} />
                        {/* Tiny artifact icons so the admin can spot calls that
                            already have notes / a transcript / a recording
                            without opening every tile. */}
                        {(c.sessionNotes || c.callSummary) && <span title="Has notes" className="text-[10px] leading-none">📝</span>}
                        {c.callTranscript && <span title="Has transcript" className="text-[10px] leading-none">📄</span>}
                        {c.callRecordingUrl && <span title="Has recording" className="text-[10px] leading-none">⏺</span>}
                      </div>
                    </button>
                  ))}
                  {dayCons.length === 0 && <p className="text-[10px] text-[color:var(--aw-text-muted)] text-center pt-4">No bookings</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── list view ── */
  function ListView() {
    return (
      <div>
        <div className="flex flex-wrap gap-3 mb-5">
          <input className="input-field text-sm py-2 max-w-xs" placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input-field text-sm py-2 w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <input type="date" className="input-field text-sm py-2 w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <input type="date" className="input-field text-sm py-2 w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-[color:var(--aw-border)] overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E8E3DB] bg-[color:var(--aw-surface-muted)]">
                {['ID', 'Client', 'Type', 'Date / Time', 'Duration', 'Staff', 'Status', 'Outcome', 'Actions'].map(h => (
                  <th key={h} className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-surface-muted)] transition-colors">
                  <td className="px-4 py-3 text-sm font-semibold text-[color:var(--aw-text-strong)] whitespace-nowrap">
                    {c.consultId}
                    {c.source === 'booking' && (
                      <span className="ml-1.5 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 align-middle">Online</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#2D2D2D]">{c.clientName}</td>
                  <td className="px-4 py-3"><TypeBadge type={c.type} /></td>
                  <td className="px-4 py-3 text-sm text-[#2D2D2D]">
                    {c.scheduledDate ? new Date(c.scheduledDate + 'T00:00:00').toLocaleDateString() : '—'} {fmtTime(c.scheduledTime)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[color:var(--aw-text-muted)]">{c.duration} min</td>
                  <td className="px-4 py-3 text-sm text-[#2D2D2D]">{c.assignedTo || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-sm text-[color:var(--aw-text-muted)] capitalize">{c.outcome ? c.outcome.replace(/_/g, ' ') : '—'}</td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {c.type === 'virtual' && c.status !== 'cancelled' && (
                      <button
                        onClick={() => startRoom(c)}
                        className="inline-block text-white bg-[#2D8E5A] hover:bg-[#206E44] text-sm font-semibold px-3 py-1 rounded transition-colors"
                        title="Open the video room (the customer joins the same one). Uses Daily when configured, else Jitsi."
                      >
                        🎥 {c.meetingLink ? 'Join' : 'Start call'}
                      </button>
                    )}
                    {/* Mark Done — only when the consultation is in-flight. Hides
                        once it's already completed/cancelled/no-show. */}
                    {['scheduled', 'confirmed', 'in_progress'].includes(c.status) && (
                      <button
                        onClick={() => markDone(c)}
                        className="inline-block text-[#206E44] hover:bg-[#2D8E5A]/10 text-sm font-medium px-2 py-1 rounded transition-colors"
                        title="Mark this consultation as completed."
                      >
                        ✓ Done
                      </button>
                    )}
                    {/* Quick-access to artifacts captured after the call. Each
                        button only appears when the underlying field is set,
                        so the row stays clean until there's something to open. */}
                    {(c.sessionNotes || c.callSummary) && (
                      <button
                        onClick={() => openDetail(c)}
                        className="inline-block text-[color:var(--aw-navy)] hover:bg-[color:var(--aw-navy)]/10 text-sm font-medium px-2 py-1 rounded transition-colors"
                        title="View consultation notes & summary"
                      >
                        📝 Notes
                      </button>
                    )}
                    {c.callTranscript && (
                      <button
                        onClick={() => openDetail(c)}
                        className="inline-block text-[color:var(--aw-navy)] hover:bg-[color:var(--aw-navy)]/10 text-sm font-medium px-2 py-1 rounded transition-colors"
                        title="View AI transcript"
                      >
                        📄 Transcript
                      </button>
                    )}
                    {c.callRecordingUrl && (
                      <a
                        href={c.callRecordingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[color:var(--aw-navy)] hover:bg-[color:var(--aw-navy)]/10 text-sm font-medium px-2 py-1 rounded transition-colors"
                        title="Open the call recording"
                      >
                        ⏺ Recording
                      </a>
                    )}
                    <button className="text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 text-sm font-medium px-2 py-1 rounded transition-colors" onClick={() => openDetail(c)}>Edit</button>
                    <button className="text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger)]/10 text-sm font-medium px-2 py-1 rounded transition-colors" onClick={() => remove(c)}>{c.source === 'booking' ? 'Cancel' : 'Delete'}</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-[color:var(--aw-text-muted)]">No consultations found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ── modal fields ── */
  function ModalFields({ isDetail }: { isDetail: boolean }) {
    const isBooking = form.source === 'booking';
    return (
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {/* Online-booking banner: video link + customer contact */}
        {isDetail && isBooking && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">Customer Online Booking</p>
            {form.meetingLink && (
              <>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={form.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 bg-[color:var(--aw-danger)] text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-[#9F162E] transition-colors"
                  >
                    🎥 Join Video Consultation
                  </a>
                  <button
                    type="button"
                    onClick={() => copyMeetingLink(form.meetingLink || '')}
                    className="inline-flex items-center gap-1.5 border border-purple-300 text-purple-800 text-sm font-semibold px-4 py-2 rounded-md hover:bg-purple-100 transition-colors"
                  >
                    {copiedLink ? '✓ Copied!' : '🔗 Copy Link'}
                  </button>
                </div>
                {/* Plain-text URL so the admin can also select/copy manually */}
                <p className="text-[11px] text-purple-700 break-all bg-white/60 rounded px-2 py-1 font-mono">
                  {absoluteMeetingUrl(form.meetingLink)}
                </p>
              </>
            )}
            <div className="text-xs text-[#5C3D2E] space-y-0.5 pt-1">
              {form.customerEmail && <p>✉ <a href={`mailto:${form.customerEmail}`} className="underline">{form.customerEmail}</a></p>}
              {form.customerPhone && <p>📞 <a href={`tel:${form.customerPhone}`} className="underline">{form.customerPhone}</a></p>}
            </div>
            <p className="text-[11px] text-purple-600">
              Share the link above with the customer (WhatsApp, SMS, email) — whoever opens it joins the same video room.
              Date, time and type are set by the customer&apos;s slot; only status &amp; notes are editable here.
            </p>
          </div>
        )}

        {/* Call record: recording, transcript & notes captured from the video call */}
        {isDetail && isBooking && (form.callRecordingUrl || form.callTranscript || form.sessionNotes || form.transcriptStatus || form.callSummary) && (
          <div className="bg-[color:var(--aw-surface-muted)] border border-[color:var(--aw-border)] rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-[color:var(--aw-text-strong)] uppercase tracking-wide">Call Record</p>

            {/* Recording */}
            <div>
              <p className="text-[11px] font-semibold text-[color:var(--aw-text-muted)] uppercase tracking-wide mb-1">Recording</p>
              {form.callRecordingUrl ? (
                <a
                  href={form.callRecordingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 bg-[color:var(--aw-navy)] text-white text-sm font-semibold px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
                >
                  ⏺ View / download recording
                  {form.callRecordingAt && (
                    <span className="text-[10px] font-normal opacity-80">
                      · {new Date(form.callRecordingAt).toLocaleString()}
                    </span>
                  )}
                </a>
              ) : (
                <p className="text-xs text-[color:var(--aw-text-faint)]">No recording uploaded yet.</p>
              )}
            </div>

            {/* AI transcript */}
            {form.callTranscript ? (
              <div>
                <p className="text-[11px] font-semibold text-[color:var(--aw-text-muted)] uppercase tracking-wide mb-1">AI Transcript</p>
                <textarea
                  readOnly
                  rows={4}
                  value={form.callTranscript}
                  className="input-field text-xs py-2 w-full resize-y bg-white"
                />
              </div>
            ) : form.transcriptStatus === 'processing' ? (
              <p className="text-xs text-[color:var(--aw-text-faint)]">⏳ Transcribing the recording… this can take a few minutes after the call.</p>
            ) : form.transcriptStatus === 'failed' ? (
              <p className="text-xs text-[color:var(--aw-danger)]">⚠ Transcription failed — open the recording to review it manually, or check the server logs.</p>
            ) : null}

            {/* Notes saved after the call */}
            {form.sessionNotes && (
              <div>
                <p className="text-[11px] font-semibold text-[color:var(--aw-text-muted)] uppercase tracking-wide mb-1">Consultation Notes</p>
                <textarea
                  readOnly
                  rows={3}
                  value={form.sessionNotes}
                  className="input-field text-xs py-2 w-full resize-y bg-white"
                />
              </div>
            )}

            {/* AI summary — generated from the transcript, editable, saved on Save */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-semibold text-[color:var(--aw-text-muted)] uppercase tracking-wide">AI Summary</p>
                <button
                  type="button"
                  onClick={handleSummarize}
                  disabled={summarizing || (!form.callTranscript?.trim() && !form.sessionNotes?.trim())}
                  className="text-[11px] font-semibold text-[color:var(--aw-navy)] border border-[color:var(--aw-border)] rounded px-2 py-1 hover:bg-white disabled:opacity-50"
                >
                  {summarizing ? 'Summarizing…' : 'Summarize transcript → notes'}
                </button>
              </div>
              <textarea
                rows={5}
                value={form.callSummary || ''}
                onChange={e => updateForm({ callSummary: e.target.value })}
                placeholder="Click “Summarize” to generate a structured summary from the transcript, or type one. Saved with the booking."
                className="input-field text-xs py-2 w-full resize-y bg-white"
              />
            </div>
          </div>
        )}

        {/* Client */}
        <div>
          <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Client</label>
          <select
            className="input-field text-sm py-2"
            value={form.clientId || ''}
            onChange={e => {
              const cid = e.target.value;
              const cl = clients.find(x => x.id === cid);
              // Auto-fill the client name when an existing client is picked
              updateForm({ clientId: cid || null, ...(cl ? { clientName: cl.name } : {}) });
            }}
          >
            <option value="">Walk-in / None</option>
            {clients.map(cl => <option key={cl.id} value={cl.id}>{cl.name} ({cl.clientId})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Client Name <span className="text-[color:var(--aw-danger)]">*</span></label>
          <input className="input-field text-sm py-2" value={form.clientName || ''} onChange={e => updateForm({ clientName: e.target.value })} placeholder="Name (required)" />
        </div>

        {/* Type & Purpose */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Type</label>
            <select className="input-field text-sm py-2" value={form.type || 'in_person'} onChange={e => updateForm({ type: e.target.value as Consultation['type'] })}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Purpose</label>
            <select className="input-field text-sm py-2" value={form.purpose || 'custom_design'} onChange={e => updateForm({ purpose: e.target.value as Consultation['purpose'] })}>
              {Object.entries(PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {/* Date, Time, Duration — now bound to separate scheduledDate / scheduledTime fields */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Date <span className="text-[color:var(--aw-danger)]">*</span></label>
            <input
              type="date"
              className="input-field text-sm py-2"
              value={form.scheduledDate || ''}
              onChange={e => updateForm({ scheduledDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Time</label>
            <input
              type="time"
              className="input-field text-sm py-2"
              value={form.scheduledTime || ''}
              onChange={e => updateForm({ scheduledTime: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Duration</label>
            <select className="input-field text-sm py-2" value={form.duration || 30} onChange={e => updateForm({ duration: Number(e.target.value) })}>
              {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
        </div>

        {/* Staff */}
        <div>
          <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Assigned To</label>
          <input className="input-field text-sm py-2" value={form.assignedTo || ''} onChange={e => updateForm({ assignedTo: e.target.value })} placeholder="Staff member" />
        </div>

        {/* Status (detail only) */}
        {isDetail && (
          <div>
            <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Status</label>
            <select className="input-field text-sm py-2" value={form.status || 'scheduled'} onChange={e => updateForm({ status: e.target.value as Consultation['status'] })}>
              {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
        )}

        {/* Pre-Notes */}
        <div>
          <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Pre-Notes</label>
          <textarea className="input-field text-sm py-2" rows={2} value={form.preNotes || ''} onChange={e => updateForm({ preNotes: e.target.value })} placeholder="Notes before the session" />
        </div>

        {/* Detail-only fields */}
        {isDetail && (
          <>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Session Notes</label>
              <textarea className="input-field text-sm py-2" rows={3} value={form.sessionNotes || ''} onChange={e => updateForm({ sessionNotes: e.target.value })} placeholder="Notes during / after session" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Outcome</label>
                <select className="input-field text-sm py-2" value={form.outcome || ''} onChange={e => updateForm({ outcome: e.target.value as Consultation['outcome'] })}>
                  <option value="">None</option>
                  <option value="booked_order">Booked Order</option>
                  <option value="follow_up_needed">Follow-up Needed</option>
                  <option value="no_action">No Action</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Follow-up Date</label>
                <input type="date" className="input-field text-sm py-2" value={form.followUpDate || ''} onChange={e => updateForm({ followUpDate: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">AI Summary</label>
              <textarea className="input-field text-sm py-2 bg-[color:var(--aw-surface-muted)]" rows={2} value={form.aiSummary || ''} onChange={e => updateForm({ aiSummary: e.target.value })} placeholder="AI-generated summary will appear here" />
            </div>
          </>
        )}
      </div>
    );
  }

  /* ── main render ── */
  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Consultations</h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">Booking management</p>
        </div>
        <button className="btn-primary text-base px-6 py-2.5" onClick={openSchedule}>+ Schedule Consultation</button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Today" value={stats.todayCount} />
        <StatCard label="Upcoming" value={stats.upcoming} />
        <StatCard label="Completed" value={stats.completed} />
      </div>

      {/* Error */}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-[color:var(--aw-cream)] rounded-lg p-1 w-fit mb-6">
        {(['calendar', 'list'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white text-[color:var(--aw-text-strong)] shadow-sm' : 'text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'}`}>
            {t === 'calendar' ? 'Calendar View' : 'List View'}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : tab === 'calendar' ? (
        // Called inline (not <CalendarView/>) so the inputs it renders keep
        // focus across re-renders — see ModalFields note below.
        CalendarView()
      ) : (
        ListView()
      )}

      {/* Schedule / Detail Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-7 w-full max-w-lg mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] mb-5" style={{ fontFamily: 'var(--font-heading)' }}>
              {modal === 'schedule' ? 'Schedule Consultation' : 'Consultation Details'}
            </h2>
            {/* Inline call, NOT <ModalFields/>. Mounting it as a component
                makes it a fresh component type every render, so React
                unmounts/remounts every <input> and focus is lost after
                each keystroke. Calling it inline keeps the inputs stable. */}
            {ModalFields({ isDetail: modal === 'detail' })}
            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-outline text-sm px-5 py-2" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary text-sm px-5 py-2" onClick={save} disabled={saving || !form.clientName?.trim() || !form.scheduledDate}>
                {saving ? 'Saving...' : modal === 'schedule' ? 'Schedule' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
