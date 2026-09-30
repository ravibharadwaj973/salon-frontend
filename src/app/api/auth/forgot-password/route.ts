import { NextResponse } from 'next/server';
import { z } from 'zod';
import { API_URL } from '@/lib/api';

/**
 * "I CANNOT SIGN IN", FORWARDED TO THE API.
 *
 * A route of its own rather than the generic proxy, for a reason that has bitten
 * this app before: the proxy lives under a path the middleware protects, so a
 * request from somebody with no cookie is redirected to the login screen, and
 * the form receives an HTML page where it expected JSON. That is exactly how
 * online booking broke — the same mistake, on the one form whose entire audience
 * is people without a session.
 *
 * `/api/auth/*` is already public, for the same reason signing in cannot require
 * being signed in.
 *
 * ── The client's address, carried through ───────────────────────────────
 *
 * Forwarded deliberately. The API rate-limits this endpoint by address, and
 * records the address a request came from — both of which are worthless if every
 * request appears to come from this server. Without it, one person hammering the
 * form would exhaust the budget for everybody, and the recorded address would
 * identify the host rather than whoever was probing.
 */

const bodySchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  /**
   * Even a malformed body gets the ordinary answer.
   *
   * A validation error for a bad address and a success for a good one is a
   * difference somebody can measure, and measuring differences is the whole
   * technique for finding out who works at a salon. The endpoint is written to
   * be uninformative; this keeps it that way on the one path that would
   * otherwise leak.
   */
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const forwardedFor =
    request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '';

  try {
    const response = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
      },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });

    // The one status worth passing on: being asked to wait is something the
    // person can act on, and it is not tied to whether the account exists.
    if (response.status === 429) {
      return NextResponse.json(
        { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again in a few minutes.' } },
        { status: 429 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: { code: 'API_UNREACHABLE', message: 'Cannot reach the server. Try again in a moment.' } },
      { status: 503 },
    );
  }
}
