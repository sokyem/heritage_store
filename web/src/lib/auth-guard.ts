import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextResponse } from 'next/server';
import { ADMIN_ROLES, hasPermission, type Permission, type Role } from './roles';

export async function requirePermission(perm: Permission) {
  const base = await requireAdmin();
  if (!base.authorized) return base;
  if (!hasPermission(base.role, perm)) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: `Missing permission: ${perm}` }, { status: 403 }),
    };
  }
  return base;
}

export async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return { authorized: false as const, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }

  const role = (session.user as any).role as string;
  if (!ADMIN_ROLES.includes(role as Role)) {
    return { authorized: false as const, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }

  return { authorized: true as const, session, email: session.user.email, role };
}

export async function requireAuth() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return { authorized: false as const, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }

  return { authorized: true as const, session, email: session.user.email, role: (session.user as any).role as string };
}
