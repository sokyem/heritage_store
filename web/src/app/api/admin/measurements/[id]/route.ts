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
    const measurement = await prisma.clientMeasurement.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!measurement) {
      return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
    }

    return NextResponse.json(measurement);
  } catch (error) {
    console.error('Failed to fetch measurement:', error);
    return NextResponse.json({ error: 'Failed to fetch measurement' }, { status: 500 });
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

    const existing = await prisma.clientMeasurement.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
    }

    const updated = await prisma.clientMeasurement.update({
      where: { id },
      data: {
        ...(body.profileName !== undefined && { profileName: body.profileName }),
        ...(body.bust !== undefined && { bust: body.bust }),
        ...(body.waist !== undefined && { waist: body.waist }),
        ...(body.hip !== undefined && { hip: body.hip }),
        ...(body.shoulder !== undefined && { shoulder: body.shoulder }),
        ...(body.sleeve !== undefined && { sleeve: body.sleeve }),
        ...(body.length !== undefined && { length: body.length }),
        ...(body.inseam !== undefined && { inseam: body.inseam }),
        ...(body.neckline !== undefined && { neckline: body.neckline }),
        ...(body.armhole !== undefined && { armhole: body.armhole }),
        ...(body.backWidth !== undefined && { backWidth: body.backWidth }),
        ...(body.frontLength !== undefined && { frontLength: body.frontLength }),
        ...(body.skirtLength !== undefined && { skirtLength: body.skirtLength }),
        ...(body.trouserLength !== undefined && { trouserLength: body.trouserLength }),
        ...(body.fitPreference !== undefined && { fitPreference: body.fitPreference }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.accuracy !== undefined && { accuracy: body.accuracy }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.measuredBy !== undefined && { measuredBy: body.measuredBy }),
      },
      include: { client: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update measurement:', error);
    return NextResponse.json({ error: 'Failed to update measurement' }, { status: 500 });
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
    const existing = await prisma.clientMeasurement.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
    }

    await prisma.clientMeasurement.delete({ where: { id } });

    return NextResponse.json({ message: 'Measurement deleted' });
  } catch (error) {
    console.error('Failed to delete measurement:', error);
    return NextResponse.json({ error: 'Failed to delete measurement' }, { status: 500 });
  }
}
