import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// GET /api/shipping/label/download?id=<shipmentId>
// Returns the label as a PNG image for download/printing
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Shipment ID required' }, { status: 400 });
  }

  const shipment = await prisma.shipment.findFirst({
    where: {
      OR: [
        { id },
        { shipmentId: id },
      ],
    },
    select: {
      shipmentId: true,
      labelData: true,
      labelUrl: true,
    },
  });

  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
  }

  // If we have Base64 label data, return as PNG
  if (shipment.labelData) {
    const buffer = Buffer.from(shipment.labelData, 'base64');
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="label-${shipment.shipmentId}.png"`,
        'Content-Length': String(buffer.length),
      },
    });
  }

  // If we have a label URL, redirect
  if (shipment.labelUrl) {
    return NextResponse.redirect(shipment.labelUrl);
  }

  return NextResponse.json({ error: 'No label available for this shipment' }, { status: 404 });
}
