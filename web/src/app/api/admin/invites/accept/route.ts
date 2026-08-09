import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';

const AcceptSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  let body;
  try {
    body = AcceptSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', details: (e as Error).message }, { status: 400 });
  }

  const invite = await prisma.adminInvite.findUnique({ where: { token: body.token } });
  if (!invite) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  if (invite.acceptedAt) return NextResponse.json({ error: 'Already accepted' }, { status: 400 });
  if (invite.expiresAt < new Date())
    return NextResponse.json({ error: 'Invite expired' }, { status: 400 });

  const hash = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.upsert({
    where: { email: invite.email },
    update: { role: invite.role, name: body.name, password: hash },
    create: { email: invite.email, name: body.name, password: hash, role: invite.role },
  });

  await prisma.adminInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });

  await recordAudit({
    actorEmail: invite.email,
    action: 'create',
    entity: 'User',
    entityId: user.id,
    summary: `Accepted admin invite as ${invite.role}`,
  });

  return NextResponse.json({ ok: true, email: invite.email });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  const invite = await prisma.adminInvite.findUnique({ where: { token } });
  if (!invite) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  if (invite.acceptedAt) return NextResponse.json({ error: 'Already accepted' }, { status: 400 });
  if (invite.expiresAt < new Date())
    return NextResponse.json({ error: 'Invite expired' }, { status: 400 });
  return NextResponse.json({ email: invite.email, role: invite.role });
}
