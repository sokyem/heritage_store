import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  schedulePickup,
  isUSPSPickupConfigured,
  type SchedulePickupRequest,
  type USPSPackageType,
} from '@/lib/usps-pickup';

// POST /api/cron/usps-pickup
//
// Scheduled job — bundles every USPS shipment that has a printed label but
// hasn't been picked up yet into a single carrier pickup for the next
// business day. Idempotent: stamps each included shipment with the
// confirmation, so a second call the same day is a no-op.
//
// Auth: if CRON_SECRET is set, the request must include
//   Authorization: Bearer ${CRON_SECRET}
// (allows the same endpoint to be triggered manually from admin too).

const SHIPPER_EMAIL = process.env.SHIPPER_NOTIFICATION_EMAIL || process.env.FROM_EMAIL || '';

/** Tomorrow's date in YYYY-MM-DD, skipping Sat/Sun. */
function nextBusinessDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  // YYYY-MM-DD in the studio's local timezone is fine; USPS accepts plain dates.
  return d.toISOString().split('T')[0];
}

/** Map our serviceType strings to USPS pickup package-type codes. */
function toPackageType(serviceType: string | null): USPSPackageType {
  const s = (serviceType || '').toUpperCase();
  if (s.includes('EXPRESS')) return 'PRIORITY_MAIL_EXPRESS';
  if (s.includes('PRIORITY')) return 'PRIORITY_MAIL';
  if (s.includes('GROUND')) return 'USPS_GROUND_ADVANTAGE';
  return 'OTHER';
}

export async function POST(req: NextRequest) {
  // Secret-gate the endpoint when CRON_SECRET is configured.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!isUSPSPickupConfigured()) {
    return NextResponse.json(
      { scheduled: false, reason: 'USPS pickup not configured' },
      { status: 200 },
    );
  }

  // Find USPS shipments with a printed label that haven't been bundled into
  // a pickup yet (and aren't already in transit / delivered).
  const pending = await prisma.shipment.findMany({
    where: {
      carrier: 'USPS',
      pickupConfirmation: null,
      status: { in: ['label_created', 'pending'] },
      shippedAt: null,
    },
    select: {
      id: true,
      serviceType: true,
      packageWeight: true,
    },
  });

  if (pending.length === 0) {
    return NextResponse.json({ scheduled: false, reason: 'No pending labels to pick up' });
  }

  // Bundle into one pickup. Group by package type so USPS knows how many of
  // each class to expect; sum weights (default to 1 lb per package if missing).
  const byType = new Map<USPSPackageType, number>();
  let totalWeight = 0;
  for (const s of pending) {
    const t = toPackageType(s.serviceType);
    byType.set(t, (byType.get(t) || 0) + 1);
    totalWeight += s.packageWeight && s.packageWeight > 0 ? s.packageWeight : 1;
  }

  const request: SchedulePickupRequest = {
    pickupDate: nextBusinessDay(),
    packages: Array.from(byType.entries()).map(([packageType, packageCount]) => ({
      packageType,
      packageCount,
    })),
    estimatedWeight: Math.max(1, Math.round(totalWeight)),
    packageLocation: 'PORCH',
    specialInstructions: 'Studio pickup — see porch.',
    ...(SHIPPER_EMAIL ? { notificationEmail: SHIPPER_EMAIL } : {}),
  };

  try {
    const confirmation = await schedulePickup(request);

    // Stamp every bundled shipment so the next cron run skips them.
    await prisma.shipment.updateMany({
      where: { id: { in: pending.map((s) => s.id) } },
      data: {
        pickupConfirmation: confirmation.confirmationNumber,
        pickupScheduledFor: new Date(confirmation.pickupDate),
      },
    });

    return NextResponse.json({
      scheduled: true,
      confirmationNumber: confirmation.confirmationNumber,
      pickupDate: confirmation.pickupDate,
      packageCount: pending.length,
      estimatedWeight: request.estimatedWeight,
      shipmentIds: pending.map((s) => s.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'pickup_scheduling_failed';
    console.error('[cron/usps-pickup] schedule failed:', message);
    // Surface the USPS error verbatim so logs are useful (scope errors are
    // the common case while approvals are pending).
    return NextResponse.json(
      { scheduled: false, error: message, pendingCount: pending.length },
      { status: 502 },
    );
  }
}
