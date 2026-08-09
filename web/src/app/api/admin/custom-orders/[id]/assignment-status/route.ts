import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { expireStaleOffers, buildCandidateList } from '@/lib/assignment-engine';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Expire stale offers first
    await expireStaleOffers();

    const order = await prisma.customOrder.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        status: true,
        assignmentAttempts: true,
        designerId: true,
        designer: {
          select: { designerId: true, name: true, rating: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Get all offers for this order
    const offers = await prisma.assignmentOffer.findMany({
      where: { customOrderId: id },
      include: {
        designer: {
          select: { designerId: true, name: true, rating: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Find active offer
    const activeOffer = offers.find(
      (o) => o.status === 'offered' && new Date(o.expiresAt) > new Date()
    );

    // Get eligible candidates (for display)
    let candidates: any[] = [];
    if (order.status === 'pending_assignment' || order.status === 'offered') {
      try {
        const rawCandidates = await buildCandidateList(id);
        candidates = rawCandidates.slice(0, 10).map((c) => ({
          designerId: c.designerId,
          name: c.name,
          specialty: c.specialty,
          rating: c.rating,
          currentLoad: c.currentLoad,
          maxCapacity: c.maxCapacity,
          score: Math.round(c.score * 100) / 100,
        }));
      } catch {
        // Ignore candidate build errors for status display
      }
    }

    return NextResponse.json({
      order: {
        orderId: order.orderId,
        status: order.status,
        assignmentAttempts: order.assignmentAttempts,
        assignedDesigner: order.designer
          ? {
              designerId: order.designer.designerId,
              name: order.designer.name,
              rating: order.designer.rating,
            }
          : null,
      },
      activeOffer: activeOffer
        ? {
            offerId: activeOffer.offerId,
            designer: {
              designerId: activeOffer.designer.designerId,
              name: activeOffer.designer.name,
            },
            expiresAt: activeOffer.expiresAt,
            secondsRemaining: Math.max(
              0,
              Math.round(
                (new Date(activeOffer.expiresAt).getTime() - Date.now()) / 1000
              )
            ),
          }
        : null,
      offerHistory: offers.map((o) => ({
        offerId: o.offerId,
        designer: { designerId: o.designer.designerId, name: o.designer.name },
        status: o.status,
        offeredAt: o.offeredAt,
        respondedAt: o.respondedAt,
        declineReason: o.declineReason,
      })),
      candidates,
    });
  } catch (error) {
    console.error('Failed to get assignment status:', error);
    return NextResponse.json({ error: 'Failed to get assignment status' }, { status: 500 });
  }
}
