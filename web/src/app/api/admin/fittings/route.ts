import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.scheduledDate = { gte: start, lt: end };
    }

    const fittings = await prisma.fitting.findMany({
      where,
      orderBy: { scheduledDate: 'asc' },
      include: {
        customOrder: {
          include: { client: true },
        },
      },
    });

    return NextResponse.json(fittings);
  } catch (error) {
    console.error('Failed to fetch fittings:', error);
    return NextResponse.json({ error: 'Failed to fetch fittings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    const fitting = await prisma.fitting.create({
      data: {
        customOrderId: body.customOrderId || null,
        clientId: body.clientId || null,
        type: body.type || 'standard',
        scheduledDate: new Date(body.scheduledDate),
        scheduledTime: body.scheduledTime || null,
        duration: body.duration ?? 30,
        status: body.status || 'scheduled',
        location: body.location || null,
        fitter: body.fitter || null,
        notes: body.notes || null,
        alterationsNeeded: body.alterationsNeeded || null,
      },
      include: {
        customOrder: {
          include: { client: true },
        },
      },
    });

    // Log activity on the linked custom order
    if (body.customOrderId) {
      await prisma.orderActivity.create({
        data: {
          customOrderId: body.customOrderId,
          action: 'fitting_scheduled',
          description: `${body.type || 'Standard'} fitting scheduled for ${body.scheduledDate}`,
          performedBy: body.performedBy || null,
        },
      });
    }

    return NextResponse.json(fitting, { status: 201 });
  } catch (error) {
    console.error('Failed to create fitting:', error);
    return NextResponse.json({ error: 'Failed to create fitting' }, { status: 500 });
  }
}
