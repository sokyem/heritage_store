import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { partnerDesigner: true },
    });

    if (!user?.partnerDesigner) {
      return NextResponse.json({ error: 'Not a registered designer' }, { status: 403 });
    }

    const orders = await prisma.customOrder.findMany({
      where: { designerId: user.partnerDesigner.id },
      include: {
        client: {
          select: { name: true, city: true, phone: true, email: true },
        },
        measurement: true,
        fittings: {
          orderBy: { scheduledDate: 'asc' },
          take: 3,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        orderId: o.orderId,
        status: o.status,
        eventType: o.eventType,
        eventDate: o.eventDate,
        deadline: o.deadline,
        designDescription: o.designDescription,
        colorPreferences: o.colorPreferences,
        fabricPreferences: o.fabricPreferences,
        inspirationNotes: o.inspirationNotes,
        estimatedPrice: o.estimatedPrice,
        finalPrice: o.finalPrice,
        priority: o.priority,
        productionNotes: o.productionNotes,
        assignedFabric: o.assignedFabric,
        client: o.client,
        measurement: o.measurement,
        nextFitting: o.fittings[0] || null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      })),
      stats: {
        total: orders.length,
        active: orders.filter((o) =>
          !['delivered', 'completed', 'cancelled'].includes(o.status)
        ).length,
        delivered: orders.filter((o) => o.status === 'delivered').length,
      },
    });
  } catch (error) {
    console.error('Failed to fetch designer orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}
