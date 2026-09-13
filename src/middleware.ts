import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'sos_at';
const REFRESH_COOKIE = 'sos_rt';

/** Routes reachable without a session. */
const PUBLIC_PREFIXES = ['/login', '/book', '/feedback', '/api/auth', '/_next', '/favicon', '/icon', '/manifest'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix));
}

/**
 * Keeps the session alive without the user noticing.
 *
 * The access cookie expires a minute before the JWT inside it does, so when it
 * disappears we still hold a valid refresh token: we swap it for a fresh pair
 * and let the request continue. Only when the refresh token is gone too does
 * the user see the login screen.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (pathname === '/login' && accessToken) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (isPublic(pathname)) return NextResponse.next();

  if (accessToken) return NextResponse.next();

  if (refreshToken) {
    try {
      const apiUrl = process.env.API_URL ?? 'http://localhost:4000/api/v1';
      const refreshed = await fetch(`${apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
      });

      if (refreshed.ok) {
        const payload = (await refreshed.json()) as {
          data?: { accessToken: string; refreshToken: string };
        };

        if (payload.data?.accessToken) {
          const response = NextResponse.next();
          const secure = process.env.NODE_ENV === 'production';

          response.cookies.set(ACCESS_COOKIE, payload.data.accessToken, {
            httpOnly: true,
            secure,
            sameSite: 'lax',
            path: '/',
            maxAge: 14 * 60,
          });
          response.cookies.set(REFRESH_COOKIE, payload.data.refreshToken, {
            httpOnly: true,
            secure,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 60 * 60,
          });

          return response;
        }
      }
    } catch {
      // Backend unreachable — fall through to the login screen rather than
      // showing a broken app shell.
    }
  }

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
