import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;

    const order = await prisma.customOrder.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: 'Custom order not found' }, { status: 404 });
    }

    const activities = await prisma.orderActivity.findMany({
      where: { customOrderId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Failed to fetch activity log:', error);
    return NextResponse.json({ error: 'Failed to fetch activity log' }, { status: 500 });
  }
}

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

    const activity = await prisma.orderActivity.create({
      data: {
        customOrderId: id,
        action: body.action || 'note_added',
        description: body.description,
        previousValue: body.previousValue || null,
        newValue: body.newValue || null,
        performedBy: body.performedBy || null,
      },
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    console.error('Failed to add activity:', error);
    return NextResponse.json({ error: 'Failed to add activity' }, { status: 500 });
  }
}
