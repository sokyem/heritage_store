import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { triggerAssignment, completeOrder } from '@/lib/assignment-engine';
import { requireAdmin } from '@/lib/auth-guard';
import { recordAudit } from '@/lib/audit';

const includeAll = {
  client: true,
  designer: true,
  measurement: true,
  fittings: true,
  attachments: true,
  activityLog: { orderBy: { createdAt: 'desc' as const } },
  payments: true,
  assignmentOffers: {
    include: {
      designer: { select: { designerId: true, name: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const order = await prisma.customOrder.findUnique({
      where: { id },
      include: includeAll,
    });

    if (!order) {
      return NextResponse.json({ error: 'Custom order not found' }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Failed to fetch custom order:', error);
    return NextResponse.json({ error: 'Failed to fetch custom order' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.customOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Custom order not found' }, { status: 404 });
    }

    // Recalculate balance
    const price = body.finalPrice ?? body.estimatedPrice ?? existing.finalPrice ?? existing.estimatedPrice ?? 0;
    const totalPaid = body.totalPaid ?? existing.totalPaid ?? 0;
    const balance = price - totalPaid;

    // Log status change if status changed
    if (body.status && body.status !== existing.status) {
      await prisma.orderActivity.create({
        data: {
          customOrderId: id,
          action: 'status_change',
          description: `Status changed from "${existing.status}" to "${body.status}"`,
          previousValue: existing.status,
          newValue: body.status,
          performedBy: body.performedBy || null,
        },
      });
    }

    const updated = await prisma.customOrder.update({
      where: { id },
      data: {
        ...(body.clientId !== undefined && { clientId: body.clientId }),
        ...(body.measurementId !== undefined && { measurementId: body.measurementId || null }),
        ...(body.designerId !== undefined && { designerId: body.designerId || null }),
        ...(body.quoteId !== undefined && { quoteId: body.quoteId || null }),
        ...(body.eventType !== undefined && { eventType: body.eventType }),
        ...(body.eventDate !== undefined && { eventDate: body.eventDate }),
        ...(body.deadline !== undefined && { deadline: body.deadline }),
        ...(body.designDescription !== undefined && { designDescription: body.designDescription }),
        ...(body.inspirationNotes !== undefined && { inspirationNotes: body.inspirationNotes }),
        ...(body.inspirationImages !== undefined && { inspirationImages: body.inspirationImages }),
        ...(body.colorPreferences !== undefined && { colorPreferences: body.colorPreferences }),
        ...(body.fabricPreferences !== undefined && { fabricPreferences: body.fabricPreferences }),
        ...(body.estimatedPrice !== undefined && { estimatedPrice: body.estimatedPrice }),
        ...(body.finalPrice !== undefined && { finalPrice: body.finalPrice }),
        ...(body.depositAmount !== undefined && { depositAmount: body.depositAmount }),
        ...(body.totalPaid !== undefined && { totalPaid: body.totalPaid }),
        balance,
        ...(body.status !== undefined && { status: body.status }),
        ...(body.assignedFabric !== undefined && { assignedFabric: body.assignedFabric }),
        ...(body.productionNotes !== undefined && { productionNotes: body.productionNotes }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.rushFee !== undefined && { rushFee: body.rushFee }),
        ...(body.source !== undefined && { source: body.source }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: includeAll,
    });

    // Auto-trigger assignment when status transitions to pending_assignment
    if (body.status === 'pending_assignment' && existing.status !== 'pending_assignment') {
      triggerAssignment(id).catch(console.error);
    }

    // Handle order completion — update designer stats and currentLoad
    const completionStatuses = ['delivered', 'completed'];
    if (body.status && completionStatuses.includes(body.status) && !completionStatuses.includes(existing.status)) {
      completeOrder(id).catch(console.error);
    }

    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'CustomOrder',
      entityId: id,
      summary: body.status && body.status !== existing.status
        ? `Status: ${existing.status} → ${body.status}`
        : 'Updated custom order',
      diff: { changed: Object.keys(body) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update custom order:', error);
    return NextResponse.json({ error: 'Failed to update custom order' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const existing = await prisma.customOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Custom order not found' }, { status: 404 });
    }

    await prisma.customOrder.delete({ where: { id } });

    await recordAudit({
      actorEmail: auth.email,
      action: 'delete',
      entity: 'CustomOrder',
      entityId: id,
      summary: 'Deleted custom order',
    });

    return NextResponse.json({ message: 'Custom order deleted' });
  } catch (error) {
    console.error('Failed to delete custom order:', error);
    return NextResponse.json({ error: 'Failed to delete custom order' }, { status: 500 });
  }
}
