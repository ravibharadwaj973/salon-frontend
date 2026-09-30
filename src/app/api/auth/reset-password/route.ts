import { NextResponse } from 'next/server';
import { z } from 'zod';
import { API_URL } from '@/lib/api';

/**
 * REDEEMING A RESET LINK.
 *
 * Under `/api/auth/*` rather than the proxy for the same reason as its sibling:
 * the person using it has no session by definition, and the proxy sits behind
 * the middleware's session check, which would answer their POST with an HTML
 * login page.
 *
 * Nothing is decided here. The token is checked, spent and invalidated by the
 * API inside one transaction — single use, two-hour life, superseded by any
 * newer link, and every session on the account revoked when it is spent. This
 * route carries the request and the client's address and gets out of the way.
 *
 * ── Why the API's message is passed straight through ───────────────────
 *
 * "Invalid or expired" is deliberately one message covering both. Telling
 * somebody a link has EXPIRED confirms it was real, which is a useful thing to
 * learn if you are holding a token you should not have. The API is written that
 * way; rewriting it here would undo it.
 */

const bodySchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Choose a password of at least 8 characters, with a letter and a number.',
        },
      },
      { status: 422 },
    );
  }

  const forwardedFor =
    request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '';

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
      },
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
    | { data: { reset: boolean } }
    | { error: { code: string; message: string } }
    | null;

  if (!response.ok || !payload || 'error' in payload) {
    const error = payload && 'error' in payload ? payload.error : null;
    return NextResponse.json(
      { error: error ?? { code: 'RESET_FAILED', message: 'That link is no longer valid.' } },
      { status: response.status || 400 },
    );
  }

  /**
   * No session is issued. They have just proved they control the mailbox, not
   * that they are at a device we should trust — and the reset revoked every
   * session the account had, which must include any the attacker was holding.
   * They sign in with the new password like anybody else.
   */
  return NextResponse.json({ reset: true });
}
