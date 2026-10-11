import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Edge-safe first line of defense: redirects unauthenticated/unauthorized
// requests before they reach a page. The authoritative check (session
// revocation, user.active) still happens server-side in requireUser/
// requireRole for every page and mutation — this is UX, not the last line.

const SESSION_COOKIE_NAME = 'freshour_session';

const ROLE_HOME: Record<string, string> = {
  EXECUTIVE: '/exec',
  PRICING: '/pricing',
  SALES: '/sales',
  ADMIN: '/admin',
};

const ROUTE_ROLES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/exec', roles: ['EXECUTIVE'] },
  { prefix: '/pricing', roles: ['PRICING'] },
  { prefix: '/customers', roles: ['PRICING', 'SALES', 'EXECUTIVE'] },
  { prefix: '/sales', roles: ['SALES'] },
  { prefix: '/negotiations', roles: ['PRICING', 'SALES'] },
  { prefix: '/cost-market', roles: ['PRICING', 'ADMIN'] },
  { prefix: '/product-master', roles: ['PRICING', 'ADMIN'] },
  { prefix: '/margin-guard', roles: ['PRICING'] },
  { prefix: '/summary', roles: ['EXECUTIVE', 'PRICING', 'SALES', 'ADMIN'] },
  { prefix: '/process', roles: ['EXECUTIVE', 'PRICING', 'SALES', 'ADMIN'] },
  { prefix: '/memory', roles: ['EXECUTIVE', 'PRICING', 'SALES', 'ADMIN'] },
  { prefix: '/principles', roles: ['EXECUTIVE', 'PRICING', 'SALES', 'ADMIN'] },
  { prefix: '/admin', roles: ['ADMIN'] },
];

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? '');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/q/') || pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/api/public')) {
    return NextResponse.next();
  }

  const rule = ROUTE_ROLES.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role as string;
    if (!rule.roles.includes(role)) {
      const home = ROLE_HOME[role] ?? '/login';
      return NextResponse.redirect(new URL(home, req.url));
    }
  } catch {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/exec/:path*',
    '/pricing/:path*',
    '/customers/:path*',
    '/sales/:path*',
    '/negotiations/:path*',
    '/cost-market/:path*',
    '/product-master/:path*',
    '/margin-guard/:path*',
    '/summary/:path*',
    '/process/:path*',
    '/memory/:path*',
    '/principles/:path*',
    '/admin/:path*',
  ],
};
