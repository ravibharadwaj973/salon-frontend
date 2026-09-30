import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthPage } from '@/components/auth/auth-page';
import { ForgotForm } from './forgot-form';

export const metadata: Metadata = { title: 'Cannot sign in' };

export default function ForgotPasswordPage() {
  return (
    <AuthPage
      title="Cannot sign in?"
      intro={
        <>
          <p>
            Nobody can reset their own password here — not staff, not managers, not owners. Somebody else does it for
            you, which is what stops anyone with ten minutes at your inbox walking into the salon’s till.
          </p>
          {/**
           * Both routes, named up front.
           *
           * Most people reading this can be back in within a minute by turning
           * round and asking the manager standing behind them. Saying so here
           * saves them a form, a wait and a support ticket — and the one case
           * that genuinely needs us is named too, so a locked-out owner does not
           * spend the afternoon asking staff who cannot help.
           */}
          <ul className="mt-3 space-y-1.5 text-xs leading-relaxed">
            <li>
              <span className="font-medium text-ink">Staff and managers</span> — ask your salon owner or a manager.
              They reset it in the app and hand you a temporary password on the spot.
            </li>
            <li>
              <span className="font-medium text-ink">The salon’s owner</span> — nobody in the salon can reset you, so
              use the form below. Support will check who you are against the details already on the account, then email
              a link to that address.
            </li>
          </ul>
        </>
      }
      footer={
        <>
          Know your password?{' '}
          <Link href="/login" className="underline underline-offset-2 hover:text-ink">
            Sign in
          </Link>
        </>
      }
    >
      <ForgotForm />
    </AuthPage>
  );
}
