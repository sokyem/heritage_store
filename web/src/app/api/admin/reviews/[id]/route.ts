import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// PATCH /api/admin/reviews/[id] — approve or reject
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['founder', 'staff'].includes((session.user as any).role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { id } = await params;
  const { status } = await req.json(); // 'approved' | 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 });
  }

  const review = await prisma.productReview.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json({ review });
}

// DELETE /api/admin/reviews/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['founder', 'staff'].includes((session.user as any).role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { id } = await params;
  await prisma.productReview.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
