'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { PASSWORD_RULE, passwordProblem } from '@/components/auth/auth-page';

/**
 * SETTING A NEW PASSWORD FROM A LINK SUPPORT ISSUED.
 *
 * The one place in the app where somebody chooses a password without being
 * signed in, so the token in the URL is the only thing standing between a
 * stranger and an owner's account. Everything protecting it is on the server —
 * single use, two-hour life, invalidated by any newer link, and every session
 * revoked when it is spent. Nothing here can be trusted to do that job, and this
 * file does not pretend otherwise.
 *
 * What it does do is fail honestly. A missing or spent token is said plainly,
 * with the way to get another, rather than showing a form that will refuse on
 * submit — somebody who has waited for support to answer should not also have to
 * type a password twice to find out the link went stale.
 */
export function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('The two passwords do not match.');

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? 'That link is no longer valid. Ask support for another.');
        return;
      }

      setDone(true);
    } catch {
      setError('Cannot reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
        <p className="text-sm font-medium">This link is incomplete</p>
        <p className="mt-1.5">
          Open the link from the email exactly as it arrived — some mail apps cut off the end of a long address. If it
          still does not work, ask for a new one.
        </p>
        <Link href="/forgot-password" className="mt-3 inline-block font-medium underline underline-offset-2">
          Ask for a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Password set
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-emerald-900/90">
          {/* Said rather than discovered. Somebody who was signed in on the salon
              iPad is about to find it signed out, and being told why beats
              assuming something has broken. */}
          Everywhere your account was signed in has been signed out, including any device you did not have with you.
          Sign in again with the new password.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-xs font-medium text-emerald-900 underline underline-offset-2"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? (
        <p className="rounded-lg bg-rose-50 p-2.5 text-xs leading-relaxed text-rose-700">{error}</p>
      ) : null}

      <Field label="New password" hint={PASSWORD_RULE} required>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            autoFocus
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

      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!password || !confirm}>
        Set password
      </Button>
    </form>
  );
}
