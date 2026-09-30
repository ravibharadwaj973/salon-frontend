'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { ClientApiError, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/overlay';

/**
 * RESETTING A COLLEAGUE, AT THE COUNTER, IN ABOUT TEN SECONDS.
 *
 * This is the path almost every lockout in a salon should take. A receptionist
 * cannot get into the till at eight in the morning; the manager standing next to
 * them opens this, presses the button, and reads out twelve characters. No
 * email, no link, no waiting for support, and the identity check is that the
 * manager is looking at the person's face — which is a far stronger check than
 * anything a mailbox can offer.
 *
 * ── Shown once, and said so ────────────────────────────────────────────
 *
 * The password comes back from the API and is never stored anywhere readable.
 * Close this dialog without passing it on and the only way to another one is
 * another reset — which is another audit row, which is correct: somebody
 * resetting the same person four times in a morning is worth being able to see.
 *
 * ── Why there is no "choose the password" box ──────────────────────────
 *
 * There used to be. Left to choose, a busy manager types the same thing every
 * time — the salon name and a year — and within a month every temporary password
 * in the business is one string that everybody who has ever been reset knows.
 * Generating it server-side costs the manager nothing, because either way they
 * read it off this screen.
 */
export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function close() {
    setOpen(false);
    // Cleared on the way out, not left in component state for the next open.
    setPassword(null);
    setError(null);
    setCopied(false);
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ password: string }>(`users/${userId}/reset-password`);
      setPassword(result.password);
    } catch (err) {
      /**
       * A refusal here is worth reading in full.
       *
       * The server does not answer "forbidden": it says which permissions the
       * other person has that you do not, or that this is the salon's only owner
       * and support has to do it. Flattening that into "something went wrong"
       * would leave somebody pressing the same button harder.
       */
      setError(err instanceof ClientApiError ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard access is refused in plenty of ordinary situations — an
      // insecure origin, a locked-down browser. The password is on screen
      // either way, which is what it is for.
      setCopied(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <KeyRound className="h-3.5 w-3.5" />
        Reset password
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={password ? 'Their new password' : `Reset the password for ${name}?`}
        description={
          password
            ? 'Shown once. Pass it on now — there is no way to see it again.'
            : 'They will be signed out everywhere, and asked to choose their own password the next time they sign in.'
        }
        footer={
          password ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={reset} loading={busy}>
                Reset password
              </Button>
            </>
          )
        }
      >
        {error ? (
          <p className="rounded-lg bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">{error}</p>
        ) : null}

        {password ? (
          <div className="space-y-3">
            {/* Big, spaced and monospaced, because it is about to be read aloud
                across a noisy salon or copied onto a sticky note. */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <code className="select-all font-mono text-lg font-semibold tracking-wider text-ink">{password}</code>
              <Button size="sm" variant="secondary" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              It only gets them as far as choosing their own — until they do, their login opens nothing else.
            </p>
          </div>
        ) : error ? null : (
          <p className="text-xs leading-relaxed text-ink-muted">
            You will be shown a temporary password to hand over. Anyone signed in as {name} right now — on the salon
            iPad, on their phone — is signed out immediately.
          </p>
        )}
      </Modal>
    </>
  );
}
