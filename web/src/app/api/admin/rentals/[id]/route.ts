import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

const includeAll = {
  client: true,
  rentalItem: true,
} as const;

/* ── GET single rental ───────────────────────────────────────── */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const rental = await prisma.rentalOrder.findUnique({
      where: { id },
      include: includeAll,
    });
    if (!rental) {
      return NextResponse.json({ error: 'Rental order not found' }, { status: 404 });
    }
    return NextResponse.json(rental);
  } catch (error) {
    console.error('Failed to fetch rental order:', error);
    return NextResponse.json({ error: 'Failed to fetch rental order' }, { status: 500 });
  }
}

/* ── PUT update rental ───────────────────────────────────────────
   Side-effect: when status transitions to "returned", auto-set
   returnDate to NOW (unless explicitly provided in the body).
   ─────────────────────────────────────────────────────────────── */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.rentalOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rental order not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.clientId !== undefined) data.clientId = body.clientId;
    if (body.rentalItemId !== undefined) data.rentalItemId = body.rentalItemId;
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) data.endDate = new Date(body.endDate);
    if (body.returnDate !== undefined) {
      data.returnDate = body.returnDate ? new Date(body.returnDate) : null;
    }
    if (body.rentalPrice !== undefined) data.rentalPrice = Number(body.rentalPrice);
    if (body.deposit !== undefined) data.deposit = Number(body.deposit);
    if (body.totalPaid !== undefined) data.totalPaid = Number(body.totalPaid);
    if (body.lateFee !== undefined) data.lateFee = Number(body.lateFee);
    if (body.damageFee !== undefined) data.damageFee = Number(body.damageFee);
    if (body.conditionOut !== undefined) data.conditionOut = body.conditionOut;
    if (body.conditionIn !== undefined) data.conditionIn = body.conditionIn;
    if (body.cleaningNeeded !== undefined) data.cleaningNeeded = Boolean(body.cleaningNeeded);
    if (body.damageNotes !== undefined) data.damageNotes = body.damageNotes;
    if (body.notes !== undefined) data.notes = body.notes;

    // Status transition: returned → auto stamp returnDate
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === 'returned' && existing.status !== 'returned' && body.returnDate === undefined) {
        data.returnDate = new Date();
      }
    }

    const rental = await prisma.rentalOrder.update({
      where: { id },
      data,
      include: includeAll,
    });
    return NextResponse.json(rental);
  } catch (error) {
    console.error('Failed to update rental order:', error);
    return NextResponse.json({ error: 'Failed to update rental order' }, { status: 500 });
  }
}

/* ── DELETE rental ───────────────────────────────────────────── */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const existing = await prisma.rentalOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rental order not found' }, { status: 404 });
    }
    await prisma.rentalOrder.delete({ where: { id } });
    return NextResponse.json({ message: 'Rental order deleted' });
  } catch (error) {
    console.error('Failed to delete rental order:', error);
    return NextResponse.json({ error: 'Failed to delete rental order' }, { status: 500 });
  }
}
