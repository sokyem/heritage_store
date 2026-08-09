import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

// GET /api/admin/shipping/[id]/label?download=1
//
// Streams the stored shipment label back as binary (PDF for USPS, PNG for UPS).
// Without ?download=1 the browser displays inline (handy for quick preview);
// with ?download=1 the browser saves to disk.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    select: { id: true, shipmentId: true, carrier: true, labelData: true, trackingNumber: true },
  });
  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
  }
  if (!shipment.labelData) {
    return NextResponse.json({ error: 'No label has been generated for this shipment' }, { status: 404 });
  }

  // USPS returns base64 PDF (we request imageType:PDF). UPS returns base64 PNG.
  // The carrier column drives format selection.
  const carrier = (shipment.carrier || '').toUpperCase();
  const isPdf = carrier === 'USPS';
  const contentType = isPdf ? 'application/pdf' : 'image/png';
  const extension = isPdf ? 'pdf' : 'png';

  let bytes: Buffer;
  try {
    bytes = Buffer.from(shipment.labelData, 'base64');
  } catch {
    return NextResponse.json({ error: 'Stored label data is corrupted' }, { status: 500 });
  }

  const url = new URL(req.url);
  const download = url.searchParams.get('download') === '1';
  const filename = `${shipment.shipmentId}-label.${extension}`;
  const disposition = `${download ? 'attachment' : 'inline'}; filename="${filename}"`;

  // Convert Node Buffer to Uint8Array so the Web Response accepts it without type warnings.
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
    },
  });
}
