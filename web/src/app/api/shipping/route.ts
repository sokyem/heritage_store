import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { createShipmentRow } from '@/lib/auto-shipping';

// GET /api/shipping — list all shipments
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const where: Record<string, unknown> = {};
  if (status && status !== 'all') where.status = status;
  if (search) {
    where.OR = [
      { shipmentId: { contains: search } },
      { trackingNumber: { contains: search } },
      { recipientName: { contains: search } },
      { recipientEmail: { contains: search } },
    ];
  }

  const shipments = await prisma.shipment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ shipments });
}

// POST /api/shipping — create a new shipment
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const shipment = await createShipmentRow({
      adminOrderId: body.adminOrderId || null,
      customOrderId: body.customOrderId || null,
      rentalOrderId: body.rentalOrderId || null,
      recipientName: body.recipientName,
      recipientPhone: body.recipientPhone || null,
      recipientEmail: body.recipientEmail || null,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2 || null,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      country: body.country || 'US',
      carrier: body.carrier || 'UPS',
      serviceType: body.serviceType || null,
      packageWeight: body.packageWeight ? parseFloat(body.packageWeight) : null,
      packageLength: body.packageLength ? parseFloat(body.packageLength) : null,
      packageWidth: body.packageWidth ? parseFloat(body.packageWidth) : null,
      packageHeight: body.packageHeight ? parseFloat(body.packageHeight) : null,
      declaredValue: body.declaredValue ? parseFloat(body.declaredValue) : null,
      notes: body.notes || null,
  });

  return NextResponse.json({ shipment }, { status: 201 });
}
