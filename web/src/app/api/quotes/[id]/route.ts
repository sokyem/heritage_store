import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/quotes/[id]?t=<token>
 *
 * Public, token-gated read of a quote for the client.
 * On first valid view, records viewedAt and bumps status from "sent" → "viewed".
 *
 * Returns only client-safe fields — no internal cost breakdown beyond what
 * the client should see (line items + summary totals).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = req.nextUrl.searchParams.get('t');
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    }

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!quote || quote.accessToken !== token) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Record first view
    if (!quote.viewedAt) {
      await prisma.quote.update({
        where: { id },
        data: {
          viewedAt: new Date(),
          status: quote.status === 'sent' ? 'viewed' : quote.status,
        },
      });
    }

    let lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }> = [];
    try { lineItems = JSON.parse(quote.lineItems); } catch {}

    let siteName = 'AWULA K';
    try {
      const g = await import('@/lib/settings').then((m) => m.getSetting('general'));
      siteName = g?.siteName || siteName;
    } catch {}

    return NextResponse.json({
      id: quote.id,
      quoteId: quote.quoteId,
      status: quote.status,
      clientName: quote.client?.name || null,
      lineItems,
      materialsTotal: quote.materialsTotal,
      laborTotal: quote.laborTotal,
      fittingFee: quote.fittingFee,
      rushFee: quote.rushFee,
      deliveryFee: quote.deliveryFee,
      discount: quote.discount,
      discountType: quote.discountType,
      subtotal: quote.subtotal,
      tax: quote.tax,
      total: quote.total,
      depositPercent: quote.depositPercent,
      depositAmount: quote.depositAmount,
      depositPaidAt: quote.depositPaidAt,
      validUntil: quote.validUntil,
      notes: quote.notes,
      terms: quote.terms,
      sentAt: quote.sentAt,
      acceptedAt: quote.acceptedAt,
      rejectedAt: quote.rejectedAt,
      siteName,
    });
  } catch (error) {
    console.error('Failed to fetch public quote:', error);
    return NextResponse.json({ error: 'Failed to fetch quote' }, { status: 500 });
  }
}
