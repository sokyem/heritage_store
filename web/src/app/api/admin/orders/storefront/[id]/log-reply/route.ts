/**
 * POST /api/admin/orders/storefront/[id]/log-reply
 *
 * Log a customer reply that came in via email (outside the app).
 * Body: { content: string }
 * Saves an inbound OrderMessage so the thread stays complete in-app.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  let body: { content?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const content = (body.content || '').trim();
  if (!content) {
    return NextResponse.json({ error: 'Reply content is required' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id }, select: { id: true } });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const msg = await prisma.orderMessage.create({
    data: { orderId: id, direction: 'inbound', content },
  });

  return NextResponse.json({ ok: true, message: msg });
}
