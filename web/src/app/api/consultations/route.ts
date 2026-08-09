import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/consultations - Get all consultations with analysis data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const id = searchParams.get('id');

    if (id) {
      const consultation = await prisma.consultation.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!consultation) {
        return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
      }
      return NextResponse.json(consultation);
    }

    const consultations = await prisma.consultation.findMany({
      where: userId ? { userId } : undefined,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(consultations);
  } catch (error) {
    console.error('Failed to fetch consultations:', error);
    return NextResponse.json({ error: 'Failed to fetch consultations' }, { status: 500 });
  }
}

// POST /api/consultations - Create new consultation with intake fields
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      date,
      notes,
      eventType,
      eventDate,
      budget,
      stylePreferences,
      bodyType,
      colors,
      inspiration,
      specialNotes,
    } = body;

    // Use provided userId or fallback to a demo user
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      // Find or create a demo user for unauthenticated submissions
      let demoUser = await prisma.user.findUnique({
        where: { email: 'demo@awulak.com' },
      });
      if (!demoUser) {
        demoUser = await prisma.user.create({
          data: {
            email: 'demo@awulak.com',
            name: 'Demo Client',
            role: 'customer',
          },
        });
      }
      resolvedUserId = demoUser.id;
    }

    const consultation = await prisma.consultation.create({
      data: {
        userId: resolvedUserId,
        date: date ? new Date(date) : new Date(),
        notes,
        eventType,
        eventDate,
        budget,
        stylePreferences,
        bodyType,
        colors,
        inspiration,
        specialNotes,
        analysisStatus: 'pending',
      },
      include: { user: true },
    });

    return NextResponse.json(consultation);
  } catch (error) {
    console.error('Failed to create consultation:', error);
    return NextResponse.json({ error: 'Failed to create consultation' }, { status: 500 });
  }
}
