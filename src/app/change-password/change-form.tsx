'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { PASSWORD_RULE, passwordProblem } from '@/components/auth/auth-page';

/**
 * CHANGING YOUR OWN PASSWORD — AND THE FORCED VERSION OF THE SAME SCREEN.
 *
 * One form, two arrivals. Somebody who chose to come here is changing a password
 * they know; somebody sent here was handed a temporary one by their manager and
 * cannot use the rest of the app until they replace it. The difference is
 * `forced`, and it changes the words and removes the way out — nothing else,
 * because the operation is identical and two screens would drift.
 *
 * ── Why the current password is asked for either way ────────────────────
 *
 * Including on the forced path, where the person has just typed it to get in.
 * A signed-in browser left open at a counter is the commonest way a salon
 * account is taken, and a change-password screen that trusts the session alone
 * hands that account to whoever sits down next. Asking again costs the rightful
 * owner four seconds.
 *
 * ── Why this posts through our own route and not the proxy ──────────────
 *
 * The change revokes every session the account had, including this one, and the
 * API answers with a fresh token pair. Those have to be written into httpOnly
 * cookies, which only a server route can do. Posted straight at the proxy, the
 * new tokens would arrive in the browser where nothing can store them, and the
 * person would be signed out by the act of securing their account.
 */
export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const problem = passwordProblem(next);
    if (problem) return setError(problem);
    if (next !== confirm) return setError('The two new passwords do not match.');
    if (next === current) return setError('That is the password you already have. Choose a different one.');

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? 'Could not change your password.');
        return;
      }

      /**
       * A full navigation, not router.push.
       *
       * The cookies were replaced by the response that just landed, and every
       * cached server render in this tab was produced with the old session. A
       * client-side transition can reuse those; a real navigation cannot.
       */
      window.location.replace('/');
    } catch {
      setError('Cannot reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? (
        <p className="rounded-lg bg-rose-50 p-2.5 text-xs leading-relaxed text-rose-700">{error}</p>
      ) : null}

      <Field label={forced ? 'The password you were given' : 'Current password'} required>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        )}
      </Field>

      <Field label="New password" hint={PASSWORD_RULE} required>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            autoComplete="new-password"
            required
          />
        )}
      </Field>

      <Field label="Type it again" required>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />
        )}
      </Field>

      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!current || !next || !confirm}>
        {forced ? 'Set my password and carry on' : 'Change password'}
      </Button>

      {/* No escape on the forced path. Offering one would be offering a link to
          a screen the API is going to refuse anyway — see the middleware. */}
      {forced ? (
        <p className="text-center text-xs text-ink-subtle">
          Not you?{' '}
          <Link href="/api/auth/logout" className="underline underline-offset-2 hover:text-ink">
            Sign out
          </Link>
        </p>
      ) : (
        <p className="text-center text-xs text-ink-subtle">
          <button
            type="button"
            onClick={() => router.back()}
            className="underline underline-offset-2 hover:text-ink"
          >
            Cancel
          </button>
        </p>
      )}
    </form>
  );
}
