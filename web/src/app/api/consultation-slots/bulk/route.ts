import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// POST /api/consultation-slots/bulk
//
// Generate recurring availability in one request: for every date in
// [dateFrom, dateTo] whose weekday is selected (0=Sun … 6=Sat), create
// back-to-back slots from startTime to endTime. Lets the admin say "I'm
// available Tuesdays, Thursdays and Saturdays, 10:00–16:00, 30-min slots"
// instead of adding each one by hand. Skips any slot that already exists
// (same date + start time), so re-running is safe.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const body = await req.json().catch(() => ({}));
  const { dateFrom, dateTo, startTime, endTime } = body as {
    dateFrom?: string; dateTo?: string; startTime?: string; endTime?: string;
  };
  const weekdays: number[] = Array.isArray(body.weekdays) ? body.weekdays.map((d: unknown) => Number(d)) : [];
  const slotDuration = Number(body.slotDuration) || 30;
  const breakBetween = Math.max(0, Number(body.breakBetween) || 0);
  const type = typeof body.type === 'string' ? body.type : 'virtual';
  const maxBookings = Number(body.maxBookings) || 1;

  if (!dateFrom || !dateTo || !startTime || !endTime || weekdays.length === 0) {
    return NextResponse.json(
      { error: 'dateFrom, dateTo, startTime, endTime and at least one weekday are required' },
      { status: 400 },
    );
  }

  const days = new Set(weekdays.filter((d) => d >= 0 && d <= 6));
  const [sh, sm] = String(startTime).split(':').map(Number);
  const [eh, em] = String(endTime).split(':').map(Number);
  const dayStart = sh * 60 + sm;
  const dayEnd = eh * 60 + em;
  if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd) || dayEnd <= dayStart) {
    return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
  }

  // Build candidate rows. Dates are stored at UTC midnight to match the
  // single-slot create (`new Date('YYYY-MM-DD')`), and weekday is read in UTC.
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }

  const rows: Array<{ date: Date; startTime: string; endTime: string; duration: number; type: string; maxBookings: number; isAvailable: boolean }> = [];
  const MAX_DAYS = 366; // guard against an unbounded range
  let dayCount = 0;
  for (let d = new Date(start); d <= end && dayCount < MAX_DAYS; d.setUTCDate(d.getUTCDate() + 1), dayCount++) {
    if (!days.has(d.getUTCDay())) continue;
    const slotDate = new Date(d);
    for (let cur = dayStart; cur + slotDuration <= dayEnd; cur += slotDuration + breakBetween) {
      const st = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`;
      const en = `${String(Math.floor((cur + slotDuration) / 60)).padStart(2, '0')}:${String((cur + slotDuration) % 60).padStart(2, '0')}`;
      rows.push({ date: slotDate, startTime: st, endTime: en, duration: slotDuration, type, maxBookings, isAvailable: true });
    }
  }

  if (!rows.length) {
    return NextResponse.json({ created: 0, skipped: 0, message: 'No slots matched the selected days and times.' });
  }

  // Skip slots that already exist (same calendar date + start time).
  const existing = await prisma.consultationSlot.findMany({
    where: { date: { gte: start, lte: new Date(`${dateTo}T23:59:59.999Z`) } },
    select: { date: true, startTime: true },
  });
  const seen = new Set(existing.map((e) => `${e.date.toISOString().slice(0, 10)}_${e.startTime}`));
  const toCreate = rows.filter((r) => !seen.has(`${r.date.toISOString().slice(0, 10)}_${r.startTime}`));

  if (toCreate.length) {
    await prisma.consultationSlot.createMany({ data: toCreate });
  }

  return NextResponse.json({ created: toCreate.length, skipped: rows.length - toCreate.length });
}
