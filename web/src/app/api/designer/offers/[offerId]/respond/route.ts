import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { respondToOffer } from '@/lib/assignment-engine';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { offerId } = await params;

    // Verify the designer owns this offer
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { partnerDesigner: true },
    });

    if (!user?.partnerDesigner) {
      return NextResponse.json({ error: 'Not a registered designer' }, { status: 403 });
    }

    const offer = await prisma.assignmentOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    if (offer.designerId !== user.partnerDesigner.id) {
      return NextResponse.json({ error: 'This offer is not for you' }, { status: 403 });
    }

    const body = await req.json();
    const { action, reason } = body;

    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json(
        { error: 'Action must be "accept" or "decline"' },
        { status: 400 }
      );
    }

    const result = await respondToOffer(offerId, action, reason);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      action,
      message: action === 'accept'
        ? 'Order assigned to you successfully!'
        : 'Offer declined.',
    });
  } catch (error) {
    console.error('Failed to respond to offer:', error);
    return NextResponse.json({ error: 'Failed to respond to offer' }, { status: 500 });
  }
}
