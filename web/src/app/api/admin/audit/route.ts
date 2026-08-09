import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

// GET /api/admin/audit?entity=&action=&actor=&take=&skip=
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get('entity') || undefined;
  const action = searchParams.get('action') || undefined;
  const actor = searchParams.get('actor') || undefined;
  const take = Math.min(parseInt(searchParams.get('take') || '50', 10) || 50, 200);
  const skip = Math.max(parseInt(searchParams.get('skip') || '0', 10) || 0, 0);

  const where: Record<string, unknown> = {};
  if (entity) where.entity = entity;
  if (action) where.action = action;
  if (actor) where.actorEmail = { contains: actor, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({ items, total, take, skip });
}
