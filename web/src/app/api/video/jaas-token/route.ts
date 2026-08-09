import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { ADMIN_ROLES, type Role } from '@/lib/roles';
import { isJaasConfigured, mintJaasToken, jaasAppId, jaasDomain } from '@/lib/jaas';

// GET /api/video/jaas-token?room=<id>&name=<display name>
//
// Returns a JaaS JWT for the in-app video call. Admins/staff get a moderator
// token; everyone else (the customer joining via their link) gets a guest
// token for the same room. When JaaS isn't configured, returns
// { configured: false } and the client falls back to free public Jitsi.
export async function GET(req: NextRequest) {
  if (!isJaasConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const url = new URL(req.url);
  const rawRoom = url.searchParams.get('room') || '';
  const name = url.searchParams.get('name') || '';

  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const moderator = ADMIN_ROLES.includes(role as Role);

  // Scope to any room ('*') — JaaS normalizes room names, and a specific-room
  // claim mismatch is the most common "Authentication failed" cause. Rooms are
  // cuid-obscure, so a wildcard guest token is acceptable here.
  void rawRoom;
  const token = await mintJaasToken({
    room: '*',
    name: name || session?.user?.name || 'Awula Guest',
    email: session?.user?.email || '',
    moderator,
  });

  // Token can be null if the private key fails to parse (logged in mintJaasToken).
  // Signal not-configured so the client falls back to public Jitsi rather than
  // attempting an anonymous JaaS join, which 8x8 rejects with "not allowed to join".
  if (!token) {
    return NextResponse.json({ configured: false });
  }

  return NextResponse.json({ configured: true, appId: jaasAppId, domain: jaasDomain, token, moderator });
}
