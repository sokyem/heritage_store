import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { recordAudit } from '@/lib/audit';
import { createShipmentRow } from '@/lib/auto-shipping';


export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  try {
    const order = await prisma.adminOrder.findUnique({
      where: { id },
      include: { client: true, production: true, payments: true },
    });
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(order);
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  try {
    const body = await req.json();

    // Recalculate balance if price/payments change
    const data: Record<string, unknown> = {};
    if (body.item !== undefined) data.item = body.item;
    if (body.fabric !== undefined) data.fabric = body.fabric;
    if (body.totalPrice !== undefined) data.totalPrice = body.totalPrice;
    if (body.deposit !== undefined) data.deposit = body.deposit;
    if (body.totalPaid !== undefined) data.totalPaid = body.totalPaid;
    if (body.status !== undefined) data.status = body.status;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.paymentStatus !== undefined) data.paymentStatus = body.paymentStatus;
    if (body.productionAllowed !== undefined) data.productionAllowed = body.productionAllowed;

    // Auto-calculate balance
    if (body.totalPrice !== undefined || body.totalPaid !== undefined) {
      const current = await prisma.adminOrder.findUnique({ where: { id } });
      const price = body.totalPrice ?? current?.totalPrice ?? 0;
      const paid = body.totalPaid ?? current?.totalPaid ?? 0;
      data.balance = Math.max(0, (price as number) - (paid as number));
    }

    const order = await prisma.adminOrder.update({
      where: { id },
      data,
      include: { client: true, production: true },
    });

    // Auto-fulfillment: when order status changes to "Shipped" or "Ready to Ship",
    // auto-create a pending shipment if one doesn't exist yet
    if (body.status && ['Shipped', 'Ready to Ship'].includes(body.status)) {
      const existingShipment = await prisma.shipment.findFirst({
        where: { adminOrderId: id },
      });
      if (!existingShipment) {
        await createShipmentRow({
            adminOrderId: id,
            recipientName: order.client?.name || '',
            recipientEmail: order.client?.email || null,
            recipientPhone: order.client?.phone || null,
            addressLine1: '',
            city: order.client?.city || '',
            state: '',
            postalCode: '',
            country: 'US',
            carrier: 'UPS',
            status: 'pending',
        });
      }
    }

    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'AdminOrder',
      entityId: id,
      summary: body.status ? `Status → ${body.status}` : 'Updated order',
      diff: data,
    });

    return NextResponse.json(order);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  try {
    await prisma.adminOrder.delete({ where: { id } });
    await recordAudit({
      actorEmail: auth.email,
      action: 'delete',
      entity: 'AdminOrder',
      entityId: id,
      summary: 'Deleted admin order',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 });
  }
}
