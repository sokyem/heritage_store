import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const order = await prisma.customOrder.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: 'Custom order not found' }, { status: 404 });
    }

    // Auto-generate paymentId
    const lastPayment = await prisma.customOrderPayment.findFirst({
      orderBy: { paymentId: 'desc' },
    });
    const nextNum = lastPayment
      ? parseInt(lastPayment.paymentId.replace('CP-', '')) + 1
      : 1;
    const paymentId = `CP-${String(nextNum).padStart(3, '0')}`;

    const payment = await prisma.customOrderPayment.create({
      data: {
        paymentId,
        customOrderId: id,
        amount: body.amount,
        method: body.method || null,
        paymentType: body.paymentType || null,
        date: body.date ? new Date(body.date) : new Date(),
        notes: body.notes || null,
        recordedBy: body.recordedBy || null,
      },
    });

    // Update order totalPaid and balance
    const newTotalPaid = order.totalPaid + body.amount;
    const price = order.finalPrice ?? order.estimatedPrice ?? 0;
    const newBalance = price - newTotalPaid;

    await prisma.customOrder.update({
      where: { id },
      data: {
        totalPaid: newTotalPaid,
        balance: newBalance,
      },
    });

    // Log activity
    await prisma.orderActivity.create({
      data: {
        customOrderId: id,
        action: 'payment_received',
        description: `Payment of $${body.amount} recorded (${paymentId})`,
        newValue: String(body.amount),
        performedBy: body.recordedBy || null,
      },
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error('Failed to record payment:', error);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}
