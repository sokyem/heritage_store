import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

/* ──────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */

interface LineItemInput {
  description?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  total?: number | string;
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function normalizeLineItems(raw: unknown): Array<{
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}> {
  if (!Array.isArray(raw)) return [];
  return (raw as LineItemInput[]).map((li) => {
    const quantity = toNum(li.quantity);
    const unitPrice = toNum(li.unitPrice);
    return {
      description: String(li.description ?? ''),
      quantity,
      unitPrice,
      total: Number((quantity * unitPrice).toFixed(2)),
    };
  });
}

function calcTotals(input: {
  materialsTotal: number;
  laborTotal: number;
  fittingFee: number;
  rushFee: number;
  deliveryFee: number;
  discount: number;
  discountType: string | null;
  tax: number;
}) {
  const subtotal =
    input.materialsTotal +
    input.laborTotal +
    input.fittingFee +
    input.rushFee +
    input.deliveryFee;

  const discountAmount =
    input.discountType === 'percentage'
      ? subtotal * (input.discount / 100)
      : input.discount;

  const total = Math.max(0, subtotal - discountAmount + input.tax);

  return {
    subtotal: Number(subtotal.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

/* ──────────────────────────────────────────────────────────
   GET /api/admin/quotes
   Filters: ?status=&clientId=
   ────────────────────────────────────────────────────────── */

const SORTABLE_COLUMNS: Record<string, 'quoteId' | 'updatedAt' | 'total' | 'status' | 'validUntil'> = {
  quoteId: 'quoteId',
  updatedAt: 'updatedAt',
  total: 'total',
  status: 'status',
  validUntil: 'validUntil',
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const clientId = searchParams.get('clientId');
    const wantsPaginated =
      searchParams.has('page') ||
      searchParams.has('pageSize') ||
      searchParams.get('paginate') === '1';

    const where: Record<string, string> = {};
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;

    if (!wantsPaginated) {
      const quotes = await prisma.quote.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: { client: true },
      });
      return NextResponse.json(quotes);
    }

    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const sortByParam = searchParams.get('sortBy') || 'updatedAt';
    const sortBy = SORTABLE_COLUMNS[sortByParam] || 'updatedAt';
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const rawSize = parseInt(searchParams.get('pageSize') || '25', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) ? rawSize : 25));

    const fullWhere = {
      ...where,
      ...(search
        ? {
            OR: [
              { quoteId: { contains: search, mode: 'insensitive' as const } },
              { client: { name: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.quote.findMany({
        where: fullWhere,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { client: true },
      }),
      prisma.quote.count({ where: fullWhere }),
    ]);

    return NextResponse.json({
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sortBy: sortByParam in SORTABLE_COLUMNS ? sortByParam : 'updatedAt',
      sortDir,
    });
  } catch (error) {
    console.error('Failed to fetch quotes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quotes' },
      { status: 500 }
    );
  }
}

/* ──────────────────────────────────────────────────────────
   POST /api/admin/quotes
   ────────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    if (!body.clientId) {
      return NextResponse.json(
        { error: 'clientId is required' },
        { status: 400 }
      );
    }

    // Auto-generate next QUO-### id
    const count = await prisma.quote.count();
    const quoteId = `QUO-${String(count + 1).padStart(3, '0')}`;

    // Normalise + calc
    const lineItems = normalizeLineItems(body.lineItems);

    const materialsTotal = toNum(body.materialsTotal);
    const laborTotal = toNum(body.laborTotal);
    const fittingFee = toNum(body.fittingFee);
    const rushFee = toNum(body.rushFee);
    const deliveryFee = toNum(body.deliveryFee);
    const discount = toNum(body.discount);
    const discountType = body.discountType === 'percentage' ? 'percentage' : 'fixed';
    const tax = toNum(body.tax);

    const { subtotal, total } = calcTotals({
      materialsTotal,
      laborTotal,
      fittingFee,
      rushFee,
      deliveryFee,
      discount,
      discountType,
      tax,
    });

    const quote = await prisma.quote.create({
      data: {
        quoteId,
        clientId: body.clientId,
        lineItems: JSON.stringify(lineItems),
        materialsTotal,
        laborTotal,
        fittingFee,
        rushFee,
        deliveryFee,
        discount,
        discountType,
        subtotal,
        tax,
        total,
        status: body.status || 'draft',
        validUntil: body.validUntil || null,
        notes: body.notes || null,
        terms: body.terms || null,
      },
      include: { client: true },
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (error) {
    console.error('Failed to create quote:', error);
    return NextResponse.json(
      { error: 'Failed to create quote' },
      { status: 500 }
    );
  }
}
