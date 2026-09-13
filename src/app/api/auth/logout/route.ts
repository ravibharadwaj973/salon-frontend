import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { clearSessionCookies, getRefreshToken } from '@/lib/session';

export async function POST() {
  const refreshToken = await getRefreshToken();

  // Best effort: revoke server-side, but always clear locally.
  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }

  await clearSessionCookies();
  return NextResponse.json({ ok: true });
}
