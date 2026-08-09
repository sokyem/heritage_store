import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';


export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const trackers = await prisma.productionTracker.findMany({
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      include: { order: { include: { client: true } } },
    });
    return NextResponse.json(trackers);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load production' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const tracker = await prisma.productionTracker.upsert({
      where: { orderId: body.orderId },
      update: {
        priority: body.priority || 'LOW',
        stage: body.stage || 'Order Received',
        progress: body.progress || 0,
        dueDate: body.dueDate || null,
      },
      create: {
        orderId: body.orderId,
        priority: body.priority || 'LOW',
        stage: body.stage || 'Order Received',
        progress: body.progress || 0,
        dueDate: body.dueDate || null,
      },
      include: { order: { include: { client: true } } },
    });
    return NextResponse.json(tracker, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save production tracker' }, { status: 500 });
  }
}
