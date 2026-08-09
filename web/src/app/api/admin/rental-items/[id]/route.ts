import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

/* ── GET single rental item (with recent rental orders) ───────── */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const item = await prisma.rentalItem.findUnique({
      where: { id },
      include: {
        rentalOrders: {
          include: { client: true },
          orderBy: { startDate: 'desc' },
          take: 10,
        },
      },
    });
    if (!item) {
      return NextResponse.json({ error: 'Rental item not found' }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error('Failed to fetch rental item:', error);
    return NextResponse.json({ error: 'Failed to fetch rental item' }, { status: 500 });
  }
}

/* ── PUT update rental item ────────────────────────────────────── */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.rentalItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rental item not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.category !== undefined) data.category = body.category;
    if (body.size !== undefined) data.size = body.size;
    if (body.color !== undefined) data.color = body.color;
    if (body.images !== undefined) data.images = body.images;
    if (body.rentalPrice !== undefined) data.rentalPrice = Number(body.rentalPrice);
    if (body.replacementCost !== undefined) {
      data.replacementCost = body.replacementCost != null ? Number(body.replacementCost) : null;
    }
    if (body.condition !== undefined) data.condition = body.condition;
    if (body.maintenanceStatus !== undefined) data.maintenanceStatus = body.maintenanceStatus;
    if (body.isAvailable !== undefined) data.isAvailable = Boolean(body.isAvailable);
    if (body.timesRented !== undefined) data.timesRented = Number(body.timesRented);
    if (body.lastCleaned !== undefined) {
      data.lastCleaned = body.lastCleaned ? new Date(body.lastCleaned) : null;
    }
    if (body.notes !== undefined) data.notes = body.notes;

    const item = await prisma.rentalItem.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Failed to update rental item:', error);
    return NextResponse.json({ error: 'Failed to update rental item' }, { status: 500 });
  }
}

/* ── DELETE rental item ────────────────────────────────────────── */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const existing = await prisma.rentalItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rental item not found' }, { status: 404 });
    }
    await prisma.rentalItem.delete({ where: { id } });
    return NextResponse.json({ message: 'Rental item deleted' });
  } catch (error) {
    console.error('Failed to delete rental item:', error);
    return NextResponse.json({ error: 'Failed to delete rental item' }, { status: 500 });
  }
}
