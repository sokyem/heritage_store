import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-guard';
import { recordAudit } from '@/lib/audit';
import { DiscountInputSchema } from '@/lib/discounts';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('discounts.write');
  if (!auth.authorized) return auth.response;
  const { id } = await params;
  const item = await prisma.discount.findUnique({
    where: { id },
    include: { redemptions: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('discounts.write');
  if (!auth.authorized) return auth.response;
  const { id } = await params;

  let body;
  try {
    body = DiscountInputSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', details: (e as Error).message }, { status: 400 });
  }

  // Prevent code collisions when renaming.
  const dup = await prisma.discount.findUnique({ where: { code: body.code } });
  if (dup && dup.id !== id) return NextResponse.json({ error: 'Code already exists' }, { status: 409 });

  const updated = await prisma.discount.update({
    where: { id },
    data: {
      code: body.code,
      type: body.type,
      value: body.value,
      minSubtotal: body.minSubtotal ?? null,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      usageLimit: body.usageLimit ?? null,
      perCustomerLimit: body.perCustomerLimit ?? null,
      enabled: body.enabled,
      appliesTo: body.appliesTo ?? undefined,
      description: body.description ?? null,
      updatedBy: auth.email,
    },
  });

  await recordAudit({
    actorEmail: auth.email,
    action: 'update',
    entity: 'Discount',
    entityId: id,
    summary: `Updated discount ${body.code}`,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('discounts.write');
  if (!auth.authorized) return auth.response;
  const { id } = await params;
  await prisma.discount.delete({ where: { id } });
  await recordAudit({
    actorEmail: auth.email,
    action: 'delete',
    entity: 'Discount',
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}
