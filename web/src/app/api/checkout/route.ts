import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { abandonStalePendingOrders } from '@/lib/orders';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getSetting } from '@/lib/settings';
import { CUSTOMIZATION_FEE } from '@/lib/pricing';
import { getInternationalSurcharge, getCheapestRate } from '@/lib/easypost';

/** Pull the first image URL out of AdminProduct.images (JSON-encoded string array). */
function firstImageFromAdminProduct(images: string | null | undefined): string | null {
  if (!images) return null;
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return parsed[0];
    }
    return null;
  } catch {
    // Field may already be a plain URL string in older rows.
    return typeof images === 'string' && images.startsWith('/') ? images : null;
  }
}

/**
 * POST /api/checkout
 *
 * Creates an order and a Stripe Payment Intent in a single request.
 * Supports both signed-in users and guest checkout (via guestEmail).
 *
 * Body:
 *   productId?    — existing Product ID
 *   productName?  — product name (used to find or create a Product record)
 *   amount?       — price override (used when productName is provided)
 *   quantity?     — defaults to 1
 *   currency?     — defaults to "usd"
 *   guestEmail?   — required for guest checkout
 *   guestName?    — optional display name for guest
 *   customNotes?  — optional order notes
 *
 * Returns:
 *   { orderId, clientSecret, paymentIntentId, amount, productName }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    const {
      productId,
      productName,
      amount: amountOverride,
      customizationFee,
      quantity = 1,
      currency = 'usd',
      guestEmail,
      guestName,
      customNotes,
      // Shipping address — REQUIRED before payment. Without this,
      // auto-shipping can't generate a label and the order can't ship.
      shippingName,
      shippingAddress,
      shippingAddress2,
      shippingCity,
      shippingState,
      shippingZip,
      shippingCountry,
      shippingPhone,
      // Variant selection — stored on the order so inventory auto-decrements on payment.
      size,
      color,
    } = body;

    // ── Validate shipping address ─────────────────────────────────
    // Fail fast so customers never get a paid order with no address.
    const missing: string[] = [];
    if (!shippingName?.trim()) missing.push('full name');
    if (!shippingAddress?.trim()) missing.push('address');
    if (!shippingCity?.trim()) missing.push('city');
    if (!shippingState?.trim()) missing.push('state');
    if (!shippingZip?.trim()) missing.push('ZIP code');
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Shipping address is incomplete. Missing: ${missing.join(', ')}.` },
        { status: 400 }
      );
    }

    // ── Resolve user ──────────────────────────────────────────────
    let user;

    if (session?.user?.email) {
      user = await prisma.user.findUnique({ where: { email: session.user.email } });
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    } else if (guestEmail) {
      const normalizedEmail = String(guestEmail).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
      }
      // Find or create a guest user account
      user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            name: guestName ? String(guestName).trim() : 'Guest',
            role: 'customer',
          },
        });
      }
    } else {
      return NextResponse.json(
        { error: 'Sign in or provide an email address to checkout' },
        { status: 401 }
      );
    }

    // ── Resolve product ───────────────────────────────────────────
    let product;

    // ─── Resolve authoritative product + price ─────────────────────
    // The cart used to send a stale price from localStorage which the server
    // trusted — meaning a customer could be charged whatever amount the cart
    // happened to have, even if admin updated the catalog price afterwards.
    // Now: AdminProduct (the admin-managed catalog) is the source of truth.
    //
    // Lookup order:
    //   1. AdminProduct by ID  (cart sends AdminProduct.id as productId)
    //   2. AdminProduct by name (fallback)
    //   3. Legacy Product by ID/name (very old guest flows)
    let adminProduct = null;
    if (productId) {
      adminProduct = await prisma.adminProduct.findUnique({ where: { id: productId } });
    }
    if (!adminProduct && productName) {
      adminProduct = await prisma.adminProduct.findFirst({
        where: { name: String(productName) },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (adminProduct) {
      // Mirror the AdminProduct into the legacy Product table (creating or
      // refreshing) so existing Order foreign keys keep working. The Order
      // schema's productId points at Product, not AdminProduct.
      const adminImage = firstImageFromAdminProduct(adminProduct.images);
      product = await prisma.product.findFirst({ where: { name: adminProduct.name } });
      if (!product) {
        product = await prisma.product.create({
          data: {
            name: adminProduct.name,
            price: adminProduct.price,
            description: adminProduct.description || adminProduct.name,
            image: adminImage,
          },
        });
      } else {
        // Keep the legacy mirror in sync with the catalog: refresh price and
        // backfill the image if it's still empty so checkout/order summaries
        // can render the product picture.
        const updates: { price?: number; image?: string } = {};
        if (product.price !== adminProduct.price) updates.price = adminProduct.price;
        if (!product.image && adminImage) updates.image = adminImage;
        if (Object.keys(updates).length > 0) {
          product = await prisma.product.update({
            where: { id: product.id },
            data: updates,
          });
        }
      }
    } else if (productId) {
      product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
    } else if (productName) {
      const fallbackPrice = amountOverride ? parseFloat(String(amountOverride)) : 0;
      if (!fallbackPrice || fallbackPrice <= 0) {
        return NextResponse.json(
          { error: 'A valid amount is required when using productName' },
          { status: 400 }
        );
      }
      product = await prisma.product.findFirst({ where: { name: String(productName) } });
      if (!product) {
        product = await prisma.product.create({
          data: {
            name: String(productName),
            price: fallbackPrice,
            // Never the cart summary — the Product row is shared across orders.
            description: String(productName),
          },
        });
      }
    } else {
      return NextResponse.json(
        { error: 'productId or productName is required' },
        { status: 400 }
      );
    }

    // Authoritative unit price: AdminProduct wins, else legacy Product, else 0
    const unitPrice = adminProduct ? adminProduct.price : product.price;
    const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
    // Personalisation surcharge (+$15/customized unit). Clamp to a sane bound so
    // a tampered request can't inflate the order with a giant "fee".
    const fee = Math.min(
      CUSTOMIZATION_FEE * qty,
      Math.max(0, parseFloat(String(customizationFee ?? 0)) || 0),
    );
    const subtotal = unitPrice * qty + fee;

    // ─── Detect stale-cart price mismatch ─────────────────────────
    // If the client sent a price (typical of guest checkout from the cart)
    // and it disagrees with the catalog by more than a cent, reject so the
    // customer can re-confirm at the real price instead of being charged
    // the old one. (Compared against subtotal — cart doesn't know our tax.)
    if (amountOverride) {
      const clientAmount = parseFloat(String(amountOverride));
      if (Number.isFinite(clientAmount) && Math.abs(clientAmount - subtotal) > 0.01) {
        return NextResponse.json({
          error: `The price has changed since you added this to your cart. Current price is $${unitPrice.toFixed(2)} (you had $${(clientAmount / qty).toFixed(2)}). Please refresh and try again.`,
          currentUnitPrice: unitPrice,
          currentTotal: subtotal,
          previousTotal: clientAmount,
          code: 'price_changed',
        }, { status: 409 });
      }
    }

    // ─── Apply sales tax ──────────────────────────────────────────
    // taxRate is stored as a percent (0-100) in business settings.
    const business = await getSetting('business');
    const taxRate = Math.max(0, Math.min(100, business.taxRate || 0));
    const taxAmount = Math.round(subtotal * taxRate) / 100; // round to cents

    // ─── Shipping ─────────────────────────────────────────────────
    // Same parcel weight the label will use (product weightLb, else 0.2 lb).
    let parcelWeightLb = 0.2;
    const apw = await prisma.adminProduct.findFirst({ where: { name: product.name }, select: { weightLb: true } }).catch(() => null);
    if (apw?.weightLb && apw.weightLb > 0) parcelWeightLb = apw.weightLb;

    const shipperSettings = await getSetting('shipper').catch(() => null);
    const absorbShipping = shipperSettings?.absorbShippingCost ?? true;
    const shipToForRate = {
      name: String(shippingName).trim(),
      phone: shippingPhone ? String(shippingPhone).trim() : undefined,
      addressLine1: String(shippingAddress).trim(),
      addressLine2: shippingAddress2 ? String(shippingAddress2).trim() : undefined,
      city: String(shippingCity).trim(),
      state: String(shippingState).trim(),
      postalCode: String(shippingZip).trim(),
      country: shippingCountry ? String(shippingCountry).trim() : 'US',
    };
    const parcel = { weight: parcelWeightLb, length: 16, width: 12, height: 4 };

    // When absorbing: domestic ships free, international pays only the surcharge
    // (cheapest intl rate − domestic Ground Advantage). When NOT absorbing: the
    // customer pays the full shipping rate.
    let shippingCharge = 0;
    if (absorbShipping) {
      shippingCharge = await getInternationalSurcharge(shipToForRate, parcel);
    } else {
      shippingCharge = await getCheapestRate(shipToForRate, parcel)
        .then((r) => r.cost)
        .catch(() => 0);
    }
    shippingCharge = Math.max(0, Math.round(shippingCharge * 100) / 100);

    const totalAmount = Math.round((subtotal + taxAmount + shippingCharge) * 100) / 100;

    // ── Create order ──────────────────────────────────────────────
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        productId: product.id,
        shippingName: String(shippingName).trim(),
        shippingAddress: String(shippingAddress).trim(),
        shippingAddress2: shippingAddress2 ? String(shippingAddress2).trim() : null,
        shippingCity: String(shippingCity).trim(),
        shippingState: String(shippingState).trim(),
        shippingZip: String(shippingZip).trim(),
        shippingCountry: shippingCountry ? String(shippingCountry).trim() : 'US',
        shippingPhone: shippingPhone ? String(shippingPhone).trim() : null,
        amount: totalAmount,
        tax: taxAmount > 0 ? taxAmount : null,
        currency: currency.toUpperCase(),
        customNotes: customNotes || null,
        shippingCost: shippingCharge > 0 ? shippingCharge : null,
        status: 'pending',
        // Variant — store for inventory auto-decrement on payment confirmation.
        adminProductId: adminProduct?.id || null,
        selectedSize: size ? String(size).trim() : null,
        selectedColor: color ? String(color).trim() : null,
        quantity: qty,
      },
    });

    // ── Create Stripe Payment Intent ──────────────────────────────
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Stripe is not configured. Please contact support.' },
        { status: 503 }
      );
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Stripe expects cents
      currency: currency.toLowerCase(),
      // Attach shipping so it shows on the Stripe dashboard + receipt,
      // and so fraud signals can use it
      shipping: {
        name: String(shippingName).trim(),
        phone: shippingPhone ? String(shippingPhone).trim() : undefined,
        address: {
          line1: String(shippingAddress).trim(),
          line2: shippingAddress2 ? String(shippingAddress2).trim() : undefined,
          city: String(shippingCity).trim(),
          state: String(shippingState).trim(),
          postal_code: String(shippingZip).trim(),
          country: (shippingCountry ? String(shippingCountry).trim() : 'US').toUpperCase(),
        },
      },
      metadata: {
        orderId: order.id,
        userId: user.id,
        productId: product.id,
        productName: product.name,
        quantity: String(quantity),
        subtotal: subtotal.toFixed(2),
        tax: taxAmount.toFixed(2),
        taxRate: taxRate.toString(),
      },
      description: `AWULA K — ${product.name}${quantity > 1 ? ` (x${quantity})` : ''}`,
      automatic_payment_methods: { enabled: true },
    });

    // ── Persist payment record ────────────────────────────────────
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        orderId: order.id,
        amount: totalAmount,
        currency: currency.toUpperCase(),
        status: 'pending',
        paymentMethod: 'stripe',
        stripePaymentIntentId: paymentIntent.id,
        stripeClientSecret: paymentIntent.client_secret,
        description: `Purchase: ${product.name}`,
      },
    });

    // Link payment back to order
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentId: payment.id },
    });

    // Keep at most one live pending order per customer: abandon this buyer's
    // earlier never-paid checkout attempts.
    await abandonStalePendingOrders(user.id, order.id);

    return NextResponse.json({
      orderId: order.id,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: totalAmount,
      subtotal,
      tax: taxAmount,
      taxRate,
      shipping: shippingCharge,
      internationalSurcharge: absorbShipping ? shippingCharge : 0,
      productName: product.name,
      productImage: product.image || (adminProduct ? firstImageFromAdminProduct(adminProduct.images) : null),
    });
  } catch (error) {
    // Surface the real error so it's visible in Railway logs AND in the client error UI.
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    console.error('[CHECKOUT_ERROR]', {
      message,
      stack,
      stripeConfigured: isStripeConfigured(),
      hasPublishableKey: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      databaseUrlSet: Boolean(process.env.DATABASE_URL),
    });

    // Helpful, specific hints based on common Stripe / Prisma error shapes
    let hint = 'Failed to initialize checkout. Please try again.';
    if (/Invalid API Key|No such api key|Authentication/i.test(message)) {
      hint = 'Stripe key is invalid. Double-check STRIPE_SECRET_KEY in Railway (no surrounding quotes, full key including sk_live_/sk_test_).';
    } else if (/connect ECONNREFUSED|database|Prisma|P10\d\d/i.test(message)) {
      hint = 'Database connection failed. Check that DATABASE_URL in Railway points to a reachable Postgres instance.';
    } else if (/relation .* does not exist|table .* does not exist|column .* does not exist/i.test(message)) {
      hint = 'Database schema is out of date. Run `npx prisma migrate deploy` on Railway.';
    } else if (/parameter_invalid_empty|amount.*positive|amount.*greater/i.test(message)) {
      hint = 'Stripe rejected the amount. Make sure the product price is set and greater than zero.';
    }

    return NextResponse.json(
      { error: hint, detail: message },
      { status: 500 }
    );
  }
}
