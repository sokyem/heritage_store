import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { capturePayPalOrder, createPayPalOrder, isPayPalConfigured } from '@/lib/paypal';
import { autoCreateShipmentForOrder } from '@/lib/auto-shipping';
import { abandonStalePendingOrders } from '@/lib/orders';
import { getSetting } from '@/lib/settings';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const body = await request.json();
    const {
      orderId,
      amount,
      currency = 'usd',
      description,
      guestEmail,
      provider = 'stripe',
    } = body;

    if (!orderId || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'Order ID and amount required' },
        { status: 400 }
      );
    }

    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    const normalizedProvider = provider === 'paypal' ? 'paypal' : 'stripe';

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true, user: true },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const business = await getSetting('business').catch(() => null);
    const taxRate = Math.max(0, Math.min(100, business?.taxRate || 0));
    const baseForTax = Math.max(0, Number(order?.amount || 0));
    const computedTax = Math.round(baseForTax * taxRate) / 100;
    const taxAmount = order?.tax ?? (computedTax > 0 ? computedTax : null);

    let user;
    if (session?.user?.email) {
      user = await prisma.user.findUnique({ where: { email: session.user.email } });
      if (!user || order.userId !== user.id) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
    } else {
      if (!guestEmail) {
        return NextResponse.json(
          { error: 'Email is required for guest checkout' },
          { status: 400 },
        );
      }

      if (!order.user?.email || order.user.email.toLowerCase() !== String(guestEmail).toLowerCase()) {
        return NextResponse.json(
          { error: 'Guest email does not match this order' },
          { status: 403 },
        );
      }

      user = order.user;
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found. Please provide a valid email.' }, { status: 404 });
    }

    let payment = await prisma.payment.findFirst({
      where: { orderId },
    });

    if (payment) {
      if (payment.stripePaymentIntentId) {
        if (!isStripeConfigured()) {
          return NextResponse.json(
            { error: 'Stripe is not configured' },
            { status: 503 }
          );
        }

        const stripe = getStripe();
        try {
          await stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
        } catch (error) {
          console.error('Failed to cancel previous payment intent:', error);
        }
      }
    }

    if (normalizedProvider === 'paypal') {
      if (!isPayPalConfigured()) {
        return NextResponse.json(
          { error: 'PayPal is not configured' },
          { status: 503 },
        );
      }

      const returnUrl = new URL(`${request.nextUrl.origin}/checkout/${orderId}`);
      const cancelUrl = new URL(`${request.nextUrl.origin}/checkout/${orderId}`);
      if (guestEmail) {
        returnUrl.searchParams.set('guestEmail', String(guestEmail));
        cancelUrl.searchParams.set('guestEmail', String(guestEmail));
      }
      returnUrl.searchParams.set('provider', 'paypal');
      returnUrl.searchParams.set('status', 'success');
      cancelUrl.searchParams.set('provider', 'paypal');
      cancelUrl.searchParams.set('status', 'cancelled');

      const paypalOrder = await createPayPalOrder({
        orderId,
        amount: normalizedAmount,
        currency,
        description: description || `Order: ${order.product.name}`,
        returnUrl: returnUrl.toString(),
        cancelUrl: cancelUrl.toString(),
      });

      if (payment) {
        payment = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            amount: normalizedAmount,
            currency,
            status: 'pending',
            paymentMethod: 'paypal',
            description,
            stripePaymentIntentId: null,
            stripeClientSecret: null,
            paypalOrderId: paypalOrder.paypalOrderId,
            paypalPayerId: null,
          },
        });
      } else {
        payment = await prisma.payment.create({
          data: {
            userId: user.id,
            orderId,
            amount: normalizedAmount,
            currency,
            status: 'pending',
            paymentMethod: 'paypal',
            description,
            paypalOrderId: paypalOrder.paypalOrderId,
          },
        });
      }

      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentId: payment.id,
          amount: normalizedAmount,
          tax: taxAmount,
          currency,
        },
      });

      return NextResponse.json({
        provider: 'paypal',
        paypalOrderId: paypalOrder.paypalOrderId,
        approvalUrl: paypalOrder.approvalUrl,
        paymentId: payment.id,
      });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 503 }
      );
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(normalizedAmount * 100),
      currency,
      metadata: {
        orderId,
        userId: user.id,
        productName: order.product.name,
        tax: taxAmount ? taxAmount.toFixed(2) : '0.00',
        taxRate: taxRate.toString(),
      },
      description: description || `Order: ${order.product.name}`,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    if (payment) {
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          stripePaymentIntentId: paymentIntent.id,
          stripeClientSecret: paymentIntent.client_secret,
          paypalOrderId: null,
          paypalPayerId: null,
          amount: normalizedAmount,
          currency,
          status: 'pending',
          paymentMethod: 'stripe',
        },
      });
    } else {
      payment = await prisma.payment.create({
        data: {
          userId: user.id,
          orderId,
          amount: normalizedAmount,
          currency,
          stripePaymentIntentId: paymentIntent.id,
          stripeClientSecret: paymentIntent.client_secret,
          status: 'pending',
          paymentMethod: 'stripe',
          description,
        },
      });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentId: payment.id,
        amount: normalizedAmount,
        tax: taxAmount,
        currency,
      },
    });

    return NextResponse.json({
      provider: 'stripe',
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      paymentId: payment.id,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}

// Verify payment status with Stripe (called by checkout page after payment)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentIntentId, status, provider = 'stripe', paypalOrderId } = body;

    if (provider === 'paypal') {
      if (!paypalOrderId) {
        return NextResponse.json(
          { error: 'PayPal order ID is required' },
          { status: 400 },
        );
      }

      const existingPayment = await prisma.payment.findUnique({
        where: { paypalOrderId },
      });

      if (existingPayment?.status === 'succeeded') {
        return NextResponse.json({
          ...existingPayment,
          provider: 'paypal',
          paypalOrderId,
        });
      }

      if (!isPayPalConfigured()) {
        return NextResponse.json(
          { error: 'PayPal is not configured' },
          { status: 503 },
        );
      }

      const capture = await capturePayPalOrder(paypalOrderId);
      const captureStatus = capture.status === 'COMPLETED' ? 'succeeded' : capture.status.toLowerCase();

      const payment = await prisma.payment.update({
        where: { paypalOrderId },
        data: {
          status: captureStatus,
          paymentMethod: 'paypal',
          paypalPayerId: capture.payer?.payer_id || null,
        },
      });

      if (capture.status === 'COMPLETED' && payment.orderId) {
        await prisma.order.update({
          where: { id: payment.orderId },
          data: { status: 'scheduled' },
        });

        // Clear the buyer's other never-paid checkout attempts.
        await abandonStalePendingOrders(payment.userId, payment.orderId);
        // Note: shipping label is NOT auto-created here. Admin uses "Get Label".
      }

      return NextResponse.json({
        ...payment,
        provider: 'paypal',
        paypalOrderId,
      });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 503 }
      );
    }

    const stripe = getStripe();

    if (!paymentIntentId || !status) {
      return NextResponse.json(
        { error: 'Payment intent ID and status required' },
        { status: 400 }
      );
    }

    // Verify with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent) {
      return NextResponse.json(
        { error: 'Payment intent not found' },
        { status: 404 }
      );
    }

    // Update payment in database
    const payment = await prisma.payment.update({
      where: { stripePaymentIntentId: paymentIntentId },
      data: {
        status: paymentIntent.status === 'succeeded' ? 'succeeded' : status,
        paymentMethod: typeof paymentIntent.payment_method === 'string' 
          ? paymentIntent.payment_method 
          : paymentIntent.payment_method?.id || 'card',
      },
    });

    // Update order if payment succeeded
    if (paymentIntent.status === 'succeeded' && payment.orderId) {
      await prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'scheduled' }, // Move to next stage after payment
      });

      // Clear the buyer's other never-paid checkout attempts.
      await abandonStalePendingOrders(payment.userId, payment.orderId);
      // Note: shipping label is NOT auto-created here. Admin uses "Get Label".
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
