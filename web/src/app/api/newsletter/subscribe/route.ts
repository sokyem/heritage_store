import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/newsletter/subscribe  { email, name?, source? }
//
// Public endpoint behind the storefront "Get updates" form. Creates (or
// re-activates) a NewsletterSubscriber. If the email already belongs to a
// customer account, we also clear their opt-out so the explicit sign-up
// wins over a prior unsubscribe.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const { email, name, source } = await req.json();
    const clean = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!clean || !EMAIL_RE.test(clean)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    await prisma.newsletterSubscriber.upsert({
      where: { email: clean },
      update: {
        status: 'subscribed',
        unsubscribedAt: null,
        name: name?.trim() || undefined,
      },
      create: {
        email: clean,
        name: name?.trim() || null,
        source: typeof source === 'string' ? source : 'footer',
        status: 'subscribed',
      },
    });

    // If they also have a customer account, honor the fresh opt-in.
    await prisma.user.updateMany({
      where: { email: clean, marketingOptOut: true },
      data: { marketingOptOut: false, unsubscribedAt: null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[newsletter/subscribe]', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
