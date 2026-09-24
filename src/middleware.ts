import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'sos_at';
const REFRESH_COOKIE = 'sos_rt';

/**
 * WHAT A CUSTOMER CAN OPEN WITHOUT AN ACCOUNT, AND NOTHING MORE.
 *
 * This was one list matched with a loose startsWith, and loose is the wrong
 * shape for a permission check: a prefix that is public makes every path
 * beginning with those characters public too, whether or not it is the same
 * page.
 *
 * Two consequences. `/invoice` was simply absent, so the link in an invoice
 * email redirected the customer to /login?next=%2Finvoice%2F... and asked them
 * to sign in to a salon system they will never have an account for. And
 * `/feedback` was present for the customer's form at /feedback/<appointment>,
 * which also waved through `/feedback` itself — the staff page listing every
 * customer's feedback. Only the API refusing a request with no cookie stood
 * behind it.
 *
 * Adding `/invoice` to the old list would have done the same to `/invoices`,
 * the staff invoice list, which begins with exactly those characters.
 *
 * So: sections are public in their CHILDREN only, which is where the token is
 * and where the customer goes. The section's own page is not, which is where
 * the staff screen lives.
 */
const PUBLIC_SECTIONS = ['/book', '/feedback', '/invoice', '/api/auth'];

/** Public as themselves, with no child path. */
const PUBLIC_EXACT = ['/login'];

/** Build output and icons, matched loosely because they carry file extensions. */
const ASSET_PREFIXES = ['/_next', '/favicon', '/icon', '/apple-icon', '/manifest'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  // The trailing slash is the whole guard: /invoice/<token> is a customer's
  // bill, /invoices is the salon's ledger.
  if (PUBLIC_SECTIONS.some((section) => pathname.startsWith(`${section}/`))) return true;
  return ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
      // Both names, for the same reason as origins.ts: setting one and not the
      // other is easy, and getting it wrong here silently breaks every token
      // refresh. No throw — this runs on every request, so failing hard would
      // take the login page down with it and hide the reason.
      const apiUrl = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(
        /\/+$/,
        '',
      );
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
