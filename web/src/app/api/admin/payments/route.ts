import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { recordAudit } from '@/lib/audit';


export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const payments = await prisma.paymentRecord.findMany({
      orderBy: { createdAt: 'desc' },
      include: { order: true },
    });
    return NextResponse.json(payments);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    // Generate next payment ID
    const last = await prisma.paymentRecord.findFirst({ orderBy: { paymentId: 'desc' } });
    const nextNum = last ? parseInt(last.paymentId.replace('P-', '')) + 1 : 1;
    const paymentId = `P-${String(nextNum).padStart(3, '0')}`;

    const payment = await prisma.paymentRecord.create({
      data: {
        paymentId,
        orderId: body.orderId,
        client: body.client,
        amount: body.amount || null,
        method: body.method || null,
        date: body.date ? new Date(body.date) : new Date(),
        paymentType: body.paymentType || null,
        notes: body.notes || null,
      },
      include: { order: true },
    });

    // Update order totalPaid and balance
    if (body.amount && body.orderId) {
      const order = await prisma.adminOrder.findUnique({ where: { id: body.orderId } });
      if (order) {
        const newPaid = (order.totalPaid || 0) + (body.amount || 0);
        const newBalance = Math.max(0, (order.totalPrice || 0) - newPaid);
        await prisma.adminOrder.update({
          where: { id: body.orderId },
          data: { totalPaid: newPaid, balance: newBalance },
        });
      }
    }

    await recordAudit({
      actorEmail: auth.email,
      action: 'create',
      entity: 'PaymentRecord',
      entityId: payment.id,
      summary: `Manual payment ${paymentId}${body.amount ? ` — $${Number(body.amount).toFixed(2)}` : ''}${body.method ? ` via ${body.method}` : ''}`,
      diff: { orderId: body.orderId, amount: body.amount, method: body.method },
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error('Create payment error:', error);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}
