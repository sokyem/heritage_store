/**
 * POST /api/admin/orders/storefront/[id]/send-message
 *
 * Send a freeform message from the admin to the customer, scoped to an order.
 * Sends via email AND saves to the OrderMessage table for in-app history.
 * Body: { message: string }
 *
 * GET /api/admin/orders/storefront/[id]/send-message
 * Returns the full message thread for this order.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { sendOrderMessage } from '@/lib/email';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  const messages = await prisma.orderMessage.findMany({
    where: { orderId: id },
    orderBy: { createdAt: 'asc' },
  }).catch(() => []);

  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  let body: { message?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const message = (body.message || '').trim();
  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    const sentBy = session?.user?.name || session?.user?.email || 'Admin';

    const order = await prisma.order.findUnique({
      where: { id },
      include: { user: { select: { email: true, name: true } } },
    });

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (!order.user?.email) return NextResponse.json({ error: 'No customer email on file' }, { status: 400 });

    const ok = await sendOrderMessage(order.user.email, {
      name: order.user.name || 'Customer',
      orderId: order.id.slice(-8).toUpperCase(),
      orderIdFull: order.id,
      message,
    });

    // Save to DB regardless of email success so the thread is always recorded
    await prisma.orderMessage.create({
      data: { orderId: id, direction: 'outbound', content: message, sentBy },
    }).catch((err) => console.error('[send-message] DB save failed:', err));

    return NextResponse.json({ ok, sentTo: order.user.email });
  } catch (error) {
    console.error('[send-message]', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
