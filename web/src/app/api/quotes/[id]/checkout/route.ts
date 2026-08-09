import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

/**
 * POST /api/quotes/[id]/checkout?t=<token>
 *
 * Creates a Stripe Checkout Session for the quote's deposit and returns
 * the hosted payment URL. The client is redirected there; on success
 * Stripe redirects back to /quote/[id]?t=...&paid=1 which calls the
 * confirm endpoint.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = req.nextUrl.searchParams.get('t');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!quote || quote.accessToken !== token) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (quote.status === 'converted' || quote.depositPaidAt) {
      return NextResponse.json(
        { error: 'Deposit has already been paid for this quote.' },
        { status: 409 },
      );
    }

    if (quote.status === 'rejected') {
      return NextResponse.json(
        { error: 'This quote was declined and cannot be paid.' },
        { status: 409 },
      );
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Online payments are not configured. Please contact us to pay another way.' },
        { status: 503 },
      );
    }

    const amount = Number(quote.depositAmount || 0);
    if (amount <= 0) {
      return NextResponse.json({ error: 'Invalid deposit amount' }, { status: 400 });
    }

    const stripe = getStripe();
    const origin = req.nextUrl.origin;
    const returnUrl = `${origin}/quote/${id}?t=${token}&session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: quote.client?.email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: `Deposit for ${quote.quoteId}`,
              description: `${quote.depositPercent}% deposit to begin production`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        quoteId: quote.id,
        quoteRef: quote.quoteId,
        clientId: quote.clientId,
      },
      success_url: returnUrl,
      cancel_url: `${origin}/quote/${id}?t=${token}&cancelled=1`,
    });

    // Mark accepted on first checkout creation
    await prisma.quote.update({
      where: { id },
      data: {
        status: quote.status === 'converted' ? 'converted' : 'accepted',
        acceptedAt: quote.acceptedAt || new Date(),
        stripeCheckoutSessionId: session.id,
      },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Quote checkout error:', error);
    return NextResponse.json({ error: 'Failed to start checkout' }, { status: 500 });
  }
}
