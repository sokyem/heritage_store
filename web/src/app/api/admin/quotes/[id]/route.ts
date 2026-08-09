import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

/* ──────────────────────────────────────────────────────────
   Helpers (mirror /api/admin/quotes/route.ts)
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
   GET /api/admin/quotes/[id]
   ────────────────────────────────────────────────────────── */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { client: true, customOrders: true },
    });
    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    return NextResponse.json(quote);
  } catch (error) {
    console.error('Failed to fetch quote:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote' },
      { status: 500 }
    );
  }
}

/* ──────────────────────────────────────────────────────────
   PUT /api/admin/quotes/[id]
   Recalculates totals server-side, just like POST.
   Supports both "full" updates (whole quote form) and
   lightweight status-only patches.
   ────────────────────────────────────────────────────────── */

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.quote.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // If pricing-related fields are present, fully recalc using the same
    // formula as POST. Otherwise allow partial updates (e.g. status only).
    const touchesPricing =
      body.lineItems !== undefined ||
      body.materialsTotal !== undefined ||
      body.laborTotal !== undefined ||
      body.fittingFee !== undefined ||
      body.rushFee !== undefined ||
      body.deliveryFee !== undefined ||
      body.discount !== undefined ||
      body.discountType !== undefined ||
      body.tax !== undefined;

    const data: Record<string, unknown> = {};

    if (body.clientId !== undefined) data.clientId = body.clientId;
    if (body.status !== undefined) data.status = body.status;
    if (body.validUntil !== undefined) data.validUntil = body.validUntil || null;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.terms !== undefined) data.terms = body.terms;
    if (body.convertedToOrderId !== undefined) {
      data.convertedToOrderId = body.convertedToOrderId;
    }

    if (touchesPricing) {
      const lineItems =
        body.lineItems !== undefined
          ? normalizeLineItems(body.lineItems)
          : (() => {
              try {
                return normalizeLineItems(JSON.parse(existing.lineItems));
              } catch {
                return [];
              }
            })();

      const materialsTotal =
        body.materialsTotal !== undefined ? toNum(body.materialsTotal) : existing.materialsTotal;
      const laborTotal =
        body.laborTotal !== undefined ? toNum(body.laborTotal) : existing.laborTotal;
      const fittingFee =
        body.fittingFee !== undefined ? toNum(body.fittingFee) : existing.fittingFee;
      const rushFee =
        body.rushFee !== undefined ? toNum(body.rushFee) : existing.rushFee;
      const deliveryFee =
        body.deliveryFee !== undefined ? toNum(body.deliveryFee) : existing.deliveryFee;
      const discount =
        body.discount !== undefined ? toNum(body.discount) : existing.discount;
      const discountType =
        body.discountType !== undefined
          ? (body.discountType === 'percentage' ? 'percentage' : 'fixed')
          : (existing.discountType || 'fixed');
      const tax = body.tax !== undefined ? toNum(body.tax) : existing.tax;

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

      data.lineItems = JSON.stringify(lineItems);
      data.materialsTotal = materialsTotal;
      data.laborTotal = laborTotal;
      data.fittingFee = fittingFee;
      data.rushFee = rushFee;
      data.deliveryFee = deliveryFee;
      data.discount = discount;
      data.discountType = discountType;
      data.tax = tax;
      data.subtotal = subtotal;
      data.total = total;
    }

    const quote = await prisma.quote.update({
      where: { id },
      data,
      include: { client: true },
    });
    return NextResponse.json(quote);
  } catch (error) {
    console.error('Failed to update quote:', error);
    return NextResponse.json(
      { error: 'Failed to update quote' },
      { status: 500 }
    );
  }
}

/* ──────────────────────────────────────────────────────────
   DELETE /api/admin/quotes/[id]
   ────────────────────────────────────────────────────────── */

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const existing = await prisma.quote.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    await prisma.quote.delete({ where: { id } });
    return NextResponse.json({ message: 'Quote deleted' });
  } catch (error) {
    console.error('Failed to delete quote:', error);
    return NextResponse.json(
      { error: 'Failed to delete quote' },
      { status: 500 }
    );
  }
}
