import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { triggerAssignment } from '@/lib/assignment-engine';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const result = await triggerAssignment(id);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          candidates: result.candidates.map((c) => ({
            designerId: c.designerId,
            name: c.name,
            score: c.score,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      candidateCount: result.candidates.length,
      candidates: result.candidates.slice(0, 5).map((c) => ({
        designerId: c.designerId,
        name: c.name,
        specialty: c.specialty,
        rating: c.rating,
        score: Math.round(c.score * 100) / 100,
      })),
      offer: result.offer
        ? {
            offerId: result.offer.offerId,
            expiresAt: result.offer.expiresAt,
            designerId: result.candidates[0]?.designerId,
            designerName: result.candidates[0]?.name,
          }
        : null,
    });
  } catch (error) {
    console.error('Failed to trigger assignment:', error);
    return NextResponse.json({ error: 'Failed to trigger assignment' }, { status: 500 });
  }
}
