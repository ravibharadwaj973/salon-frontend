import 'server-only';
import { cookies } from 'next/headers';

/**
 * Tokens live in httpOnly cookies, never in localStorage. The browser bundle
 * cannot read them, and every API call is proxied through this app so the
 * access token is attached server-side.
 */
export const ACCESS_COOKIE = 'sos_at';
export const REFRESH_COOKIE = 'sos_rt';
export const BRANCH_COOKIE = 'sos_branch';

/**
 * Backend access tokens last 15 minutes. The cookie is deliberately given a
 * slightly shorter life so middleware refreshes it *before* the API would
 * reject it, rather than after a failed request.
 */
const ACCESS_MAX_AGE = 14 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

const secure = process.env.NODE_ENV === 'production';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE)?.value ?? null;
}

export async function getActiveBranchId(): Promise<string | null> {
  const store = await cookies();
  return store.get(BRANCH_COOKIE)?.value ?? null;
}

/** Only callable from a Route Handler or Server Action. */
export async function setSessionCookies(tokens: TokenPair): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_MAX_AGE,
  });
  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}

export async function setActiveBranch(branchId: string | null): Promise<void> {
  const store = await cookies();
  if (!branchId) {
    store.delete(BRANCH_COOKIE);
    return;
  }
  store.set(BRANCH_COOKIE, branchId, {
    httpOnly: false, // the UI reads this to highlight the current branch
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  store.delete(BRANCH_COOKIE);
}

export const cookieOptions = { ACCESS_MAX_AGE, REFRESH_MAX_AGE, secure };
