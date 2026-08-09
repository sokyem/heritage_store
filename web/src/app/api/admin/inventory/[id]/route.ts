import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const item = await prisma.fabricInventory.update({
      where: { id },
      data: {
        fabricType: body.fabricType ?? undefined,
        color: body.color ?? undefined,
        quantity: body.quantity ?? undefined,
        unit: body.unit ?? undefined,
        supplier: body.supplier ?? undefined,
        cost: body.cost ?? undefined,
        usedForOrder: body.usedForOrder ?? undefined,
      },
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.fabricInventory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
