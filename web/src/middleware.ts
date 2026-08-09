import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Who may enter the designer workspace at /designer/*.
const DESIGNER_AREA_ROLES = ['designer', 'founder', 'admin', 'staff'];

/**
 * Middleware to handle:
 * 1. Subdomain routing (matchday.awulak.com → /matchday routes)
 * 2. NextAuth callback URL sanitization
 * 3. Gating the /designer workspace to approved designers (+ admins)
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams, origin, host } = request.nextUrl;

  // Detect Matchday subdomain and redirect to /matchday routes
  const isMatchday = host?.includes('matchday.');
  
  if (isMatchday && !pathname.startsWith('/matchday')) {
    // Only redirect root or non-matchday paths
    if (pathname === '/' || pathname === '') {
      const url = request.nextUrl.clone();
      url.pathname = '/matchday';
      return NextResponse.redirect(url);
    } else if (!pathname.startsWith('/_next') && !pathname.startsWith('/api')) {
      // Redirect other paths to /matchday equivalent
      const url = request.nextUrl.clone();
      url.pathname = `/matchday${pathname}`;
      return NextResponse.redirect(url);
    }
  }

  // Sanitize NextAuth callback URLs before any page renders
  if (pathname === '/auth/signin' || pathname === '/auth/signup') {
    const callbackUrl = searchParams.get('callbackUrl');
    if (callbackUrl) {
      let safe = false;

      if (callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
        safe = true;
      } else {
        try {
          const target = new URL(callbackUrl);
          if (target.origin === origin) safe = true;
        } catch {
          safe = false;
        }
      }

      if (!safe) {
        const cleanUrl = request.nextUrl.clone();
        cleanUrl.searchParams.delete('callbackUrl');
        return NextResponse.redirect(cleanUrl);
      }
    }
  }

  // Gate the designer workspace — normal customers must never reach it.
  if (pathname === '/designer' || pathname.startsWith('/designer/')) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/signin';
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
    const role = String(token.role || '');
    if (!DESIGNER_AREA_ROLES.includes(role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
