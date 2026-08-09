/**
 * POST /api/admin/orders/storefront/[id]/draft-message
 *
 * Uses Claude to draft a customer-facing email based on the admin's notes
 * and the order context. Returns { draft: string }.
 *
 * Body: { notes: string }  — what the admin wants to communicate
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

function buildManualFallbackDraft(customerName: string, notes: string) {
  const cleaned = notes
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^hey\s+/i, '')
    .replace(/^please\s+/i, '');

  const normalized = cleaned
    ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    : 'We wanted to share a quick update on your order.';

  return [
    `Hi ${customerName},`,
    '',
    'Thank you again for shopping with AWULA K.',
    '',
    normalized.endsWith('.') || normalized.endsWith('!') || normalized.endsWith('?')
      ? normalized
      : `${normalized}.`,
    '',
    'If you have any questions or want us to confirm any order details, just reply and we will help right away.',
    '',
    'Warm regards,',
    'The AWULA K Team',
  ].join('\n');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  let body: { notes?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const notes = (body.notes || '').trim();
  if (!notes) {
    return NextResponse.json({ error: 'Notes are required' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
      product: { select: { name: true, price: true } },
      payment: { select: { status: true, amount: true } },
    },
  });

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Build order context for the AI
  const orderContext = [
    `Order ID: ${order.id.slice(-8).toUpperCase()}`,
    `Customer: ${order.user?.name || 'Unknown'} (${order.user?.email || 'no email'})`,
    `Product: ${order.product?.name || 'Unknown product'}`,
    order.selectedColor ? `Color: ${order.selectedColor}` : null,
    order.selectedSize ? `Size: ${order.selectedSize}` : null,
    order.quantity > 1 ? `Quantity: ${order.quantity}` : null,
    `Order status: ${order.status}`,
    `Payment status: ${order.payment?.status || 'unknown'}`,
    order.amount ? `Total: $${order.amount.toFixed(2)}` : null,
    order.customNotes ? `Order notes: ${order.customNotes}` : null,
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are a helpful assistant for AWULA K, a fashion brand. You draft clear, warm, professional customer service emails on behalf of AWULA K staff.

Rules:
- Write only the email body (no subject line, no headers, no "Dear" greeting — just start with "Hi [name]")
- Be warm, professional, and concise — 2-4 short paragraphs max
- Do not add fluff or filler sentences
- End with a friendly sign-off like "Warm regards,\\nThe AWULA K Team"
- Do not make up tracking numbers, dates, or details not in the context
- Keep the tone friendly but on-brand (upscale fashion brand)`;

  const userPrompt = `Order context:
${orderContext}

What I want to communicate to the customer:
${notes}

Please draft an email body.`;

  const customerName = order.user?.name?.split(' ')[0] || 'there';
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ draft: buildManualFallbackDraft(customerName, notes), source: 'template' });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const preferredModel = process.env.ANTHROPIC_TEXT_MODEL || 'claude-sonnet-4-20250514';
    const fallbackModel = 'claude-3-5-sonnet-latest';

    let message;
    try {
      message = await anthropic.messages.create({
        model: preferredModel,
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
    } catch (primaryError) {
      if (preferredModel === fallbackModel) throw primaryError;
      message = await anthropic.messages.create({
        model: fallbackModel,
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
    }

    const draft = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    const safeDraft = draft || buildManualFallbackDraft(customerName, notes);
    return NextResponse.json({ draft: safeDraft, source: draft ? 'anthropic' : 'template' });
  } catch (error) {
    console.error('[draft-message] AI error, using template fallback:', error);
    // Never block the admin flow on provider failures.
    return NextResponse.json({ draft: buildManualFallbackDraft(customerName, notes), source: 'template' });
  }
}
