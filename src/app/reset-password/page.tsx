import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthPage } from '@/components/auth/auth-page';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Set a new password' };

/**
 * Reached only from a link support issued, so there is no navigation to it and
 * nothing links here. `Suspense` because the form reads the token from the query
 * string, which Next requires a boundary for.
 */
export default function ResetPasswordPage() {
  return (
    <AuthPage
      title="Set a new password"
      intro="Choose something only you know. Everywhere your account is currently signed in will be signed out."
    >
      <Suspense fallback={<div className="h-48" />}>
        <ResetForm />
      </Suspense>
    </AuthPage>
  );
}
