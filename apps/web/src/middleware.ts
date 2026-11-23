import { NextResponse, type NextRequest } from 'next/server';

const REFRESH_COOKIE_NAME = 'omniops_refresh';

const PROTECTED_PREFIXES = [
  '/overview',
  '/products',
  '/inventory',
  '/orders',
  '/customers',
  '/analytics',
  '/users',
  '/audit',
  '/settings',
];

const AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(REFRESH_COOKIE_NAME);

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthPage = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (isProtected && !hasSessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && hasSessionCookie) {
    return NextResponse.redirect(new URL('/overview', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/overview/:path*',
    '/products/:path*',
    '/inventory/:path*',
    '/orders/:path*',
    '/customers/:path*',
    '/analytics/:path*',
    '/users/:path*',
    '/audit/:path*',
    '/settings/:path*',
    '/login',
    '/forgot-password',
    '/reset-password',
  ],
};
