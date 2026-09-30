'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

/**
 * ASKING TO BE LET BACK IN.
 *
 * This form does not send a reset link, and the wording is careful never to
 * suggest it does. In this app the person who decides is a colleague who can see
 * the requester's face — a far better check than a mailbox — and for a salon's
 * sole owner it is support, after verifying them against the details already on
 * the account. Either way somebody human answers, and the honest thing is to say
 * so rather than imply an email is already in flight.
 *
 * ── Why the answer never varies ─────────────────────────────────────────
 *
 * The confirmation is identical whether the address is a real login, somebody
 * else's, or nonsense typed by a stranger. Any difference — wording, an error,
 * even a visibly different delay — would turn this box into a way of finding out
 * who works at a salon, one guess at a time. The server is written the same way.
 *
 * It is the reason the success screen says "if that account exists" rather than
 * anything warmer. It reads as slightly cold to the person it is really for, and
 * that is the price.
 */
export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      /**
       * A rate-limit refusal is the one answer worth distinguishing, because it
       * is the only one the person can act on — waiting works. Everything else,
       * including a genuine server error, lands on the same confirmation: an
       * error shown for one address and not another is the enumeration leak this
       * whole design avoids, arriving through the back door.
       */
      if (response.status === 429) {
        setError('Too many attempts. Wait a few minutes and try again.');
        return;
      }

      setSent(true);
    } catch {
      setError('Cannot reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Asked
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-emerald-900/90">
          If that account exists, the people who can reset it have been told. Nothing has been emailed to you —
          somebody will set you up with a new password directly.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-emerald-900/90">
          In a hurry? Speak to your salon owner or manager. They can do it in a few seconds.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block text-xs font-medium text-emerald-900 underline underline-offset-2"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? (
        <p className="rounded-lg bg-rose-50 p-2.5 text-xs leading-relaxed text-rose-700">{error}</p>
      ) : null}

      <Field label="The email you sign in with" required>
        {({ id }) => (
          <Input
            id={id}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        )}
      </Field>

      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email.trim()}>
        Ask for a reset
      </Button>

      <p className="text-center text-xs text-ink-subtle">
        <Link href="/login" className="underline underline-offset-2 hover:text-ink">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
