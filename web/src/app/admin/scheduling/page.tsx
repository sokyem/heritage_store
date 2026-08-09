'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

/* ── types ── */
interface Consultation {
  id: string;
  consultId: string;
  clientName: string;
  type: string;
  purpose: string;
  dateTime?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  duration: number;
  assignedTo: string;
  status: string;
}

interface Fitting {
  id: string;
  type: string;
  scheduledDate: string;
  scheduledTime: string | null;
  duration: number;
  status: string;
  fitter: string | null;
  location: string | null;
  customOrder?: {
    orderId?: string;
    client?: { name: string };
  } | null;
}

interface CalendarEvent {
  id: string;
  time: string;
  type: 'consultation' | 'fitting' | 'deadline';
  clientName: string;
  staff: string;
  status: string;
  details: string;
}

/* ── helpers ── */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function parseDate(item: Consultation | Fitting): Date {
  if ('dateTime' in item && item.dateTime) return new Date(item.dateTime);
  if ('scheduledDate' in item && item.scheduledDate) return new Date(item.scheduledDate);
  return new Date();
}

function fmtTime(dateStr: string | null | undefined, timeStr?: string | null): string {
  if (timeStr) return timeStr;
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  consultation: { dot: '#3B82F6', bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'Consultation' },
  fitting: { dot: '#8B5CF6', bg: 'bg-purple-50 text-purple-700 border-purple-200', text: 'Fitting' },
  deadline: { dot: '#DC2626', bg: 'bg-red-50 text-red-700 border-red-200', text: 'Deadline' },
};

/* ── component ── */
export default function SchedulingPage() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [fittings, setFittings] = useState<Fitting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<Date>(today);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cRes, fRes] = await Promise.all([
        fetch('/api/admin/consultations'),
        fetch('/api/admin/fittings'),
      ]);
      if (!cRes.ok) throw new Error('Failed to load consultations');
      if (!fRes.ok) throw new Error('Failed to load fittings');
      setConsultations(await cRes.json());
      setFittings(await fRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── build events map ── */
  const eventsMap = useMemo(() => {
    const map: Record<string, { consultations: number; fittings: number; deadlines: number; events: CalendarEvent[] }> = {};

    const getKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

    for (const c of consultations) {
      const d = parseDate(c);
      const key = getKey(d);
      if (!map[key]) map[key] = { consultations: 0, fittings: 0, deadlines: 0, events: [] };
      map[key].consultations++;
      map[key].events.push({
        id: c.id,
        time: fmtTime(c.dateTime || c.scheduledDate, c.scheduledTime),
        type: 'consultation',
        clientName: c.clientName || 'Walk-in',
        staff: c.assignedTo || '--',
        status: c.status,
        details: `${c.type} - ${c.purpose}`,
      });
    }

    for (const f of fittings) {
      const d = parseDate(f);
      const key = getKey(d);
      if (!map[key]) map[key] = { consultations: 0, fittings: 0, deadlines: 0, events: [] };
      map[key].fittings++;
      map[key].events.push({
        id: f.id,
        time: fmtTime(f.scheduledDate, f.scheduledTime),
        type: 'fitting',
        clientName: f.customOrder?.client?.name || 'Unknown',
        staff: f.fitter || '--',
        status: f.status,
        details: `${f.type} fitting${f.location ? ' @ ' + f.location : ''}`,
      });
    }

    return map;
  }, [consultations, fittings]);

  /* ── calendar grid ── */
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfWeek(currentYear, currentMonth);

  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [daysInMonth, firstDay]);

  /* ── nav ── */
  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  }
  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  }
  function goToday() {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDay(today);
  }

  /* ── selected day events ── */
  const selectedKey = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
  const selectedEvents = eventsMap[selectedKey]?.events || [];

  return (
    <div className="p-8 lg:p-10 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[color:var(--aw-text-strong)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Scheduling</h1>
        <p className="text-base text-[color:var(--aw-text-muted)]">Calendar overview</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">{error}</div>}

      {loading ? (
        <div className="loading-spinner mx-auto mt-8" />
      ) : (
        <>
          {/* Calendar */}
          <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm p-6 mb-6">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <button onClick={prevMonth} className="text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 px-3 py-1.5 rounded text-sm font-medium transition-colors">&larr;</button>
                <h2 className="text-lg font-semibold text-[color:var(--aw-text-strong)] min-w-[200px] text-center" style={{ fontFamily: 'var(--font-heading)' }}>
                  {MONTHS[currentMonth]} {currentYear}
                </h2>
                <button onClick={nextMonth} className="text-[color:var(--aw-text-strong)] hover:bg-[color:var(--aw-navy)]/10 px-3 py-1.5 rounded text-sm font-medium transition-colors">&rarr;</button>
              </div>
              <button onClick={goToday} className="btn-outline text-sm px-4 py-1.5">Today</button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map(w => (
                <div key={w} className="text-center text-xs font-semibold uppercase tracking-wider text-[color:var(--aw-text-muted)] py-2">{w}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((day, i) => {
                if (day === null) return <div key={`e-${i}`} className="min-h-[80px]" />;

                const cellDate = new Date(currentYear, currentMonth, day);
                const key = `${currentYear}-${currentMonth}-${day}`;
                const data = eventsMap[key];
                const isToday = isSameDay(cellDate, today);
                const isSelected = isSameDay(cellDate, selectedDay);

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(cellDate)}
                    className={`min-h-[80px] rounded-lg border text-left p-2 transition-colors hover:bg-[color:var(--aw-surface-muted)] ${
                      isToday ? 'border-[#C41E3A] border-2' : isSelected ? 'border-[color:var(--aw-navy)] bg-[color:var(--aw-bg)]' : 'border-[color:var(--aw-border)]'
                    }`}
                  >
                    <span className={`text-sm font-medium ${isToday ? 'text-[color:var(--aw-danger)]' : 'text-[color:var(--aw-text-strong)]'}`}>{day}</span>
                    {data && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {data.consultations > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-blue-600">
                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                            {data.consultations}
                          </span>
                        )}
                        {data.fittings > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-purple-600">
                            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                            {data.fittings}
                          </span>
                        )}
                        {data.deadlines > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-red-600">
                            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                            {data.deadlines}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-5 mt-4 pt-4 border-t border-[color:var(--aw-border)]">
              {Object.entries(TYPE_COLORS).map(([key, val]) => (
                <span key={key} className="flex items-center gap-1.5 text-xs text-[color:var(--aw-text-muted)]">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: val.dot }} />
                  {val.text}
                </span>
              ))}
            </div>
          </div>

          {/* Today's Schedule */}
          <div className="bg-white rounded-lg border border-[color:var(--aw-border)] shadow-sm p-6">
            <h3 className="text-base font-semibold text-[color:var(--aw-text-strong)] mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              {isSameDay(selectedDay, today) ? "Today's Schedule" : `Schedule for ${selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
            </h3>

            {selectedEvents.length === 0 ? (
              <p className="text-sm text-[color:var(--aw-text-muted)] py-8 text-center">No events scheduled for this day</p>
            ) : (
              <div className="space-y-3">
                {selectedEvents
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map(ev => (
                    <div key={ev.id} className="flex items-center gap-4 p-4 rounded-lg border border-[color:var(--aw-border)] bg-[color:var(--aw-bg)] hover:bg-[color:var(--aw-cream)] transition-colors">
                      {/* Time */}
                      <div className="min-w-[70px] text-sm font-semibold text-[color:var(--aw-text-strong)]">{ev.time}</div>

                      {/* Type badge */}
                      <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${TYPE_COLORS[ev.type].bg}`}>
                        {TYPE_COLORS[ev.type].text}
                      </span>

                      {/* Client */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#2D2D2D] truncate">{ev.clientName}</p>
                        <p className="text-xs text-[color:var(--aw-text-muted)] truncate">{ev.details}</p>
                      </div>

                      {/* Staff */}
                      <div className="text-sm text-[color:var(--aw-text-muted)] min-w-[80px]">{ev.staff}</div>

                      {/* Status */}
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-[color:var(--aw-cream)] text-[color:var(--aw-text-muted)] capitalize">
                        {ev.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
