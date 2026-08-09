import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { triggerAssignment } from '@/lib/assignment-engine';
import { requireAdmin } from '@/lib/auth-guard';

// Whitelist of sortable columns.
const SORTABLE_COLUMNS: Record<string, 'orderId' | 'updatedAt' | 'deadline' | 'finalPrice' | 'status'> = {
  orderId: 'orderId',
  updatedAt: 'updatedAt',
  deadline: 'deadline',
  finalPrice: 'finalPrice',
  status: 'status',
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    // Opt-in pagination — bare GET keeps returning a flat array.
    const wantsPaginated =
      searchParams.has('page') ||
      searchParams.has('pageSize') ||
      searchParams.get('paginate') === '1';

    const where = status ? { status } : {};

    if (!wantsPaginated) {
      const orders = await prisma.customOrder.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          client: true,
          designer: true,
          measurement: true,
          _count: { select: { fittings: true } },
          payments: { select: { amount: true } },
        },
      });
      const result = orders.map((order) => ({
        ...order,
        designerName: order.designer?.name || null,
        paymentsTotal: order.payments.reduce((sum, p) => sum + p.amount, 0),
        fittingsCount: order._count.fittings,
        payments: undefined,
        _count: undefined,
      }));
      return NextResponse.json(result);
    }

    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const sortByParam = searchParams.get('sortBy') || 'updatedAt';
    const sortBy = SORTABLE_COLUMNS[sortByParam] || 'updatedAt';
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const rawSize = parseInt(searchParams.get('pageSize') || '25', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 25));

    const fullWhere = {
      ...where,
      ...(search
        ? {
            OR: [
              { orderId: { contains: search, mode: 'insensitive' as const } },
              { designDescription: { contains: search, mode: 'insensitive' as const } },
              { client: { name: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.customOrder.findMany({
        where: fullWhere,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: true,
          designer: true,
          measurement: true,
          _count: { select: { fittings: true } },
          payments: { select: { amount: true } },
        },
      }),
      prisma.customOrder.count({ where: fullWhere }),
    ]);

    const items = orders.map((order) => ({
      ...order,
      designerName: order.designer?.name || null,
      paymentsTotal: order.payments.reduce((sum, p) => sum + p.amount, 0),
      fittingsCount: order._count.fittings,
      payments: undefined,
      _count: undefined,
    }));

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sortBy: sortByParam in SORTABLE_COLUMNS ? sortByParam : 'updatedAt',
      sortDir,
    });
  } catch (error) {
    console.error('Failed to fetch custom orders:', error);
    return NextResponse.json({ error: 'Failed to fetch custom orders' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    // Auto-generate orderId
    const lastOrder = await prisma.customOrder.findFirst({
      orderBy: { orderId: 'desc' },
    });
    const nextNum = lastOrder
      ? parseInt(lastOrder.orderId.replace('CUS-', '')) + 1
      : 1;
    const orderId = `CUS-${String(nextNum).padStart(3, '0')}`;

    // Calculate balance
    const price = body.finalPrice ?? body.estimatedPrice ?? 0;
    const totalPaid = body.totalPaid ?? 0;
    const balance = price - totalPaid;

    const order = await prisma.customOrder.create({
      data: {
        orderId,
        clientId: body.clientId,
        measurementId: body.measurementId || null,
        designerId: body.designerId || null,
        quoteId: body.quoteId || null,
        eventType: body.eventType || null,
        eventDate: body.eventDate || null,
        deadline: body.deadline || null,
        designDescription: body.designDescription || null,
        inspirationNotes: body.inspirationNotes || null,
        inspirationImages: body.inspirationImages || null,
        colorPreferences: body.colorPreferences || null,
        fabricPreferences: body.fabricPreferences || null,
        estimatedPrice: body.estimatedPrice ?? null,
        finalPrice: body.finalPrice ?? null,
        depositAmount: body.depositAmount ?? 0,
        totalPaid,
        balance,
        status: body.status || 'inquiry_received',
        assignedFabric: body.assignedFabric || null,
        productionNotes: body.productionNotes || null,
        priority: body.priority || 'NORMAL',
        rushFee: body.rushFee ?? 0,
        source: body.source || null,
        tags: body.tags || null,
        notes: body.notes || null,
      },
    });

    // Create initial activity log
    await prisma.orderActivity.create({
      data: {
        customOrderId: order.id,
        action: 'status_change',
        description: 'Order created',
        newValue: order.status,
        performedBy: body.performedBy || null,
      },
    });

    // Auto-trigger assignment if status is pending_assignment
    let assignmentResult = null;
    if (order.status === 'pending_assignment') {
      assignmentResult = await triggerAssignment(order.id);
    }

    const result = await prisma.customOrder.findUnique({
      where: { id: order.id },
      include: {
        client: true,
        designer: true,
        measurement: true,
        fittings: true,
        attachments: true,
        activityLog: { orderBy: { createdAt: 'desc' } },
        payments: true,
      },
    });

    return NextResponse.json({ ...result, assignmentResult }, { status: 201 });
  } catch (error) {
    console.error('Failed to create custom order:', error);
    return NextResponse.json({ error: 'Failed to create custom order' }, { status: 500 });
  }
}
