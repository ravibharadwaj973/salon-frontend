import { NextResponse } from 'next/server';
import { z } from 'zod';
import { API_URL } from '@/lib/api';
import { setActiveBranch, setSessionCookies } from '@/lib/session';
import type { SessionUser } from '@/lib/types';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().trim().optional(),
});

/**
 * Exchanges credentials for a session. The tokens are written straight into
 * httpOnly cookies and never reach the browser's JavaScript.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Enter a valid email and password' } },
      { status: 422 },
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'API_UNREACHABLE', message: 'Cannot reach the server. Is the API running?' } },
      { status: 503 },
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { data: { tokens: { accessToken: string; refreshToken: string }; user: SessionUser } }
    | { error: { code: string; message: string; details?: unknown } }
    | null;

  if (!response.ok || !payload || 'error' in payload) {
    const error = payload && 'error' in payload ? payload.error : null;
    return NextResponse.json(
      { error: error ?? { code: 'LOGIN_FAILED', message: 'Could not sign you in' } },
      { status: response.status || 401 },
    );
  }

  await setSessionCookies(payload.data.tokens);

  // Default to the user's first branch so the app has a working context.
  const firstBranch = payload.data.user.branches[0]?.id ?? null;
  await setActiveBranch(firstBranch);

  return NextResponse.json({ user: payload.data.user });
}
