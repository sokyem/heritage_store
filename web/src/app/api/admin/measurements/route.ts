import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId');

    const where = clientId ? { clientId } : {};

    const measurements = await prisma.clientMeasurement.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { client: true },
    });

    return NextResponse.json(measurements);
  } catch (error) {
    console.error('Failed to fetch measurements:', error);
    return NextResponse.json({ error: 'Failed to fetch measurements' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    const measurement = await prisma.clientMeasurement.create({
      data: {
        clientId: body.clientId,
        profileName: body.profileName || 'Default',
        bust: body.bust ?? null,
        waist: body.waist ?? null,
        hip: body.hip ?? null,
        shoulder: body.shoulder ?? null,
        sleeve: body.sleeve ?? null,
        length: body.length ?? null,
        inseam: body.inseam ?? null,
        neckline: body.neckline ?? null,
        armhole: body.armhole ?? null,
        backWidth: body.backWidth ?? null,
        frontLength: body.frontLength ?? null,
        skirtLength: body.skirtLength ?? null,
        trouserLength: body.trouserLength ?? null,
        fitPreference: body.fitPreference || null,
        notes: body.notes || null,
        accuracy: body.accuracy ?? 0,
        isActive: body.isActive ?? true,
        measuredBy: body.measuredBy || null,
      },
      include: { client: true },
    });

    return NextResponse.json(measurement, { status: 201 });
  } catch (error) {
    console.error('Failed to create measurement:', error);
    return NextResponse.json({ error: 'Failed to create measurement' }, { status: 500 });
  }
}
