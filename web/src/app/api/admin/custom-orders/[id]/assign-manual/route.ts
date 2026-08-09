import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { manualAssign } from '@/lib/assignment-engine';

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
    const body = await req.json();
    const { designerId } = body;

    if (!designerId) {
      return NextResponse.json({ error: 'designerId is required' }, { status: 400 });
    }

    const result = await manualAssign(id, designerId, session.user.email || 'admin');

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Designer manually assigned' });
  } catch (error) {
    console.error('Failed to manually assign designer:', error);
    return NextResponse.json({ error: 'Failed to manually assign' }, { status: 500 });
  }
}
