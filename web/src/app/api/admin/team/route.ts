import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission('team.manage');
  if (!auth.authorized) return auth.response;

  const [users, invites] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: 'customer' } },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.adminInvite.findMany({
      where: { acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({ users, invites });
}
