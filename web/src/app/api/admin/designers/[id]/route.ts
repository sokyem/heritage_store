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
    const designer = await prisma.partnerDesigner.findUnique({
      where: { id },
      include: {
        customOrders: true,
        user: { select: { id: true, email: true, name: true, role: true } },
        assignmentOffers: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            offerId: true,
            status: true,
            offeredAt: true,
            respondedAt: true,
            customOrder: { select: { orderId: true, eventType: true } },
          },
        },
      },
    });

    if (!designer) {
      return NextResponse.json({ error: 'Designer not found' }, { status: 404 });
    }

    return NextResponse.json(designer);
  } catch (error) {
    console.error('Failed to fetch designer:', error);
    return NextResponse.json({ error: 'Failed to fetch designer' }, { status: 500 });
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

    const existing = await prisma.partnerDesigner.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Designer not found' }, { status: 404 });
    }

    // Handle userId linking
    let userId = body.userId;
    if (userId === '') userId = null; // Allow unlinking

    const updated = await prisma.partnerDesigner.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.businessName !== undefined && { businessName: body.businessName }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.location !== undefined && { location: body.location }),
        ...(body.specialty !== undefined && { specialty: body.specialty }),
        ...(body.bio !== undefined && { bio: body.bio }),
        ...(body.portfolioUrl !== undefined && { portfolioUrl: body.portfolioUrl }),
        ...(body.profileImage !== undefined && { profileImage: body.profileImage }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.maxCapacity !== undefined && { maxCapacity: body.maxCapacity }),
        ...(body.currentLoad !== undefined && { currentLoad: body.currentLoad }),
        ...(body.rating !== undefined && { rating: body.rating }),
        ...(body.completedOrders !== undefined && { completedOrders: body.completedOrders }),
        ...(body.avgDeliveryDays !== undefined && { avgDeliveryDays: body.avgDeliveryDays }),
        ...(body.priceRange !== undefined && { priceRange: body.priceRange }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(userId !== undefined && { userId }),
      },
      include: {
        customOrders: true,
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update designer:', error);
    return NextResponse.json({ error: 'Failed to update designer' }, { status: 500 });
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
    const existing = await prisma.partnerDesigner.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Designer not found' }, { status: 404 });
    }

    await prisma.partnerDesigner.delete({ where: { id } });

    return NextResponse.json({ message: 'Designer deleted' });
  } catch (error) {
    console.error('Failed to delete designer:', error);
    return NextResponse.json({ error: 'Failed to delete designer' }, { status: 500 });
  }
}
