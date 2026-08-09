import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/back-in-stock  { email, productId, name? }
//
// Public "Notify me when this is back in stock" request from a sold-out
// product page. One row per email+product; the back-in-stock cron emails
// them once the product is restocked.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const { email, productId, name } = await req.json();
    const clean = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!clean || !EMAIL_RE.test(clean)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'Missing product.' }, { status: 400 });
    }

    const product = await prisma.adminProduct.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    await prisma.backInStockRequest.upsert({
      where: { email_productId: { email: clean, productId } },
      update: { notifiedAt: null, name: name?.trim() || undefined },
      create: { email: clean, productId, name: name?.trim() || null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[back-in-stock]', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
