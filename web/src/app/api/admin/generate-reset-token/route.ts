import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/auth-guard';

const BASE_URL =
  process.env.NEXTAUTH_URL ||
  'https://awula-k-vjyd-production.up.railway.app';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Invalidate any existing unused tokens for this email
    await prisma.passwordReset.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    // Generate a new reset token valid for 1 hour
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordReset.create({
      data: { email, token, expiresAt },
    });

    const resetUrl = `${BASE_URL}/auth/reset-password?token=${token}`;

    return NextResponse.json({
      message: 'Reset token generated',
      email,
      token,
      resetUrl,
    });
  } catch (error) {
    console.error('Generate reset token error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
