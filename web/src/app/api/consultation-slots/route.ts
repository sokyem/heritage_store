import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/consultation-slots - Get available slots (optionally filtered by date range)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const availableOnly = searchParams.get('available') !== 'false';

    const where: Record<string, unknown> = {};

    if (availableOnly) {
      where.isAvailable = true;
    }

    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, unknown>).gte = new Date(from);
      if (to) (where.date as Record<string, unknown>).lte = new Date(to);
    }

    const slots = await prisma.consultationSlot.findMany({
      where,
      include: {
        bookings: {
          where: { status: { not: 'cancelled' } },
          select: { id: true },
        },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    // Filter out fully booked slots for customer view
    const result = slots.map((slot) => ({
      ...slot,
      currentBookings: slot.bookings.length,
      isFull: slot.bookings.length >= slot.maxBookings,
      bookings: undefined, // don't expose booking details
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch consultation slots:', error);
    return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
  }
}

// POST /api/consultation-slots - Create a new slot (admin only)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, startTime, endTime, duration, type, maxBookings, notes } = body;

    if (!date || !startTime || !endTime) {
      return NextResponse.json({ error: 'date, startTime, and endTime are required' }, { status: 400 });
    }

    const slot = await prisma.consultationSlot.create({
      data: {
        date: new Date(date),
        startTime,
        endTime,
        duration: duration || 30,
        type: type || 'virtual',
        maxBookings: maxBookings || 1,
        notes: notes || null,
        isAvailable: true,
      },
    });

    return NextResponse.json(slot);
  } catch (error) {
    console.error('Failed to create consultation slot:', error);
    return NextResponse.json({ error: 'Failed to create slot' }, { status: 500 });
  }
}

// PUT /api/consultation-slots - Update a slot
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Slot id is required' }, { status: 400 });
    }

    if (data.date) {
      data.date = new Date(data.date);
    }

    const slot = await prisma.consultationSlot.update({
      where: { id },
      data,
    });

    return NextResponse.json(slot);
  } catch (error) {
    console.error('Failed to update slot:', error);
    return NextResponse.json({ error: 'Failed to update slot' }, { status: 500 });
  }
}

// DELETE /api/consultation-slots - Delete one slot (?id=…) or many (?ids=a,b,c)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const idsParam = searchParams.get('ids');

    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ error: 'ids must contain at least one slot id' }, { status: 400 });
      }
      const result = await prisma.consultationSlot.deleteMany({ where: { id: { in: ids } } });
      return NextResponse.json({ success: true, deleted: result.count });
    }

    if (!id) {
      return NextResponse.json({ error: 'Slot id is required' }, { status: 400 });
    }

    await prisma.consultationSlot.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete slot:', error);
    return NextResponse.json({ error: 'Failed to delete slot' }, { status: 500 });
  }
}
