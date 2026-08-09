import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

/* ── GET /api/admin/rentals?status=... ────────────────────────────
   List all rental orders with client + rentalItem relations, ordered
   by startDate desc. Optional ?status=<value> filter.
   ─────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const where = status ? { status } : {};

    const rentals = await prisma.rentalOrder.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: { client: true, rentalItem: true },
    });
    return NextResponse.json(rentals);
  } catch (error) {
    console.error('Failed to fetch rental orders:', error);
    return NextResponse.json({ error: 'Failed to fetch rental orders' }, { status: 500 });
  }
}

/* ── POST /api/admin/rentals ──────────────────────────────────────
   Auto-generates rentalId RNT-001, RNT-002, etc.
   Validates clientId + rentalItemId exist before insert.
   ─────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    if (!body.clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }
    if (!body.rentalItemId) {
      return NextResponse.json({ error: 'rentalItemId is required' }, { status: 400 });
    }
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    // Validate FKs exist
    const [client, item] = await Promise.all([
      prisma.client.findUnique({ where: { id: body.clientId } }),
      prisma.rentalItem.findUnique({ where: { id: body.rentalItemId } }),
    ]);
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    if (!item) return NextResponse.json({ error: 'Rental item not found' }, { status: 404 });

    // Auto-generate rentalId — count + 1, padded to 3 digits
    const count = await prisma.rentalOrder.count();
    const rentalId = `RNT-${String(count + 1).padStart(3, '0')}`;

    const rentalPrice = Number(body.rentalPrice ?? 0);
    const deposit = Number(body.deposit ?? 0);
    const totalPaid = Number(body.totalPaid ?? deposit);

    const rental = await prisma.rentalOrder.create({
      data: {
        rentalId,
        clientId: body.clientId,
        rentalItemId: body.rentalItemId,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        returnDate: body.returnDate ? new Date(body.returnDate) : null,
        rentalPrice,
        deposit,
        totalPaid,
        lateFee: Number(body.lateFee ?? 0),
        damageFee: Number(body.damageFee ?? 0),
        status: body.status || 'reserved',
        conditionOut: body.conditionOut || null,
        conditionIn: body.conditionIn || null,
        cleaningNeeded: Boolean(body.cleaningNeeded ?? false),
        damageNotes: body.damageNotes || null,
        notes: body.notes || null,
      },
      include: { client: true, rentalItem: true },
    });

    return NextResponse.json(rental, { status: 201 });
  } catch (error) {
    console.error('Failed to create rental order:', error);
    return NextResponse.json({ error: 'Failed to create rental order' }, { status: 500 });
  }
}
