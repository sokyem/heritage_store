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
    const consultation = await prisma.adminConsultation.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!consultation) {
      return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
    }

    return NextResponse.json(consultation);
  } catch (error) {
    console.error('Failed to fetch consultation:', error);
    return NextResponse.json({ error: 'Failed to fetch consultation' }, { status: 500 });
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

    const existing = await prisma.adminConsultation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
    }

    // Validate the date if one is being changed
    let parsedDate: Date | undefined;
    if (body.scheduledDate !== undefined) {
      parsedDate = new Date(body.scheduledDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: `Invalid date: "${body.scheduledDate}". Use YYYY-MM-DD.` },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.adminConsultation.update({
      where: { id },
      data: {
        ...(body.clientId !== undefined && { clientId: body.clientId }),
        ...(body.clientName !== undefined && { clientName: body.clientName }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.purpose !== undefined && { purpose: body.purpose }),
        ...(parsedDate && { scheduledDate: parsedDate }),
        ...(body.scheduledTime !== undefined && { scheduledTime: body.scheduledTime }),
        ...(body.duration !== undefined && { duration: Number(body.duration) || 30 }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo }),
        ...(body.preNotes !== undefined && { preNotes: body.preNotes }),
        ...(body.sessionNotes !== undefined && { sessionNotes: body.sessionNotes }),
        ...(body.outcome !== undefined && { outcome: body.outcome }),
        ...(body.followUpDate !== undefined && { followUpDate: body.followUpDate }),
        ...(body.aiSummary !== undefined && { aiSummary: body.aiSummary }),
      },
      include: { client: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update consultation:', error);
    return NextResponse.json({ error: 'Failed to update consultation' }, { status: 500 });
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
    const existing = await prisma.adminConsultation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Consultation not found' }, { status: 404 });
    }

    await prisma.adminConsultation.delete({ where: { id } });

    return NextResponse.json({ message: 'Consultation deleted' });
  } catch (error) {
    console.error('Failed to delete consultation:', error);
    return NextResponse.json({ error: 'Failed to delete consultation' }, { status: 500 });
  }
}
