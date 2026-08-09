import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/newsletter/unsubscribe?token=...
//
// One-click unsubscribe link carried in the footer of every marketing email.
// The token resolves to either a customer (User.marketingToken) or a bare
// subscriber (NewsletterSubscriber.unsubToken). Returns a small HTML page so
// the link works straight from an inbox.

function page(title: string, message: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title></head>
<body style="font-family: Arial, sans-serif; background:#FAF7F2; margin:0; padding:48px 24px;">
  <div style="max-width:440px; margin:0 auto; background:#fff; border:1px solid #E5E7EB; border-radius:12px; padding:40px; text-align:center;">
    <h1 style="font-size:22px; color:#1B2A5B; letter-spacing:0.12em; margin:0 0 24px;">AWULA K</h1>
    <h2 style="font-size:18px; color:#1B2A5B; margin:0 0 12px;">${title}</h2>
    <p style="font-size:14px; color:#8B7569; line-height:1.6; margin:0 0 24px;">${message}</p>
    <a href="/" style="display:inline-block; background:#1B2A5B; color:#fff; text-decoration:none; padding:12px 28px; border-radius:8px; font-size:14px; font-weight:600;">Back to AWULA K</a>
  </div>
</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!token) {
    return page('Invalid link', 'This unsubscribe link is missing its token.');
  }

  try {
    const user = await prisma.user.findFirst({ where: { marketingToken: token }, select: { id: true } });
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { marketingOptOut: true, unsubscribedAt: new Date() },
      });
      return page("You're unsubscribed", "You won't receive any more marketing emails from us. You'll still get essential messages about your orders.");
    }

    const sub = await prisma.newsletterSubscriber.findUnique({ where: { unsubToken: token }, select: { id: true } });
    if (sub) {
      await prisma.newsletterSubscriber.update({
        where: { id: sub.id },
        data: { status: 'unsubscribed', unsubscribedAt: new Date() },
      });
      return page("You're unsubscribed", "You won't receive any more emails from our mailing list. We're sorry to see you go.");
    }

    return page('Link not found', 'This unsubscribe link is no longer valid. You may already be unsubscribed.');
  } catch (error) {
    console.error('[newsletter/unsubscribe]', error);
    return page('Something went wrong', 'We could not process your request. Please try again or contact us.');
  }
}
