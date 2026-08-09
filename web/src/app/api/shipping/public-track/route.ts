import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { trackShipment } from '@/lib/ups';

// GET /api/shipping/public-track?q=SHP-0001 or ?q=1Z999...
// Public endpoint — no auth required for customers to track their orders
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ error: 'Tracking query required' }, { status: 400 });
  }

  // Find by shipmentId or trackingNumber
  const shipment = await prisma.shipment.findFirst({
    where: {
      OR: [
        { shipmentId: q },
        { trackingNumber: q },
      ],
    },
    select: {
      shipmentId: true,
      recipientName: true,
      carrier: true,
      serviceType: true,
      status: true,
      trackingNumber: true,
      shippingCost: true,
      estimatedDelivery: true,
      actualDelivery: true,
      createdAt: true,
      city: true,
      state: true,
      country: true,
    },
  });

  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found. Please check your tracking number.' }, { status: 404 });
  }

  // If we have a UPS tracking number, fetch live tracking data
  let tracking = null;
  if (shipment.trackingNumber && shipment.carrier === 'UPS') {
    try {
      tracking = await trackShipment(shipment.trackingNumber);

      // Update shipment status from UPS
      const statusMap: Record<string, string> = {
        D: 'delivered',
        I: 'in_transit',
        P: 'picked_up',
        M: 'label_created',
        X: 'exception',
      };
      const newStatus = statusMap[tracking.status];
      if (newStatus && newStatus !== shipment.status) {
        await prisma.shipment.updateMany({
          where: { shipmentId: shipment.shipmentId },
          data: {
            status: newStatus,
            ...(tracking.estimatedDelivery ? { estimatedDelivery: new Date(tracking.estimatedDelivery) } : {}),
            ...(tracking.actualDelivery ? { actualDelivery: new Date(tracking.actualDelivery) } : {}),
          },
        });
        // Reflect updated status in response
        shipment.status = newStatus;
      }
    } catch {
      // Tracking lookup failed — still return what we have from DB
    }
  }

  return NextResponse.json({ shipment, tracking });
}
