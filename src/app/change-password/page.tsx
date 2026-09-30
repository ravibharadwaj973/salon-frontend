import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/auth/auth-page';
import { apiFetch } from '@/lib/api';
import type { SessionUser } from '@/lib/types';
import { ChangePasswordForm } from './change-form';

export const metadata: Metadata = { title: 'Change password' };
export const dynamic = 'force-dynamic';

/**
 * Outside the app shell on purpose.
 *
 * Somebody arriving here on a temporary password may not open anything else —
 * the API refuses every other endpoint until it is changed — so rendering the
 * navigation around them would be drawing a menu of doors that are all locked.
 * Somebody who came here deliberately gets the same plain screen; it is one
 * form, and the shell adds nothing to it.
 */
export default async function ChangePasswordPage() {
  let user: SessionUser;
  try {
    user = await apiFetch<SessionUser>('/auth/me', { noBranch: true });
  } catch {
    redirect('/login');
  }

  const forced = user.mustChangePassword;

  return (
    <AuthPage
      title={forced ? 'Choose your own password' : 'Change your password'}
      intro={
        forced ? (
          <>
            You are signed in with a password somebody else chose for you, so it is known to at least one other person.
            Pick your own and the rest of the app opens up.
          </>
        ) : (
          <>
            Changing it signs you out everywhere else — any other browser, phone or tablet your account is open on. This
            device stays signed in.
          </>
        )
      }
    >
      <ChangePasswordForm forced={forced} />
    </AuthPage>
  );
}
