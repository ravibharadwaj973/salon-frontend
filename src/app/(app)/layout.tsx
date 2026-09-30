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

  /**
   * A TEMPORARY PASSWORD OPENS ONE SCREEN, AND THIS IS NOT IT.
   *
   * Somebody signed in with a password their manager chose for them is sent to
   * choose their own before anything else loads. Every other endpoint refuses
   * them anyway — the API enforces the same flag — so without this redirect they
   * would meet the app as a wall of failed panels and no explanation.
   *
   * The redirect is the courtesy; the API is the rule. A guard that lived only
   * here would be a suggestion, skippable by anyone who has opened developer
   * tools once.
   */
  if (user.mustChangePassword) redirect('/change-password');

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
