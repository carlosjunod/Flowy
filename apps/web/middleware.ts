import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup'];
const ASSET_PREFIXES = ['/_next', '/favicon', '/icons', '/api', '/manifest'];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (ASSET_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('pb_auth');
  if (cookie?.value) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', req.url);
  return NextResponse.redirect(loginUrl, 307);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
