import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-guard';
import { recordAudit } from '@/lib/audit';
import { ROLES } from '@/lib/roles';

const RoleUpdate = z.object({ role: z.enum(ROLES as unknown as [string, ...string[]]) });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('team.manage');
  if (!auth.authorized) return auth.response;
  const { id } = await params;

  let body;
  try {
    body = RoleUpdate.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', details: (e as Error).message }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Safety: prevent removing the last founder.
  if (target.role === 'founder' && body.role !== 'founder') {
    const founderCount = await prisma.user.count({ where: { role: 'founder' } });
    if (founderCount <= 1) {
      return NextResponse.json({ error: 'Cannot demote the last founder' }, { status: 400 });
    }
  }

  await prisma.user.update({ where: { id }, data: { role: body.role } });
  await recordAudit({
    actorEmail: auth.email,
    action: 'update',
    entity: 'User',
    entityId: id,
    summary: `Role: ${target.role} → ${body.role}`,
  });
  return NextResponse.json({ ok: true });
}
