import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-guard';
import { recordAudit } from '@/lib/audit';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/roles';
import { sendTemplate } from '@/lib/email';

const InviteSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.enum(ROLES as unknown as [string, ...string[]]),
});

const INVITE_TTL_DAYS = 7;

export async function POST(req: Request) {
  const auth = await requirePermission('team.manage');
  if (!auth.authorized) return auth.response;

  let body;
  try {
    body = InviteSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', details: (e as Error).message }, { status: 400 });
  }

  if (body.role === 'customer') {
    return NextResponse.json({ error: 'Cannot invite as customer' }, { status: 400 });
  }

  // If the user already exists, just update their role rather than creating an invite.
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    await prisma.user.update({ where: { email: body.email }, data: { role: body.role } });
    await recordAudit({
      actorEmail: auth.email,
      action: 'update',
      entity: 'User',
      entityId: existing.id,
      summary: `Role changed to ${body.role}`,
    });
    return NextResponse.json({ ok: true, mode: 'role_updated' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.adminInvite.create({
    data: {
      email: body.email,
      role: body.role,
      token,
      expiresAt,
      invitedBy: auth.email,
    },
  });

  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const acceptUrl = `${appUrl}/admin/accept-invite?token=${token}`;

  await sendTemplate('admin_invite', body.email, {
    name: body.email.split('@')[0],
    inviterName: auth.email,
    roleLabel: ROLE_LABELS[body.role as Role] ?? body.role,
    acceptUrl,
  });

  await recordAudit({
    actorEmail: auth.email,
    action: 'create',
    entity: 'AdminInvite',
    entityId: invite.id,
    summary: `Invited ${body.email} as ${body.role}`,
  });

  return NextResponse.json({ ok: true, mode: 'invited', invite: { id: invite.id, expiresAt } });
}

export async function DELETE(req: Request) {
  const auth = await requirePermission('team.manage');
  if (!auth.authorized) return auth.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await prisma.adminInvite.delete({ where: { id } });
  await recordAudit({ actorEmail: auth.email, action: 'delete', entity: 'AdminInvite', entityId: id });
  return NextResponse.json({ ok: true });
}
