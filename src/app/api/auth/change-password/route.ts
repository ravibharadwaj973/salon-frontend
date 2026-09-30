import { NextResponse } from 'next/server';
import { z } from 'zod';
import { API_URL } from '@/lib/api';
import { getAccessToken, setSessionCookies } from '@/lib/session';

/**
 * CHANGING A PASSWORD, AND KEEPING THE PERSON SIGNED IN WHILE IT HAPPENS.
 *
 * A route of its own rather than the ordinary proxy, for one reason: the API
 * revokes every session this account has — which is the point, since a password
 * is usually changed because somebody else might have the old one — and hands
 * back a fresh pair for the person standing here, who has just proved they know
 * the current password.
 *
 * Those tokens have to land in httpOnly cookies, and only a server route can
 * write them. Through the generic proxy they would be returned to the browser,
 * where nothing can store them, and the person would be signed out by the act of
 * securing their own account.
 */

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Enter your current password and a new one of at least 8 characters.' } },
      { status: 422 },
    );
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Your session has expired. Sign in again.' } },
      { status: 401 },
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'API_UNREACHABLE', message: 'Cannot reach the server. Try again in a moment.' } },
      { status: 503 },
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { data: { changed: boolean; tokens: { accessToken: string; refreshToken: string } } }
    | { error: { code: string; message: string } }
    | null;

  if (!response.ok || !payload || 'error' in payload) {
    const error = payload && 'error' in payload ? payload.error : null;
    return NextResponse.json(
      { error: error ?? { code: 'CHANGE_FAILED', message: 'Could not change your password.' } },
      { status: response.status || 400 },
    );
  }

  /**
   * The old cookies are dead the moment the API returns, so this write is not
   * an optimisation — without it the next request carries a revoked refresh
   * token and the person is bounced to the login screen.
   */
  if (payload.data.tokens) await setSessionCookies(payload.data.tokens);

  return NextResponse.json({ changed: true });
}
