/**
 * One-time admin password reset endpoint.
 *
 * Guarded by ADMIN_RESET_KEY env var. Set this on Railway, then call:
 *   POST /api/admin/reset-password?key=YOUR_SECRET_KEY
 *   Body: { email, password }
 *
 * After use, REMOVE ADMIN_RESET_KEY from env to disable.
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const RESET_KEY = process.env.ADMIN_RESET_KEY;

  if (!RESET_KEY) {
    return NextResponse.json({ error: 'Endpoint disabled' }, { status: 403 });
  }

  const key = new URL(req.url).searchParams.get('key');
  if (key !== RESET_KEY) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'email and password required' }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      await prisma.user.update({
        where: { email },
        data: {
          password: hashed,
          role: existing.role === 'customer' ? 'founder' : existing.role,
        },
      });
      return NextResponse.json({
        success: true,
        action: 'updated',
        email,
        role: existing.role === 'customer' ? 'founder' : existing.role,
      });
    } else {
      const user = await prisma.user.create({
        data: {
          email,
          name: 'Admin',
          role: 'founder',
          password: hashed,
        },
      });
      return NextResponse.json({
        success: true,
        action: 'created',
        email: user.email,
        role: user.role,
      });
    }
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset password' },
      { status: 500 }
    );
  }
}
