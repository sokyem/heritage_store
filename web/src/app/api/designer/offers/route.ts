import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { expireStaleOffers } from '@/lib/assignment-engine';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the partner designer linked to this user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { partnerDesigner: true },
    });

    if (!user?.partnerDesigner) {
      return NextResponse.json({ error: 'Not a registered designer' }, { status: 403 });
    }

    // Expire stale offers first (lazy evaluation)
    await expireStaleOffers();

    // Get active offers for this designer
    const activeOffers = await prisma.assignmentOffer.findMany({
      where: {
        designerId: user.partnerDesigner.id,
        status: 'offered',
        expiresAt: { gt: new Date() },
      },
      include: {
        customOrder: {
          include: {
            client: {
              select: { name: true, city: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get recent offer history
    const recentOffers = await prisma.assignmentOffer.findMany({
      where: {
        designerId: user.partnerDesigner.id,
        status: { not: 'offered' },
      },
      include: {
        customOrder: {
          select: { orderId: true, eventType: true, estimatedPrice: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      active: activeOffers.map((o) => ({
        id: o.id,
        offerId: o.offerId,
        status: o.status,
        expiresAt: o.expiresAt,
        offeredAt: o.offeredAt,
        order: {
          id: o.customOrder.id,
          orderId: o.customOrder.orderId,
          eventType: o.customOrder.eventType,
          deadline: o.customOrder.deadline,
          estimatedPrice: o.customOrder.estimatedPrice,
          designDescription: o.customOrder.designDescription,
          clientCity: o.customOrder.client?.city || null,
          clientName: o.customOrder.client?.name || null,
          priority: o.customOrder.priority,
        },
      })),
      history: recentOffers.map((o) => ({
        id: o.id,
        offerId: o.offerId,
        status: o.status,
        respondedAt: o.respondedAt,
        offeredAt: o.offeredAt,
        declineReason: o.declineReason,
        order: {
          orderId: o.customOrder.orderId,
          eventType: o.customOrder.eventType,
          estimatedPrice: o.customOrder.estimatedPrice,
        },
      })),
    });
  } catch (error) {
    console.error('Failed to fetch designer offers:', error);
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 });
  }
}
