import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTrackerByCode, mapEasyPostStatus } from '@/lib/easypost';
import { updateShipmentStatus } from '@/lib/shipping-notifications';

// POST /api/cron/sync-tracking
//
// Polling fallback for shipping status. EasyPost-bought labels only advance the
// order status automatically when an EasyPost webhook fires; if the webhook is
// not configured (or misses an event), in-transit/delivered states would never
// reach the order. This cron polls every active shipment's EasyPost tracker and
// feeds any status change through `updateShipmentStatus` — the same helper the
// webhooks use, so the linked order flips + the customer is notified.
//
// Schedule a few times a day, e.g.:
//   0 */4 * * *  POST https://www.awulak.com/api/cron/sync-tracking
//                Header: Authorization: Bearer ${CRON_SECRET}

const TERMINAL = ['delivered', 'cancelled', 'returned'];

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Active shipments only: have a tracking number and aren't in a terminal
  // state. Cap the batch so the cron stays well under any timeout.
  const shipments = await prisma.shipment.findMany({
    where: {
      trackingNumber: { not: null },
      status: { notIn: TERMINAL },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, trackingNumber: true, status: true },
  });

  let checked = 0;
  let changed = 0;
  const updates: Array<{ id: string; from: string; to: string }> = [];

  for (const s of shipments) {
    if (!s.trackingNumber) continue;
    checked++;
    const tracker = await getTrackerByCode(s.trackingNumber);
    if (!tracker) continue;

    const mapped = mapEasyPostStatus(tracker.status);
    if (!mapped || mapped === s.status) continue;

    try {
      await updateShipmentStatus(s.id, mapped, {
        description: tracker.lastMessage || tracker.status,
        location: '',
        source: 'easypost_cron',
      });
      if (mapped === 'delivered') {
        const when = tracker.estDeliveryDate ? new Date(tracker.estDeliveryDate) : null;
        if (when && !Number.isNaN(when.getTime())) {
          await prisma.shipment.update({ where: { id: s.id }, data: { actualDelivery: when } });
        }
      }
      changed++;
      updates.push({ id: s.id, from: s.status, to: mapped });
    } catch (err) {
      console.error('[cron/sync-tracking] update failed for', s.id, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true, checked, changed, updates });
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'AWULA K tracking sync cron' });
}
