import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// GET /api/shipping/returns — list return requests
// Supports server-side pagination + sort via ?page=&pageSize=&sortBy=&sortDir=
const RETURN_SORTABLE: Record<string, 'createdAt' | 'returnId' | 'status' | 'refundAmount'> = {
  createdAt: 'createdAt',
  returnId: 'returnId',
  status: 'status',
  refundAmount: 'refundAmount',
};

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
      { returnId: { contains: search } },
      { customerName: { contains: search } },
      { customerEmail: { contains: search } },
    ];
  }

  const sortByParam = searchParams.get('sortBy') || 'createdAt';
  const sortBy = RETURN_SORTABLE[sortByParam] || 'createdAt';
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawSize = parseInt(searchParams.get('pageSize') || '25', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 25));

  const [returns, total, statTotal, statRequested, statApproved, statReceived, statCompleted] =
    await Promise.all([
      prisma.returnRequest.findMany({
        where,
        include: { shipment: { select: { shipmentId: true, trackingNumber: true, carrier: true } } },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.returnRequest.count({ where }),
      prisma.returnRequest.count(),
      prisma.returnRequest.count({ where: { status: 'requested' } }),
      prisma.returnRequest.count({ where: { status: 'approved' } }),
      prisma.returnRequest.count({ where: { status: 'item_received' } }),
      prisma.returnRequest.count({ where: { status: 'completed' } }),
    ]);

  const stats = {
    total: statTotal,
    requested: statRequested,
    approved: statApproved,
    received: statReceived,
    completed: statCompleted,
  };

  return NextResponse.json({
    returns,
    stats,
    page,
    pageSize,
    pageTotal: total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sortBy: sortByParam in RETURN_SORTABLE ? sortByParam : 'createdAt',
    sortDir,
  });
}

// POST /api/shipping/returns — create a return request (customer or admin)
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { shipmentId, reason, description } = body;

  // Find the original shipment
  const shipment = await prisma.shipment.findFirst({
    where: {
      OR: [
        { id: shipmentId },
        { shipmentId: shipmentId },
      ],
    },
  });

  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
  }

  if (shipment.status !== 'delivered') {
    return NextResponse.json({ error: 'Only delivered shipments can be returned' }, { status: 400 });
  }

  // Generate RMA ID
  const count = await prisma.returnRequest.count();
  const returnId = `RMA-${String(count + 1).padStart(4, '0')}`;

  const returnRequest = await prisma.returnRequest.create({
    data: {
      returnId,
      shipmentId: shipment.id,
      adminOrderId: shipment.adminOrderId,
      customOrderId: shipment.customOrderId,
      rentalOrderId: shipment.rentalOrderId,
      customerName: body.customerName || shipment.recipientName,
      customerEmail: body.customerEmail || shipment.recipientEmail,
      customerPhone: body.customerPhone || shipment.recipientPhone,
      reason: reason || 'other',
      description: description || null,
      status: 'requested',
    },
  });

  return NextResponse.json({ returnRequest }, { status: 201 });
}

// PATCH /api/shipping/returns — update return request status
export async function PATCH(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'Return request ID required' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (updates.status) data.status = updates.status;
  if (updates.resolution) data.resolution = updates.resolution;
  if (updates.inspectionNotes) data.inspectionNotes = updates.inspectionNotes;
  if (updates.condition) data.condition = updates.condition;
  if (updates.returnTrackingNumber) data.returnTrackingNumber = updates.returnTrackingNumber;
  if (updates.returnLabelData) data.returnLabelData = updates.returnLabelData;
  if (updates.returnCarrier) data.returnCarrier = updates.returnCarrier;
  if (updates.returnShippingCost) data.returnShippingCost = updates.returnShippingCost;
  if (updates.refundAmount !== undefined) data.refundAmount = updates.refundAmount;

  // Timestamp updates based on status
  if (updates.status === 'approved') data.approvedAt = new Date();
  if (updates.status === 'item_received') data.receivedAt = new Date();
  if (updates.status === 'refunded') data.refundedAt = new Date();

  const returnRequest = await prisma.returnRequest.update({
    where: { id },
    data,
    include: { shipment: { select: { shipmentId: true } } },
  });

  // If we mark the shipment as returned, update the original shipment
  if (updates.status === 'item_received' && returnRequest.shipmentId) {
    await prisma.shipment.update({
      where: { id: returnRequest.shipmentId },
      data: { status: 'returned' },
    });
  }

  return NextResponse.json({ returnRequest });
}
