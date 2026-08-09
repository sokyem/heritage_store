import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-guard';
import { recordAudit } from '@/lib/audit';
import { DiscountInputSchema } from '@/lib/discounts';

export const dynamic = 'force-dynamic';

const DISCOUNT_SORTABLE: Record<string, 'createdAt' | 'code' | 'value' | 'enabled' | 'endsAt'> = {
  createdAt: 'createdAt',
  code: 'code',
  value: 'value',
  enabled: 'enabled',
  endsAt: 'endsAt',
};

export async function GET(req: Request) {
  const auth = await requirePermission('discounts.write');
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim().toLowerCase() || '';
  const sortByParam = searchParams.get('sortBy') || 'createdAt';
  const sortBy = DISCOUNT_SORTABLE[sortByParam] || 'createdAt';
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawSize = parseInt(searchParams.get('pageSize') || '25', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 25));

  const where = search
    ? {
        OR: [
          { code: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.discount.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.discount.count({ where }),
  ]);

  return NextResponse.json({
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sortBy: sortByParam in DISCOUNT_SORTABLE ? sortByParam : 'createdAt',
    sortDir,
  });
}

export async function POST(req: Request) {
  const auth = await requirePermission('discounts.write');
  if (!auth.authorized) return auth.response;

  let body;
  try {
    body = DiscountInputSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', details: (e as Error).message }, { status: 400 });
  }

  const existing = await prisma.discount.findUnique({ where: { code: body.code } });
  if (existing) return NextResponse.json({ error: 'Code already exists' }, { status: 409 });

  const created = await prisma.discount.create({
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
    action: 'create',
    entity: 'Discount',
    entityId: created.id,
    summary: `Created discount ${body.code}`,
  });

  return NextResponse.json({ item: created });
}
