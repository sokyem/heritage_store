'use client';

import { useEffect, useState, useCallback } from 'react';

interface Slot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  type: string;
  isAvailable: boolean;
  maxBookings: number;
  notes: string | null;
  currentBookings?: number;
  isFull?: boolean;
  createdAt: string;
}

interface Booking {
  id: string;
  slotId: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  meetingLink: string | null;
  status: string;
  createdAt: string;
  slot: Slot;
}

const SLOT_TYPES = [
  { value: 'virtual', label: 'Virtual' },
  { value: 'in_person', label: 'In-Person' },
  { value: 'phone', label: 'Phone' },
];

const DURATIONS = [15, 30, 45, 60, 90];

function formatDate(iso: string) {
  // Slot dates are calendar dates stored at midnight UTC. Render in UTC so a
  // June 19 slot doesn't display as June 18 in a behind-UTC timezone (this was
  // the date mismatch vs the Consultations page, which reads it as UTC).
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function SlotManagementPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'slots' | 'bookings'>('slots');

  // Per-booking action feedback (copy link / send text)
  const [smsBusy, setSmsBusy] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // Reschedule flow
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [rescheduleSlotId, setRescheduleSlotId] = useState('');
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleMode, setRescheduleMode] = useState<'pick' | 'custom'>('pick');
  const [rescheduleCustom, setRescheduleCustom] = useState({
    date: '',
    startTime: '09:00',
    endTime: '',
    type: '' as '' | 'virtual' | 'in_person' | 'phone',
  });
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleNote, setRescheduleNote] = useState('');
  const [rescheduleMetaKey, setRescheduleMetaKey] = useState('');
  const [rescheduleMetaValue, setRescheduleMetaValue] = useState('');

  // Bulk-select for slot deletion
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Create slot form
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: '',
    startTime: '09:00',
    endTime: '09:30',
    duration: 30,
    type: 'virtual',
    maxBookings: 1,
    notes: '',
  });

  // Bulk create state
  const [showBulk, setShowBulk] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    dateFrom: '',
    dateTo: '',
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 30,
    breakBetween: 0,
    type: 'virtual',
    maxBookings: 1,
    // Which weekdays the admin is available (0=Sun … 6=Sat). Default Mon–Fri.
    weekdays: [1, 2, 3, 4, 5] as number[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [slotsRes, bookingsRes] = await Promise.all([
        fetch('/api/consultation-slots?available=false'),
        fetch('/api/consultation-bookings'),
      ]);
      if (!slotsRes.ok) throw new Error('Failed to load slots');
      setSlots(await slotsRes.json());
      if (bookingsRes.ok) setBookings(await bookingsRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createSlot() {
    if (!form.date || !form.startTime || !form.endTime) return;
    setSaving(true);
    try {
      const res = await fetch('/api/consultation-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to create slot');
      setShowCreate(false);
      setForm({ date: '', startTime: '09:00', endTime: '09:30', duration: 30, type: 'virtual', maxBookings: 1, notes: '' });
      load();
    } catch {
      setError('Failed to create slot');
    } finally {
      setSaving(false);
    }
  }

  async function createBulkSlots() {
    if (!bulkForm.dateFrom || !bulkForm.dateTo || !bulkForm.startTime || !bulkForm.endTime) return;
    if (bulkForm.weekdays.length === 0) { setError('Pick at least one day of the week.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/consultation-slots/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create slots');
      setShowBulk(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create bulk slots');
    } finally {
      setSaving(false);
    }
  }

  async function toggleSlot(id: string, isAvailable: boolean) {
    await fetch('/api/consultation-slots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isAvailable: !isAvailable }),
    });
    load();
  }

  async function deleteSlot(id: string) {
    if (!confirm('Delete this slot? Any bookings will also be removed.')) return;
    await fetch(`/api/consultation-slots?id=${id}`, { method: 'DELETE' });
    load();
  }

  // Open the video room for a booking, joining as the Awula designer.
  function joinConsultation(meetingLink: string) {
    const sep = meetingLink.includes('?') ? '&' : '?';
    window.open(`${meetingLink}${sep}name=${encodeURIComponent('Awula Designer')}`, '_blank', 'noopener');
  }

  // Start an ad-hoc consultation room with no prior booking.
  // Provisions a Daily.co room server-side so we never fall back to the
  // login-walled Jitsi page.
  async function startInstantConsultation() {
    try {
      const res = await fetch('/api/admin/instant-consult', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start instant consultation');
      window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not start instant consultation');
    }
  }

  // Copy the full public meeting link so it can be pasted into a text/chat.
  async function copyLink(meetingLink: string, bookingId: string) {
    const url = `${window.location.origin}${meetingLink}`;
    try {
      await navigator.clipboard.writeText(url);
      setRowMsg({ id: bookingId, text: 'Link copied — paste it into a text to the client', ok: true });
    } catch {
      setRowMsg({ id: bookingId, text: `Copy failed. Link: ${url}`, ok: false });
    }
  }

  // Submit a reschedule — either to an existing open slot, or to a custom
  // date/time typed by the admin (the API will create a one-off slot for it).
  async function doReschedule() {
    if (!rescheduleBooking) return;
    setRescheduleBusy(true);
    setRescheduleError('');
    try {
      const customKey = rescheduleMetaKey.trim();
      const customValue = rescheduleMetaValue.trim();
      const customData = customKey
        ? { [customKey]: customValue }
        : undefined;
      const metadata: Record<string, unknown> = {
        ...(rescheduleReason.trim() ? { rescheduleReason: rescheduleReason.trim() } : {}),
        ...(rescheduleNote.trim() ? { rescheduleNote: rescheduleNote.trim() } : {}),
        ...(customData ? { customData } : {}),
      };
      let payload: Record<string, unknown>;
      if (rescheduleMode === 'pick') {
        if (!rescheduleSlotId) {
          setRescheduleError('Pick a slot or switch to "Custom date / time".');
          setRescheduleBusy(false);
          return;
        }
        payload = { newSlotId: rescheduleSlotId, ...metadata };
      } else {
        if (!rescheduleCustom.date || !rescheduleCustom.startTime) {
          setRescheduleError('Enter a date and start time.');
          setRescheduleBusy(false);
          return;
        }
        payload = {
          customDate: rescheduleCustom.date,
          customStartTime: rescheduleCustom.startTime,
          ...(rescheduleCustom.endTime ? { customEndTime: rescheduleCustom.endTime } : {}),
          ...(rescheduleCustom.type ? { customType: rescheduleCustom.type } : {}),
          ...metadata,
        };
      }
      const res = await fetch(`/api/consultation-bookings/${rescheduleBooking.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reschedule failed');
      const texted = data?.notification?.smsSent;
      setRowMsg({
        id: rescheduleBooking.id,
        text: texted ? 'Rescheduled — client texted the new time' : 'Booking rescheduled',
        ok: true,
      });
      closeRescheduleModal();
      load();
    } catch (e) {
      setRescheduleError(e instanceof Error ? e.message : 'Reschedule failed');
    } finally {
      setRescheduleBusy(false);
    }
  }

  // Open the reschedule modal for a booking. Always refreshes slots first so
  // anything just created in another tab shows up immediately.
  function openRescheduleModal(booking: Booking) {
    setRescheduleBooking(booking);
    setRescheduleSlotId('');
    setRescheduleError('');
    setRescheduleMode('pick');
    setRescheduleCustom({ date: '', startTime: '09:00', endTime: '', type: '' });
    setRescheduleReason('');
    setRescheduleNote('');
    setRescheduleMetaKey('');
    setRescheduleMetaValue('');
    load();
  }

  function closeRescheduleModal() {
    setRescheduleBooking(null);
    setRescheduleSlotId('');
    setRescheduleError('');
    setRescheduleMode('pick');
    setRescheduleCustom({ date: '', startTime: '09:00', endTime: '', type: '' });
    setRescheduleReason('');
    setRescheduleNote('');
    setRescheduleMetaKey('');
    setRescheduleMetaValue('');
  }

  // ── Bulk delete slots ──
  function toggleSlotSelected(id: string) {
    setSelectedSlotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDateGroupSelected(dateKey: string, on: boolean) {
    const ids = slots
      .filter((s) => new Date(s.date).toISOString().slice(0, 10) === dateKey)
      .map((s) => s.id);
    setSelectedSlotIds((prev) => {
      const next = new Set(prev);
      if (on) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function clearSlotSelection() {
    setSelectedSlotIds(new Set());
  }

  async function bulkDeleteSelectedSlots() {
    if (selectedSlotIds.size === 0) return;
    if (!confirm(`Delete ${selectedSlotIds.size} slot(s)? Any bookings on them will also be removed.`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedSlotIds).join(',');
      const res = await fetch(`/api/consultation-slots?ids=${encodeURIComponent(ids)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Bulk delete failed');
      }
      clearSlotSelection();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  }

  // Re-send the confirmation email (with the video link + details) to the client.
  async function emailClient(booking: Booking) {
    if (!booking.customerEmail) {
      setRowMsg({ id: booking.id, text: 'No email on this booking', ok: false });
      return;
    }
    setEmailBusy(booking.id);
    setRowMsg(null);
    try {
      const res = await fetch(`/api/consultation-bookings/${booking.id}/email`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');
      setRowMsg({
        id: booking.id,
        text: data.mocked
          ? 'Email not configured — message was logged, not delivered'
          : `Email sent to ${data.sentTo}`,
        ok: !data.mocked,
      });
    } catch (e) {
      setRowMsg({ id: booking.id, text: e instanceof Error ? e.message : 'Failed to send email', ok: false });
    } finally {
      setEmailBusy(null);
    }
  }

  // Re-send the confirmation text (with the video link + details) to the client.
  async function textClient(booking: Booking) {
    if (!booking.customerPhone) {
      setRowMsg({ id: booking.id, text: 'No phone number on this booking', ok: false });
      return;
    }
    setSmsBusy(booking.id);
    setRowMsg(null);
    try {
      const res = await fetch(`/api/consultation-bookings/${booking.id}/sms`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send text');
      setRowMsg({
        id: booking.id,
        text: data.mocked
          ? 'SMS not configured — text was logged, not delivered'
          : `Text sent to ${data.sentTo}`,
        ok: !data.mocked,
      });
    } catch (e) {
      setRowMsg({ id: booking.id, text: e instanceof Error ? e.message : 'Failed to send text', ok: false });
    } finally {
      setSmsBusy(null);
    }
  }

  // Group slots by date for display
  const slotsByDate = slots.reduce<Record<string, Slot[]>>((acc, slot) => {
    const dateKey = new Date(slot.date).toISOString().split('T')[0];
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(slot);
    return acc;
  }, {});

  // The availability view shows TODAY and FUTURE only — past dates (incl. past
  // booked slots kept for history) would otherwise bury newly created slots
  // under months of old entries. Past consultations live in the Bookings tab.
  const todayKey = (() => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())).toISOString().slice(0, 10);
  })();
  const sortedDates = Object.keys(slotsByDate).filter((d) => d >= todayKey).sort();

  const totalSlots = slots.length;
  const availableSlots = slots.filter(s => s.isAvailable && !s.isFull).length;
  const bookedCount = bookings.filter(b => b.status === 'confirmed').length;

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
            Consultation Slots
          </h1>
          <p className="text-base text-[color:var(--aw-text-muted)]">Manage available time slots for customer bookings</p>
        </div>
        <div className="flex gap-3">
          <button
            className="text-sm px-5 py-2.5 rounded-lg font-medium text-white transition-colors"
            style={{ backgroundColor: '#22C55E' }}
            onClick={startInstantConsultation}
          >
            ▶ Start Instant Consultation
          </button>
          <button className="btn-outline text-sm px-5 py-2.5" onClick={() => { setShowBulk(true); setShowCreate(false); }}>
            + Bulk Create
          </button>
          <button className="btn-primary text-sm px-5 py-2.5" onClick={() => { setShowCreate(true); setShowBulk(false); }}>
            + Add Slot
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm p-5 flex-1 min-w-[140px]">
          <p className="text-sm text-[color:var(--aw-text-muted)] mb-1">Total Slots</p>
          <p className="text-2xl font-semibold text-[color:var(--aw-text-strong)]">{totalSlots}</p>
        </div>
        <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm p-5 flex-1 min-w-[140px]">
          <p className="text-sm text-[color:var(--aw-text-muted)] mb-1">Available</p>
          <p className="text-2xl font-semibold text-green-600">{availableSlots}</p>
        </div>
        <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm p-5 flex-1 min-w-[140px]">
          <p className="text-sm text-[color:var(--aw-text-muted)] mb-1">Booked</p>
          <p className="text-2xl font-semibold text-[color:var(--aw-danger)]">{bookedCount}</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">{error}</div>}

      {/* Create Single Slot Modal */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-[color:var(--aw-border)] shadow-sm p-6 mb-6">
          <h3 className="text-base font-semibold text-[color:var(--aw-text-strong)] mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Create Slot</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Date</label>
              <input type="date" className="input-field text-sm py-2" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Start Time</label>
              <input type="time" className="input-field text-sm py-2" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">End Time</label>
              <input type="time" className="input-field text-sm py-2" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Duration</label>
              <select className="input-field text-sm py-2" value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })}>
                {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Type</label>
              <select className="input-field text-sm py-2" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {SLOT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Max Bookings</label>
              <input type="number" min="1" className="input-field text-sm py-2" value={form.maxBookings} onChange={e => setForm({ ...form, maxBookings: Number(e.target.value) })} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Notes</label>
              <input className="input-field text-sm py-2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button className="btn-outline text-sm px-4 py-2" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn-primary text-sm px-4 py-2" onClick={createSlot} disabled={saving || !form.date}>
              {saving ? 'Creating...' : 'Create Slot'}
            </button>
          </div>
        </div>
      )}

      {/* Bulk Create Modal */}
      {showBulk && (
        <div className="bg-white rounded-xl border border-[color:var(--aw-border)] shadow-sm p-6 mb-6">
          <h3 className="text-base font-semibold text-[color:var(--aw-text-strong)] mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Bulk Create Slots</h3>
          <p className="text-sm text-[color:var(--aw-text-muted)] mb-4">Generate multiple slots across a date range. Slots will be created at regular intervals during the specified hours.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">From Date</label>
              <input type="date" className="input-field text-sm py-2" value={bulkForm.dateFrom} onChange={e => setBulkForm({ ...bulkForm, dateFrom: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">To Date</label>
              <input type="date" className="input-field text-sm py-2" value={bulkForm.dateTo} onChange={e => setBulkForm({ ...bulkForm, dateTo: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Day Start</label>
              <input type="time" className="input-field text-sm py-2" value={bulkForm.startTime} onChange={e => setBulkForm({ ...bulkForm, startTime: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Day End</label>
              <input type="time" className="input-field text-sm py-2" value={bulkForm.endTime} onChange={e => setBulkForm({ ...bulkForm, endTime: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Slot Duration</label>
              <select className="input-field text-sm py-2" value={bulkForm.slotDuration} onChange={e => setBulkForm({ ...bulkForm, slotDuration: Number(e.target.value) })}>
                {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Break Between (min)</label>
              <input type="number" min="0" className="input-field text-sm py-2" value={bulkForm.breakBetween} onChange={e => setBulkForm({ ...bulkForm, breakBetween: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1">Type</label>
              <select className="input-field text-sm py-2" value={bulkForm.type} onChange={e => setBulkForm({ ...bulkForm, type: e.target.value })}>
                {SLOT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="block text-sm font-medium text-[color:var(--aw-text-muted)] mb-1.5">Available on</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' },
                  { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
                ].map(({ v, l }) => {
                  const on = bulkForm.weekdays.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBulkForm({
                        ...bulkForm,
                        weekdays: on ? bulkForm.weekdays.filter(d => d !== v) : [...bulkForm.weekdays, v],
                      })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${on
                        ? 'bg-[color:var(--aw-accent,#1B2A5B)] text-white border-transparent'
                        : 'bg-white text-[color:var(--aw-text-strong)] border-[color:var(--aw-border)] hover:bg-[color:var(--aw-surface-muted)]'}`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[color:var(--aw-text-muted)] mt-1.5">Slots are generated only on the selected days within the date range — e.g. pick Tue, Thu, Sat for those days each week.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button className="btn-outline text-sm px-4 py-2" onClick={() => setShowBulk(false)}>Cancel</button>
            <button className="btn-primary text-sm px-4 py-2" onClick={createBulkSlots} disabled={saving || !bulkForm.dateFrom || !bulkForm.dateTo}>
              {saving ? 'Creating...' : 'Create Slots'}
            </button>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeRescheduleModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header (sticky-feeling: stays put while body scrolls) */}
            <div className="p-6 pb-3 border-b border-[color:var(--aw-border)]">
              <button
                type="button"
                onClick={closeRescheduleModal}
                aria-label="Close"
                className="absolute top-3 right-3 p-2 rounded-lg text-[color:var(--aw-text-muted)] hover:bg-[color:var(--aw-cream)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h3 className="text-base font-semibold text-[color:var(--aw-text-strong)] mb-1 pr-8" style={{ fontFamily: 'var(--font-heading)' }}>
                Reschedule Consultation
              </h3>
              <p className="text-sm text-[color:var(--aw-text-muted)]">
                {rescheduleBooking.customerName || 'Booking'} — currently{' '}
                {formatDate(rescheduleBooking.slot.date)} at {rescheduleBooking.slot.startTime}.
                The client is texted the new time automatically.
              </p>

              {/* Mode tabs */}
              <div className="flex gap-1 bg-[color:var(--aw-cream)] rounded-lg p-1 mt-4 w-fit">
                <button
                  type="button"
                  onClick={() => setRescheduleMode('pick')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    rescheduleMode === 'pick'
                      ? 'bg-white text-[color:var(--aw-text-strong)] shadow-sm'
                      : 'text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'
                  }`}
                >
                  Pick open slot
                </button>
                <button
                  type="button"
                  onClick={() => setRescheduleMode('custom')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    rescheduleMode === 'custom'
                      ? 'bg-white text-[color:var(--aw-text-strong)] shadow-sm'
                      : 'text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'
                  }`}
                >
                  Custom date / time
                </button>
              </div>
            </div>

            {/* Body (scrolls) */}
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {rescheduleError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-3">
                  {rescheduleError}
                </div>
              )}

              {/* Reschedule metadata — applies to both pick + custom modes.
                  Reason and note get appended to the booking's callNotes and
                  recorded in the audit log; the optional key/value pair is
                  stored as structured JSON metadata. */}
              <div className="space-y-3 mb-4">
                <div>
                  <label htmlFor="reschedule-reason" className="block text-xs font-semibold uppercase tracking-wide text-[color:var(--aw-text-muted)] mb-1">
                    Reschedule reason <span className="font-normal normal-case text-[color:var(--aw-text-muted)]">(optional)</span>
                  </label>
                  <input
                    id="reschedule-reason"
                    type="text"
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                    placeholder="Client requested a different time"
                    className="input-field text-sm py-2 w-full"
                  />
                </div>
                <div>
                  <label htmlFor="reschedule-note" className="block text-xs font-semibold uppercase tracking-wide text-[color:var(--aw-text-muted)] mb-1">
                    Admin note <span className="font-normal normal-case text-[color:var(--aw-text-muted)]">(optional)</span>
                  </label>
                  <textarea
                    id="reschedule-note"
                    value={rescheduleNote}
                    onChange={(e) => setRescheduleNote(e.target.value)}
                    rows={2}
                    placeholder="Internal note saved with this reschedule"
                    className="input-field text-sm py-2 w-full"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reschedule-custom-key" className="block text-xs font-semibold uppercase tracking-wide text-[color:var(--aw-text-muted)] mb-1">
                      Custom field key
                    </label>
                    <input
                      id="reschedule-custom-key"
                      type="text"
                      value={rescheduleMetaKey}
                      onChange={(e) => setRescheduleMetaKey(e.target.value)}
                      placeholder="e.g. source"
                      className="input-field text-sm py-2 w-full"
                    />
                  </div>
                  <div>
                    <label htmlFor="reschedule-custom-value" className="block text-xs font-semibold uppercase tracking-wide text-[color:var(--aw-text-muted)] mb-1">
                      Custom field value
                    </label>
                    <input
                      id="reschedule-custom-value"
                      type="text"
                      value={rescheduleMetaValue}
                      onChange={(e) => setRescheduleMetaValue(e.target.value)}
                      placeholder="e.g. whatsapp"
                      className="input-field text-sm py-2 w-full"
                    />
                  </div>
                </div>
              </div>

              {rescheduleMode === 'pick' ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wider text-[color:var(--aw-text-muted)] font-medium">
                      Open slots
                    </span>
                    <button
                      type="button"
                      onClick={() => load()}
                      className="text-xs font-medium text-[color:var(--aw-navy)] hover:underline"
                    >
                      Refresh
                    </button>
                  </div>
                  {(() => {
                    const open = slots
                      .filter((s) => s.isAvailable && !s.isFull && s.id !== rescheduleBooking.slotId)
                      .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
                    if (open.length === 0) {
                      return (
                        <p className="text-sm text-[color:var(--aw-text-muted)] py-4">
                          No other open slots available. Switch to <em>Custom date / time</em> to set a one-off
                          time, or create a slot first and tap <em>Refresh</em>.
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-2">
                        {open.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setRescheduleSlotId(s.id)}
                            className={`w-full text-left px-4 py-2.5 rounded-lg border-2 transition-colors ${
                              rescheduleSlotId === s.id
                                ? 'border-[#C41E3A] bg-[color:var(--aw-danger)]/5'
                                : 'border-gray-200 hover:border-[color:var(--aw-navy)]'
                            }`}
                          >
                            <span className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{formatDate(s.date)}</span>
                            <span className="text-sm text-[color:var(--aw-text-muted)]">
                              {' '}· {s.startTime}–{s.endTime} · {s.duration} min ·{' '}
                              {s.type === 'in_person' ? 'In-Person' : s.type.charAt(0).toUpperCase() + s.type.slice(1)}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-[color:var(--aw-text-muted)]">
                    Enter any date and start time the client prefers — a one-off slot will be created and the
                    booking moved to it.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">Date</label>
                      <input
                        type="date"
                        className="input-field text-sm py-2 w-full"
                        value={rescheduleCustom.date}
                        onChange={(e) => setRescheduleCustom({ ...rescheduleCustom, date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">Start Time</label>
                      <input
                        type="time"
                        className="input-field text-sm py-2 w-full"
                        value={rescheduleCustom.startTime}
                        onChange={(e) => setRescheduleCustom({ ...rescheduleCustom, startTime: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">
                        End Time <span className="text-[color:var(--aw-text-muted)]">(optional)</span>
                      </label>
                      <input
                        type="time"
                        className="input-field text-sm py-2 w-full"
                        value={rescheduleCustom.endTime}
                        onChange={(e) => setRescheduleCustom({ ...rescheduleCustom, endTime: e.target.value })}
                        placeholder="Auto from duration"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--aw-text-muted)] mb-1">
                        Type <span className="text-[color:var(--aw-text-muted)]">(optional)</span>
                      </label>
                      <select
                        className="input-field text-sm py-2 w-full"
                        value={rescheduleCustom.type}
                        onChange={(e) => setRescheduleCustom({ ...rescheduleCustom, type: e.target.value as typeof rescheduleCustom.type })}
                      >
                        <option value="">Same as current ({rescheduleBooking.slot.type === 'in_person' ? 'In-Person' : rescheduleBooking.slot.type})</option>
                        {SLOT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky footer with the confirm button */}
            <div className="px-6 py-4 border-t border-[color:var(--aw-border)] bg-white rounded-b-xl flex justify-end gap-3">
              <button className="btn-outline text-sm px-4 py-2" onClick={closeRescheduleModal}>
                Cancel
              </button>
              <button
                className="btn-primary text-sm px-4 py-2"
                onClick={doReschedule}
                disabled={
                  rescheduleBusy ||
                  (rescheduleMode === 'pick' && !rescheduleSlotId) ||
                  (rescheduleMode === 'custom' && (!rescheduleCustom.date || !rescheduleCustom.startTime))
                }
              >
                {rescheduleBusy ? 'Rescheduling…' : 'Confirm Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[color:var(--aw-cream)] rounded-lg p-1 w-fit mb-6">
        <button onClick={() => setTab('slots')} className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'slots' ? 'bg-white text-[color:var(--aw-text-strong)] shadow-sm' : 'text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'}`}>
          Available Slots
        </button>
        <button onClick={() => setTab('bookings')} className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'bookings' ? 'bg-white text-[color:var(--aw-text-strong)] shadow-sm' : 'text-[color:var(--aw-text-muted)] hover:text-[color:var(--aw-text-strong)]'}`}>
          Bookings ({bookedCount})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[color:var(--aw-text-muted)]">Loading...</div>
      ) : tab === 'slots' ? (
        /* ── Slots grouped by date ── */
        sortedDates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg text-[color:var(--aw-text-muted)] mb-2">No consultation slots created yet</p>
            <p className="text-sm text-[color:var(--aw-text-muted)]">Create slots to allow customers to book consultation times</p>
          </div>
        ) : (
          <div className="space-y-6">
            {selectedSlotIds.size > 0 && (
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-[color:var(--aw-cream)] border border-[color:var(--aw-border)] rounded-lg px-4 py-2.5 shadow-sm">
                <span className="text-sm text-[color:var(--aw-text-strong)] font-medium">
                  {selectedSlotIds.size} slot{selectedSlotIds.size === 1 ? '' : 's'} selected
                </span>
                <div className="flex gap-2">
                  <button
                    className="text-xs font-medium px-3 py-1.5 rounded text-[color:var(--aw-text-muted)] hover:bg-white transition-colors"
                    onClick={clearSlotSelection}
                    disabled={bulkDeleting}
                  >
                    Clear
                  </button>
                  <button
                    className="text-xs font-semibold px-3 py-1.5 rounded text-white bg-[color:var(--aw-danger)] hover:opacity-90 transition-opacity disabled:opacity-50"
                    onClick={bulkDeleteSelectedSlots}
                    disabled={bulkDeleting}
                  >
                    {bulkDeleting ? 'Deleting…' : `Delete ${selectedSlotIds.size}`}
                  </button>
                </div>
              </div>
            )}
            {sortedDates.map(dateKey => {
              const dateSlots = slotsByDate[dateKey];
              const dateIds = dateSlots.map((s) => s.id);
              const allSelected = dateIds.length > 0 && dateIds.every((id) => selectedSlotIds.has(id));
              const someSelected = !allSelected && dateIds.some((id) => selectedSlotIds.has(id));
              return (
              <div key={dateKey} className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm overflow-hidden">
                <div className="bg-[color:var(--aw-surface-muted)] px-6 py-3 border-b border-[color:var(--aw-border)] flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select all slots on ${formatDate(dateKey)}`}
                    className="w-4 h-4 cursor-pointer accent-[color:var(--aw-danger)]"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={(e) => toggleDateGroupSelected(dateKey, e.target.checked)}
                  />
                  <h3 className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{formatDate(dateKey)}</h3>
                </div>
                <div className="divide-y divide-[#F0EBE3]">
                  {dateSlots
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map(slot => (
                      <div key={slot.id} className={`flex items-center gap-4 px-6 py-3 transition-colors ${selectedSlotIds.has(slot.id) ? 'bg-[color:var(--aw-danger)]/5' : 'hover:bg-[color:var(--aw-surface-muted)]'}`}>
                        {/* Bulk-select checkbox */}
                        <input
                          type="checkbox"
                          aria-label={`Select slot ${slot.startTime}`}
                          className="w-4 h-4 cursor-pointer accent-[color:var(--aw-danger)]"
                          checked={selectedSlotIds.has(slot.id)}
                          onChange={() => toggleSlotSelected(slot.id)}
                        />
                        {/* Time */}
                        <div className="min-w-[110px]">
                          <span className="text-sm font-semibold text-[color:var(--aw-text-strong)]">{slot.startTime}</span>
                          <span className="text-sm text-[color:var(--aw-text-muted)]"> – {slot.endTime}</span>
                        </div>

                        {/* Duration */}
                        <span className="text-xs text-[color:var(--aw-text-muted)] min-w-[60px]">{slot.duration} min</span>

                        {/* Type */}
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                          slot.type === 'virtual' ? 'bg-indigo-50 text-indigo-700' :
                          slot.type === 'phone' ? 'bg-teal-50 text-teal-700' :
                          'bg-orange-50 text-orange-700'
                        }`}>
                          {slot.type === 'in_person' ? 'In-Person' : slot.type.charAt(0).toUpperCase() + slot.type.slice(1)}
                        </span>

                        {/* Status */}
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${
                          slot.isFull ? 'bg-red-50 text-red-700 border-red-200'
                            : slot.isAvailable ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>
                          {slot.isFull ? 'Full' : slot.isAvailable ? 'Available' : 'Disabled'}
                        </span>

                        {/* Bookings count */}
                        <span className="text-xs text-[color:var(--aw-text-muted)] flex-1">
                          {slot.currentBookings || 0}/{slot.maxBookings} booked
                        </span>

                        {/* Notes */}
                        {slot.notes && <span className="text-xs text-[color:var(--aw-text-muted)] truncate max-w-[120px]">{slot.notes}</span>}

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => toggleSlot(slot.id, slot.isAvailable)}
                            className={`text-xs font-medium px-3 py-1 rounded transition-colors ${
                              slot.isAvailable
                                ? 'text-amber-700 hover:bg-amber-50'
                                : 'text-green-700 hover:bg-green-50'
                            }`}
                          >
                            {slot.isAvailable ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => deleteSlot(slot.id)} className="text-xs font-medium px-3 py-1 rounded text-[color:var(--aw-danger)] hover:bg-[color:var(--aw-danger)]/10 transition-colors">
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              );
            })}
          </div>
        )
      ) : (
        /* ── Bookings tab ── */
        <div className="bg-white rounded-lg shadow-sm border border-[color:var(--aw-border)] overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E8E3DB] bg-[color:var(--aw-surface-muted)]">
                {['Customer', 'Email', 'Phone', 'Date', 'Time', 'Type', 'Consultation', 'Status', 'Booked At'].map(h => (
                  <th key={h} className="text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] text-left px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id} className="border-b border-[color:var(--aw-border)] last:border-0 hover:bg-[color:var(--aw-surface-muted)] transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-[color:var(--aw-text-strong)]">{b.customerName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-[#2D2D2D]">{b.customerEmail || '—'}</td>
                  <td className="px-4 py-3 text-sm text-[#2D2D2D]">{b.customerPhone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-[#2D2D2D]">{formatDate(b.slot.date)}</td>
                  <td className="px-4 py-3 text-sm text-[color:var(--aw-text-strong)] font-medium">{b.slot.startTime} – {b.slot.endTime}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                      b.slot.type === 'virtual' ? 'bg-indigo-50 text-indigo-700' :
                      b.slot.type === 'phone' ? 'bg-teal-50 text-teal-700' :
                      'bg-orange-50 text-orange-700'
                    }`}>
                      {b.slot.type === 'in_person' ? 'In-Person' : b.slot.type.charAt(0).toUpperCase() + b.slot.type.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {b.meetingLink && b.status !== 'cancelled' ? (
                      <div className="flex flex-col gap-1.5 min-w-[170px]">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => joinConsultation(b.meetingLink!)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded text-white transition-colors"
                            style={{ backgroundColor: '#22C55E' }}
                          >
                            ▶ Start
                          </button>
                          <button
                            onClick={() => copyLink(b.meetingLink!, b.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded border border-[color:var(--aw-navy)] text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 transition-colors"
                          >
                            Copy Link
                          </button>
                          <button
                            onClick={() => emailClient(b)}
                            disabled={emailBusy === b.id || !b.customerEmail}
                            title={b.customerEmail ? `Email link to ${b.customerEmail}` : 'No email on this booking'}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded text-white transition-colors disabled:opacity-50"
                            style={{ backgroundColor: '#1B2A5B' }}
                          >
                            {emailBusy === b.id ? 'Sending…' : 'Email Client'}
                          </button>
                          <button
                            onClick={() => textClient(b)}
                            disabled={smsBusy === b.id || !b.customerPhone}
                            title={b.customerPhone ? `Text link to ${b.customerPhone}` : 'No phone on this booking'}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded border border-[color:var(--aw-navy)] text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 transition-colors disabled:opacity-50"
                          >
                            {smsBusy === b.id ? 'Sending…' : 'Text Client'}
                          </button>
                          <button
                            onClick={() => openRescheduleModal(b)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded border border-[#8B7569] text-[color:var(--aw-text-muted)] hover:bg-[#8B7569]/10 transition-colors"
                          >
                            Reschedule
                          </button>
                        </div>
                        {rowMsg?.id === b.id && (
                          <span className={`text-xs ${rowMsg.ok ? 'text-green-700' : 'text-[color:var(--aw-danger)]'}`}>
                            {rowMsg.text}
                          </span>
                        )}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${
                      b.status === 'confirmed' ? 'bg-green-50 text-green-700 border-green-200' :
                      b.status === 'completed' ? 'bg-gray-100 text-gray-600 border-gray-200' :
                      b.status === 'cancelled' ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[color:var(--aw-text-muted)]">{new Date(b.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-[color:var(--aw-text-muted)]">No bookings yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
