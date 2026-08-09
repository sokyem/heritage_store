import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

// GET - Fetch user's conversations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            participants: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user.conversations);
  } catch (error) {
    console.error('Conversations GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

// POST - Create a new conversation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, participantIds, relatedType, relatedId } = body;

    // Resolve participants. When the caller doesn't name any — the common
    // case of a customer starting a thread with the studio — default to the
    // whole AWULA K team (founder + staff) so the message reaches an admin.
    let resolvedParticipantIds: string[] = Array.isArray(participantIds)
      ? participantIds.filter((v): v is string => typeof v === 'string')
      : [];

    if (resolvedParticipantIds.length === 0) {
      const studio = await prisma.user.findMany({
        where: { role: { in: ['founder', 'staff', 'admin'] } },
        select: { id: true },
      });
      resolvedParticipantIds = studio.map((u) => u.id);
    }

    // Ensure current user is included
    const allParticipantIds = Array.from(new Set([user.id, ...resolvedParticipantIds]));

    const conversation = await prisma.conversation.create({
      data: {
        title: (typeof title === 'string' && title.trim()) || 'Message to AWULA K Studio',
        relatedType,
        relatedId,
        participants: {
          connect: allParticipantIds.map(id => ({ id })),
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        participants: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error('Conversations POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}
