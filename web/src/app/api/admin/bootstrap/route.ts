import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

/**
 * One-time admin bootstrap endpoint.
 *
 * Protected by ADMIN_BOOTSTRAP_TOKEN env var. Call with:
 *   POST /api/admin/bootstrap
 *   { "token": "...", "email": "...", "password": "..." }
 *
 * Creates the user as `founder` if missing, or updates the password.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'Bootstrap disabled' }, { status: 403 });
  }

  let body: { token?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token, email, password } = body;

  if (!token || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!email || !password || password.length < 8) {
    return NextResponse.json(
      { error: 'email and password (min 8 chars) are required' },
      { status: 400 },
    );
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
      ok: true,
      action: 'updated',
      email,
      role: existing.role === 'customer' ? 'founder' : existing.role,
    });
  }

  const created = await prisma.user.create({
    data: { email, name: 'Admin', role: 'founder', password: hashed },
  });

  return NextResponse.json({
    ok: true,
    action: 'created',
    email: created.email,
    role: created.role,
  });
}
