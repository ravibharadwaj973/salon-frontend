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

  const out = new NextResponse(text, {
    status: response.status,
    headers: { 'Content-Type': contentType },
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
