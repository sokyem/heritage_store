import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { sendTemplate } from '@/lib/email';
import { threadReplyTo } from '@/lib/inbound';

// GET /api/admin/conversations
//
// Returns every active conversation in the system, newest first, with the
// most recent message preview and an unread count for the admin team.
// The customer-facing /api/conversations route is user-scoped — this one
// is admin-scoped and reads across all participants.
export async function GET(_req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const conversations = await prisma.conversation.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        participants: {
          select: { id: true, name: true, email: true, role: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            isRead: true,
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        _count: {
          select: {
            messages: {
              where: { isRead: false },
            },
          },
        },
      },
    });

    const normalized = conversations.map((c) => {
      // The "other party" from the admin's perspective is the first
      // participant who isn't a staff/founder/admin. Falls back to first
      // participant if every participant is staff.
      const customer =
        c.participants.find((p) => !['founder', 'staff', 'admin'].includes(p.role || '')) ||
        c.participants[0] ||
        null;
      return {
        id: c.id,
        kind: 'conversation' as 'conversation' | 'order',
        title: c.title,
        relatedType: c.relatedType,
        relatedId: c.relatedId,
        customerName: customer?.name || customer?.email || 'Customer',
        customerEmail: customer?.email || null,
        lastMessage: c.messages[0]
          ? {
              id: c.messages[0].id,
              content: c.messages[0].content,
              createdAt: c.messages[0].createdAt,
              authorRole: c.messages[0].user?.role || null,
              authorName: c.messages[0].user?.name || c.messages[0].user?.email || null,
            }
          : null,
        unreadCount: c._count.messages,
        updatedAt: c.updatedAt,
      };
    });

    // Surface order message threads in the same unified inbox. They live in
    // the OrderMessage model (shown/replied-to on the order page), so each row
    // deep-links there. Group the most recent messages by order.
    const orderMsgs = await prisma.orderMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 400,
      select: {
        id: true, orderId: true, direction: true, content: true, createdAt: true,
        order: { select: { id: true, shippingName: true, user: { select: { name: true, email: true } } } },
      },
    });
    const seenOrder = new Set<string>();
    const orderRows = [] as typeof normalized;
    for (const m of orderMsgs) {
      if (!m.order || seenOrder.has(m.orderId)) continue; // first = latest per order
      seenOrder.add(m.orderId);
      orderRows.push({
        id: `order:${m.orderId}`,
        kind: 'order',
        title: `Order ${m.orderId.slice(-8).toUpperCase()}`,
        relatedType: 'order',
        relatedId: m.orderId,
        customerName: m.order.user?.name || m.order.shippingName || m.order.user?.email || 'Customer',
        customerEmail: m.order.user?.email || null,
        lastMessage: {
          id: m.id,
          content: m.content,
          createdAt: m.createdAt,
          authorRole: m.direction === 'inbound' ? null : 'staff',
          authorName: m.direction === 'inbound' ? 'Customer' : 'You',
        },
        unreadCount: 0, // OrderMessage has no read tracking
        updatedAt: m.createdAt,
      });
    }

    const merged = [...normalized, ...orderRows].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return NextResponse.json(merged);
  } catch (error) {
    console.error('[admin/conversations] failed:', error);
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
  }
}

// POST /api/admin/conversations
//
// Admin starts a NEW conversation with a customer (optionally about an order).
// Creates the conversation + first message and emails the customer with a
// per-thread Reply-To so their reply routes back into this same conversation.
//
// Body: { customerEmail, customerName?, title, message, relatedType?, relatedId? }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const body = await req.json().catch(() => ({}));
  const customerEmail = String(body.customerEmail || '').trim().toLowerCase();
  const title = String(body.title || '').trim();
  const message = String(body.message || '').trim();
  const customerName = body.customerName ? String(body.customerName).trim() : '';
  const relatedType = body.relatedType ? String(body.relatedType) : null;
  const relatedId = body.relatedId ? String(body.relatedId) : null;

  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return NextResponse.json({ error: 'A valid customer email is required' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'A message is required' }, { status: 400 });
  }

  try {
    // The admin (sender) and the customer must both be participants.
    const admin = await prisma.user.findUnique({ where: { email: auth.email }, select: { id: true, name: true } });
    if (!admin) return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });

    // Resolve or create the customer so the conversation always has a real
    // participant to attribute inbound replies to.
    let customer = await prisma.user.findUnique({ where: { email: customerEmail }, select: { id: true, name: true } });
    if (!customer) {
      customer = await prisma.user.create({
        data: { email: customerEmail, name: customerName || 'Customer', role: 'customer' },
        select: { id: true, name: true },
      });
    }

    const conversation = await prisma.conversation.create({
      data: {
        title: title || `Message to ${customer.name || customerEmail}`,
        relatedType,
        relatedId,
        participants: { connect: [{ id: admin.id }, { id: customer.id }] },
        messages: { create: { userId: admin.id, content: message, isRead: true } },
      },
      select: { id: true },
    });

    // Email the customer with a per-thread Reply-To so replies come back here.
    await sendTemplate(
      'customer_message',
      customerEmail,
      { name: customer.name || 'there', message },
      { replyTo: threadReplyTo('conv', conversation.id) },
    ).catch((err) => console.error('[admin/conversations POST] email failed:', err));

    return NextResponse.json({ ok: true, id: conversation.id }, { status: 201 });
  } catch (error) {
    console.error('[admin/conversations POST] failed:', error);
    return NextResponse.json({ error: 'Failed to start conversation' }, { status: 500 });
  }
}
