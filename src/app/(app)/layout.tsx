import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { apiFetch, apiFetchList } from '@/lib/api';
import { getActiveBranchId } from '@/lib/session';
import type { BusinessAlert, SessionUser } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user: SessionUser;

  try {
    user = await apiFetch<SessionUser>('/auth/me', { noBranch: true });
  } catch {
    // Middleware normally catches this; if the token was revoked mid-session
    // we land here instead of rendering an empty shell.
    redirect('/login');
  }

  // `unreadOnly` + pageSize 1 makes meta.total the unread count without
  // dragging the whole alert list into the shell.
  const [branchId, alerts] = await Promise.all([
    getActiveBranchId(),
    apiFetchList<BusinessAlert>('/analytics/alerts', { query: { pageSize: 1, unreadOnly: 'true' } }).catch(() => null),
  ]);

  return (
    <AppShell user={user} activeBranchId={branchId} unreadAlerts={alerts?.meta.total ?? 0}>
      {children}
    </AppShell>
  );
}
