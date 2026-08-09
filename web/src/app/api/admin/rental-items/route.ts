import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

/* ── GET /api/admin/rental-items?available=true ───────────────────
   List rental items ordered by name. Supports ?available=true|false.
   ─────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const available = searchParams.get('available');

    const where = available !== null ? { isAvailable: available === 'true' } : {};

    const items = await prisma.rentalItem.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { rentalOrders: true } } },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Failed to fetch rental items:', error);
    return NextResponse.json({ error: 'Failed to fetch rental items' }, { status: 500 });
  }
}

/* ── POST /api/admin/rental-items ─────────────────────────────────
   Auto-generates itemId RI-001, RI-002, etc.
   ─────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Auto-generate itemId — count + 1, padded to 3 digits
    const count = await prisma.rentalItem.count();
    const itemId = `RI-${String(count + 1).padStart(3, '0')}`;

    const item = await prisma.rentalItem.create({
      data: {
        itemId,
        name: String(body.name).trim(),
        description: body.description || null,
        category: body.category || null,
        size: body.size || null,
        color: body.color || null,
        images: body.images || null,
        rentalPrice: Number(body.rentalPrice ?? 0),
        replacementCost: body.replacementCost != null ? Number(body.replacementCost) : null,
        condition: body.condition || 'excellent',
        maintenanceStatus: body.maintenanceStatus || 'clean',
        isAvailable: body.isAvailable ?? true,
        notes: body.notes || null,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Failed to create rental item:', error);
    return NextResponse.json({ error: 'Failed to create rental item' }, { status: 500 });
  }
}
