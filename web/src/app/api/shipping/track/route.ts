import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { trackShipment } from '@/lib/ups';

// POST /api/shipping/track — track a shipment by tracking number
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { trackingNumber, shipmentId } = body;

  const trackNum = trackingNumber || (
    shipmentId ? (await prisma.shipment.findUnique({ where: { id: shipmentId } }))?.trackingNumber : null
  );

  if (!trackNum) return NextResponse.json({ error: 'No tracking number provided' }, { status: 400 });

  try {
    const tracking = await trackShipment(trackNum);

    // Update shipment status if we have a DB record
    if (shipmentId) {
      const statusMap: Record<string, string> = {
        'D': 'delivered',
        'I': 'in_transit',
        'P': 'picked_up',
        'M': 'label_created',
        'X': 'exception',
      };
      // Map tracking status string to shipment status
      const statusLookup: Record<string, string> = {
        delivered: 'delivered',
        in_transit: 'in_transit',
        picked_up: 'picked_up',
        label_created: 'label_created',
        exception: 'exception',
      };
      const newStatus = statusLookup[tracking.status] || 'in_transit';

      await prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          status: newStatus,
          actualDelivery: tracking.actualDelivery ? new Date(tracking.actualDelivery) : undefined,
          estimatedDelivery: tracking.estimatedDelivery ? new Date(tracking.estimatedDelivery) : undefined,
        },
      });
    }

    return NextResponse.json({ tracking });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to track shipment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
