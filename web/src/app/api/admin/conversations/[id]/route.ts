import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { sendTemplate } from '@/lib/email';
import { threadReplyTo } from '@/lib/inbound';
import { recordAudit } from '@/lib/audit';

const APP_URL = process.env.NEXTAUTH_URL || 'https://www.awulak.com';

// GET /api/admin/conversations/[id]
//
// Full thread for the admin. Returns the conversation + every message in
// chronological order, including each message's author. Admin-gated; the
// customer-facing /api/conversations/[id]/messages requires participation.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return NextResponse.json({
      conversation,
      messages,
    });
  } catch (error) {
    console.error('[admin/conversations/[id]] failed:', error);
    return NextResponse.json({ error: 'Failed to load thread' }, { status: 500 });
  }
}

// POST /api/admin/conversations/[id]
//
// Reply as the current admin user. Adds the admin as a participant if
// they aren't one already, so the thread stays attributable.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: auth.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { id: true } } },
    });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Ensure the admin is a participant before replying.
    const alreadyParticipant = conversation.participants.some((p) => p.id === user.id);
    if (!alreadyParticipant) {
      await prisma.conversation.update({
        where: { id },
        data: { participants: { connect: { id: user.id } } },
      });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        userId: user.id,
        content,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    // Touch the conversation so it sorts to the top of the inbox.
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    await recordAudit({
      actorEmail: auth.email,
      action: 'create',
      entity: 'Message',
      entityId: message.id,
      summary: `Replied in conversation ${id.slice(-8).toUpperCase()}`,
      diff: { conversationId: id, length: content.length },
    });

    // Notify every non-staff participant: in-app notification + email.
    // Best-effort — never fail the admin's reply if email or notification
    // creation hiccups. We re-load participants with role so we can skip
    // other admins.
    try {
      const fullConvo = await prisma.conversation.findUnique({
        where: { id },
        include: {
          participants: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });
      const senderName = message.user?.name || 'AWULA K Studio';
      const preview = content.slice(0, 240);
      const recipients = (fullConvo?.participants || []).filter(
        (p) => p.id !== user.id && !['founder', 'staff', 'admin'].includes(p.role || ''),
      );
      await Promise.all(
        recipients.map(async (r) => {
          await prisma.notification
            .create({
              data: {
                userId: r.id,
                type: 'message_reply',
                title: 'New reply from AWULA K',
                message: preview,
                relatedId: id,
              },
            })
            .catch((err) => console.error('[admin reply] notification failed', err));
          if (r.email) {
            await sendTemplate('inbox_reply', r.email, {
              name: r.name || 'there',
              senderName,
              preview,
              inboxUrl: `${APP_URL.replace(/\/$/, '')}/inbox`,
            }, { replyTo: threadReplyTo('conv', id) }).catch((err) => console.error('[admin reply] email failed', err));
          }
        }),
      );
    } catch (notifyErr) {
      console.error('[admin reply] notify pipeline failed:', notifyErr);
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('[admin/conversations/[id] POST] failed:', error);
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 });
  }
}
