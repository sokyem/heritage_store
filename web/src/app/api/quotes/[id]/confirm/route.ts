import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

/**
 * GET /api/quotes/[id]/confirm?t=<token>&session_id=<stripe-session-id>
 *
 * Called by the public quote page after Stripe Checkout redirects back.
 * Verifies the session with Stripe; on success records the deposit,
 * converts the quote to a CustomOrder, and marks status="converted".
 *
 * Idempotent — safe to call repeatedly.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = req.nextUrl.searchParams.get('t');
    const sessionId = req.nextUrl.searchParams.get('session_id');

    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!quote || quote.accessToken !== token) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Already finalized — short-circuit
    if (quote.depositPaidAt) {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        customOrderRef: quote.convertedToOrderId,
      });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment not completed yet', paymentStatus: session.payment_status },
        { status: 402 },
      );
    }

    // Create the CustomOrder
    const lastOrder = await prisma.customOrder.findFirst({ orderBy: { orderId: 'desc' } });
    const nextNum = lastOrder ? parseInt(lastOrder.orderId.replace('CUS-', ''), 10) + 1 : 1;
    const customOrderRef = `CUS-${String(nextNum).padStart(3, '0')}`;

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

    const amountPaid = Number(quote.depositAmount || 0);

    const customOrder = await prisma.customOrder.create({
      data: {
        orderId: customOrderRef,
        clientId: quote.clientId,
        quoteId: quote.id,
        estimatedPrice: quote.total,
        finalPrice: quote.total,
        depositAmount: amountPaid,
        totalPaid: amountPaid,
        balance: Number((quote.total - amountPaid).toFixed(2)),
        status: 'deposit_paid',
        source: 'quote',
        notes: `Auto-created from accepted quote ${quote.quoteId}`,
      },
    });

    await prisma.orderActivity.create({
      data: {
        customOrderId: customOrder.id,
        action: 'status_change',
        description: `Order created from quote ${quote.quoteId}; deposit paid via Stripe.`,
        newValue: 'deposit_paid',
      },
    });

    await prisma.customOrderPayment.create({
      data: {
        paymentId: `CP-${Date.now().toString(36).toUpperCase()}`,
        customOrderId: customOrder.id,
        amount: amountPaid,
        method: 'Stripe',
        paymentType: 'Deposit',
        notes: `Quote ${quote.quoteId} deposit · Stripe session ${session.id}`,
      },
    });

    await prisma.quote.update({
      where: { id },
      data: {
        status: 'converted',
        depositPaidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        convertedToOrderId: customOrder.id,
      },
    });

    return NextResponse.json({
      ok: true,
      customOrderRef,
      customOrderId: customOrder.id,
    });
  } catch (error) {
    console.error('Quote confirm error:', error);
    return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 });
  }
}
