import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * POST /api/quotes/[id]/decline?t=<token>
 * Client declines the quote.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = req.nextUrl.searchParams.get('t');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote || quote.accessToken !== token) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (quote.status === 'converted' || quote.status === 'accepted') {
      return NextResponse.json(
        { error: 'This quote has already been accepted and cannot be declined.' },
        { status: 409 },
      );
    }

    await prisma.quote.update({
      where: { id },
      data: { status: 'rejected', rejectedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to decline quote:', error);
    return NextResponse.json({ error: 'Failed to decline quote' }, { status: 500 });
  }
}
