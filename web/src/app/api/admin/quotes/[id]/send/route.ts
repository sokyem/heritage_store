import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { sendTemplate } from '@/lib/email';
import { getSetting } from '@/lib/settings';

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * POST /api/admin/quotes/[id]/send
 *
 * Marks the quote as sent, generates a single-use accessToken (if missing),
 * computes the deposit using the admin business settings, and emails the
 * client a secure link to view & pay.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { client: true },
    });
    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (!quote.client?.email) {
      return NextResponse.json(
        { error: "This client has no email address on file. Add one in Clients before sending." },
        { status: 400 },
      );
    }

    // Deposit %
    let depositPercent = quote.depositPercent || 50;
    try {
      const business = await getSetting('business');
      if (typeof business?.depositPercent === 'number') {
        depositPercent = business.depositPercent;
      }
    } catch {}

    const depositAmount = Number(((quote.total * depositPercent) / 100).toFixed(2));

    // Issue access token (preserve existing so old links still work)
    const accessToken = quote.accessToken || crypto.randomBytes(24).toString('base64url');

    const updated = await prisma.quote.update({
      where: { id },
      data: {
        accessToken,
        status: 'sent',
        sentAt: quote.sentAt || new Date(),
        depositPercent,
        depositAmount,
      },
      include: { client: true },
    });

    // Send email
    const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const quoteUrl = `${appUrl}/quote/${updated.id}?t=${accessToken}`;
    const validUntilBlock = updated.validUntil
      ? `<p style="font-size:12px;color:#8B7569;margin:0 0 4px;">VALID UNTIL</p><p style="font-size:14px;color:#1B2A5B;margin:0;">${updated.validUntil}</p>`
      : '';

    await sendTemplate('quote_sent', updated.client.email!, {
      name: updated.client.name || 'there',
      quoteId: updated.quoteId,
      total: fmtMoney(updated.total),
      depositPercent: depositPercent,
      depositAmount: fmtMoney(depositAmount),
      validUntilBlock,
      quoteUrl,
    });

    return NextResponse.json({
      ok: true,
      quote: updated,
      quoteUrl,
    });
  } catch (error) {
    console.error('Failed to send quote:', error);
    return NextResponse.json({ error: 'Failed to send quote' }, { status: 500 });
  }
}
