import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
  getAccessToken,
  getActiveBranchId,
  getRefreshToken,
} from '@/lib/session';

/**
 * The single door between the browser and the API.
 *
 * Client components call `/api/proxy/customers?...`; this handler attaches the
 * access token from the httpOnly cookie, forwards the call, and — if the token
 * has just expired — refreshes once and retries before giving up. The token
 * itself never crosses into the browser.
 */
async function forward(request: NextRequest, path: string[]): Promise<NextResponse> {
  const target = new URL(`${API_URL}/${path.join('/')}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));

  const branchId = request.headers.get('x-branch-id') ?? (await getActiveBranchId());
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();

  const call = async (token: string | null) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (branchId) headers['X-Branch-Id'] = branchId;

    const contentType = request.headers.get('content-type');
    if (contentType) headers['Content-Type'] = contentType;

    return fetch(target.toString(), { method: request.method, headers, body, cache: 'no-store' });
  };

  let token = await getAccessToken();
  let response = await call(token);
  let refreshed: { accessToken: string; refreshToken: string } | null = null;

  if (response.status === 401) {
    const refreshToken = await getRefreshToken();

    if (refreshToken) {
      const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
      }).catch(() => null);

      if (refreshResponse?.ok) {
        const payload = (await refreshResponse.json().catch(() => null)) as {
          data?: { accessToken: string; refreshToken: string };
        } | null;

        if (payload?.data?.accessToken) {
          refreshed = payload.data;
          token = payload.data.accessToken;
          response = await call(token);
        }
      }
    }
  }

  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? 'application/json';

  /**
   * A 204 MUST BE CONSTRUCTED WITH A NULL BODY, NOT AN EMPTY STRING.
   *
   * The bug this fixes, which broke every delete in the app:
   *
   *   `await response.text()` on a 204 gives '' — an empty string, which is
   *   still a BODY as far as the Fetch spec is concerned. 204, 205 and 304 are
   *   "null body statuses", and on Node 22 this is what happens:
   *
   *     new Response('',   { status: 204 })  → TypeError: Response
   *                                            constructor: Invalid response
   *                                            status code 204
   *     new Response(null, { status: 204 })  → fine
   *
   * So this proxy threw, Next turned that into a 500, and the browser was told
   * "Something went wrong. Please try again." — while the API had already done
   * the work and returned 204 happily. A salon deleting a photograph saw an
   * error, reloaded, and found the photograph gone, which is the worst of both:
   * it teaches them not to trust what the app tells them.
   *
   * It only ever showed on 204, which is why it survived: every other endpoint
   * returns a body, and 200 and 201 construct fine. Six endpoints return 204 —
   * deleting a photograph, an expense, a staff member's time off, a branch
   * resource, a holiday — and all six were failing the same way.
   *
   * Content-Type is dropped with the body. A 204 that announces
   * application/json and carries nothing is a small lie to every client that
   * reads the header before the body.
   */
  const NULL_BODY_STATUS = new Set([204, 205, 304]);
  const isEmpty = NULL_BODY_STATUS.has(response.status);

  const out = new NextResponse(isEmpty ? null : text, {
    status: response.status,
    ...(isEmpty ? {} : { headers: { 'Content-Type': contentType } }),
  });

  if (refreshed) {
    out.cookies.set(ACCESS_COOKIE, refreshed.accessToken, {
      httpOnly: true,
      secure: cookieOptions.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: cookieOptions.ACCESS_MAX_AGE,
    });
    out.cookies.set(REFRESH_COOKIE, refreshed.refreshToken, {
      httpOnly: true,
      secure: cookieOptions.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: cookieOptions.REFRESH_MAX_AGE,
    });
  }

  return out;
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}
export async function POST(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}
export async function PATCH(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}
export async function PUT(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}
export async function DELETE(request: NextRequest, context: Context) {
  return forward(request, (await context.params).path);
}
