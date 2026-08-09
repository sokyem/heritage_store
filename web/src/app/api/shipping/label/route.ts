import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { createShipment, type UPSServiceCode } from '@/lib/ups';

const SERVICE_MAP: Record<string, UPSServiceCode> = {
  ups_ground: '03',
  ups_2nd_day_air: '02',
  ups_next_day_air: '01',
  ups_next_day_air_saver: '13',
  ups_3_day_select: '12',
};

// POST /api/shipping/label — create UPS label for a shipment
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { shipmentId } = body;

  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

  try {
    const serviceCode = SERVICE_MAP[shipment.serviceType || 'ups_ground'] || '03';

    const label = await createShipment(
      {
        name: shipment.recipientName,
        phone: shipment.recipientPhone || undefined,
        addressLine1: shipment.addressLine1,
        addressLine2: shipment.addressLine2 || undefined,
        city: shipment.city,
        state: shipment.state,
        postalCode: shipment.postalCode,
        country: shipment.country,
      },
      {
        weight: shipment.packageWeight || 1,
        length: shipment.packageLength || 12,
        width: shipment.packageWidth || 10,
        height: shipment.packageHeight || 4,
        declaredValue: shipment.declaredValue || undefined,
      },
      serviceCode,
      `AWULA K Order ${shipment.shipmentId}`
    );

    // Update shipment with tracking info
    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingNumber: label.trackingNumber,
        labelData: label.labelImageBase64 || null,
        shippingCost: label.totalCharge || null,
        status: 'label_created',
        shippedAt: new Date(),
      },
    });

    return NextResponse.json({ shipment: updated, label });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create label';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
