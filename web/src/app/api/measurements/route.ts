import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


// Calculate accuracy score based on measurement completeness
function calculateAccuracyScore(measurements: any): number {
  const fields = ['bust', 'waist', 'hip', 'shoulder', 'length', 'inseam', 'sleeveLength', 'neckline'];
  const filledFields = fields.filter(field => measurements[field] && measurements[field] > 0).length;
  const baseScore = (filledFields / fields.length) * 70; // 70% max from completeness
  
  // Bonus 30% for having fit preference and notes
  let bonus = 0;
  if (measurements.fitPreference) bonus += 15;
  if (measurements.notes) bonus += 15;
  
  return Math.min(100, Math.round(baseScore + bonus));
}

// GET /api/measurements - Get user's measurements
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const measurements = await prisma.measurement.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(measurements);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch measurements' }, { status: 500 });
  }
}

// POST /api/measurements - Create or update measurement
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, bust, waist, hip, shoulder, length, inseam, sleeveLength, neckline, fitPreference, notes } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    // Calculate accuracy
    const accuracy = calculateAccuracyScore({
      bust, waist, hip, shoulder, length, inseam, sleeveLength, neckline, fitPreference, notes
    });

    // Check if user has existing active measurement
    const existing = await prisma.measurement.findFirst({
      where: { userId, isActive: true },
    });

    let measurement;

    if (existing) {
      // Deactivate old measurement and create new one
      await prisma.measurement.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      measurement = await prisma.measurement.create({
        data: {
          userId,
          bust: bust || null,
          waist: waist || null,
          hip: hip || null,
          shoulder: shoulder || null,
          length: length || null,
          inseam: inseam || null,
          sleeveLength: sleeveLength || null,
          neckline: neckline || null,
          fitPreference: fitPreference || null,
          notes: notes || null,
          accuracy,
        },
      });
    } else {
      measurement = await prisma.measurement.create({
        data: {
          userId,
          bust: bust || null,
          waist: waist || null,
          hip: hip || null,
          shoulder: shoulder || null,
          length: length || null,
          inseam: inseam || null,
          sleeveLength: sleeveLength || null,
          neckline: neckline || null,
          fitPreference: fitPreference || null,
          notes: notes || null,
          accuracy,
        },
      });
    }

    return NextResponse.json(measurement);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save measurement' }, { status: 500 });
  }
}
