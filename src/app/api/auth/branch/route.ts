import { NextResponse } from 'next/server';
import { setActiveBranch } from '@/lib/session';

/** Switches the branch the whole app is working in. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { branchId?: string | null } | null;
  await setActiveBranch(body?.branchId ?? null);
  return NextResponse.json({ ok: true, branchId: body?.branchId ?? null });
}
