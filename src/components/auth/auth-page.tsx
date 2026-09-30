import Link from 'next/link';
import { ParlonLogo } from '@/components/brand/parlon-logo';

/**
 * THE SHELL FOR THE SCREENS SOMEBODY REACHES WHEN THEY CANNOT GET IN.
 *
 * Deliberately not the app shell. There is no navigation, no branch picker and
 * no back link into the product, because on two of these three screens the
 * person has no session and every one of those would be a link to a login
 * screen they have already failed at.
 *
 * It is also deliberately not the two-column login page. That layout sells the
 * product to somebody arriving fresh; these pages are read by somebody who is
 * stuck and mildly annoyed, and the pitch beside their problem reads badly.
 * One column, one thing to do.
 */
export function AuthPage({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  /** A way onward, when there is a sensible one. */
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col justify-center bg-canvas px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <Link href="/login" className="inline-flex items-center gap-2.5" aria-label="Parlon">
          <ParlonLogo className="h-9 w-9" />
          <span className="text-base font-semibold tracking-tight text-ink">Parlon</span>
        </Link>

        <h1 className="mt-8 text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {intro ? <div className="mt-1.5 text-sm leading-relaxed text-ink-muted">{intro}</div> : null}

        <div className="mt-6">{children}</div>

        {footer ? <div className="mt-6 text-center text-xs text-ink-subtle">{footer}</div> : null}
      </div>
    </main>
  );
}

/**
 * The password rule, written once and shown wherever a password is chosen.
 *
 * Shown BEFORE anybody types rather than as an error afterwards. A rule that
 * only appears once you have broken it makes people guess, and the guess that
 * costs least is the shortest thing that passes.
 */
export const PASSWORD_RULE = 'At least 8 characters, with a letter and a number.';

/** The same rule as a check, so the form and the API agree about what is valid. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'That is too short — 8 characters or more.';
  if (!/[a-zA-Z]/.test(password)) return 'Add a letter.';
  if (!/\d/.test(password)) return 'Add a number.';
  return null;
}
