import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import {
  schedulePickup,
  cancelPickup,
  checkPickupEligibility,
  isUSPSPickupConfigured,
  type PickupConfirmation,
  type SchedulePickupRequest,
} from '@/lib/usps-pickup';

// USPS only returns pickups by confirmation number, no "list" endpoint.
// We persist our own list under AppSetting key `usps_carrier_pickups` so the
// admin UI can show active pickups without remembering confirmation numbers.
const STORAGE_KEY = 'usps_carrier_pickups';

async function loadPickups(): Promise<PickupConfirmation[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: STORAGE_KEY } });
  if (!row) return [];
  const value = row.value as unknown;
  return Array.isArray(value) ? (value as PickupConfirmation[]) : [];
}

async function savePickups(pickups: PickupConfirmation[]): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: STORAGE_KEY },
    update: { value: pickups as unknown as object },
    create: { key: STORAGE_KEY, category: 'shipping', value: pickups as unknown as object },
  });
}

// GET — list saved pickups + report whether USPS is configured & address is eligible.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const pickups = await loadPickups();
  let eligibility: { eligible: boolean; reason?: string } = { eligible: false };
  if (isUSPSPickupConfigured()) {
    try { eligibility = await checkPickupEligibility(); }
    catch (e) { eligibility = { eligible: false, reason: e instanceof Error ? e.message : 'eligibility check failed' }; }
  }

  // Filter out past pickups (USPS auto-archives but we don't need to show them).
  const today = new Date().toISOString().split('T')[0];
  const active = pickups.filter((p) => p.pickupDate >= today);
  return NextResponse.json({
    pickups: active.sort((a, b) => a.pickupDate.localeCompare(b.pickupDate)),
    configured: isUSPSPickupConfigured(),
    eligibility,
  });
}

// POST — schedule a new pickup.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  let body: SchedulePickupRequest;
  try {
    body = (await req.json()) as SchedulePickupRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.pickupDate || !Array.isArray(body.packages) || body.packages.length === 0) {
    return NextResponse.json({ error: 'pickupDate and packages are required' }, { status: 400 });
  }
  if (!body.estimatedWeight || body.estimatedWeight <= 0) {
    return NextResponse.json({ error: 'estimatedWeight (lbs) is required' }, { status: 400 });
  }
  if (!body.packageLocation) {
    return NextResponse.json({ error: 'packageLocation is required' }, { status: 400 });
  }

  try {
    const confirmation = await schedulePickup(body);
    const existing = await loadPickups();
    await savePickups([...existing, confirmation]);
    return NextResponse.json({ confirmation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'schedule_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE ?confirmationNumber=... — cancel a pickup.
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const confirmationNumber = searchParams.get('confirmationNumber');
  if (!confirmationNumber) {
    return NextResponse.json({ error: 'confirmationNumber required' }, { status: 400 });
  }

  const pickups = await loadPickups();
  const target = pickups.find((p) => p.confirmationNumber === confirmationNumber);

  try {
    await cancelPickup(confirmationNumber, target?.etag || '');
    await savePickups(pickups.filter((p) => p.confirmationNumber !== confirmationNumber));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cancel_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
