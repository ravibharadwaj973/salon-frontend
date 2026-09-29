'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Loader2 } from 'lucide-react';
import { apiPut, errorMessage } from '@/lib/client';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { cn } from '@/lib/cn';

/**
 * THE SWITCH THAT COULD ONLY BE THROWN WITH SQL.
 *
 * The assistant has answered customers since the day it shipped, and whether it
 * did was a key in a JSON column with no screen anywhere. Turning it on for a
 * salon meant an UPDATE against production — which is how it once got switched
 * on for three salons at once, because the statement had no WHERE.
 *
 * So no salon could be handed this feature. Not because it did not work, but
 * because nobody outside a psql prompt could say yes to it.
 *
 * ── Why it says "new conversations" and not "on" ──────────────────────────
 *
 * Every conversation carries its own mode from the moment it is created, and
 * this only seeds it. That is deliberate and worth stating on the screen: a
 * salon switching this off does not want to discover it has also seized forty
 * threads its staff were happily letting the assistant handle, and one
 * switching it on must not have the conversations its staff took over handed
 * back to a machine mid-complaint.
 */
export function AssistantCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(next: boolean) {
    setBusy(true);
    setError(null);
    /**
     * Moved before the request, and put back if it fails.
     *
     * A toggle that does nothing for half a second gets pressed twice, and the
     * second press means the opposite of the first.
     */
    setOn(next);
    try {
      await apiPut('messaging/setup', { assistant: { repliesToNewConversations: next } });
      router.refresh();
    } catch (err) {
      setOn(!next);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-brand-600" aria-hidden />
            The assistant
          </span>
        }
        subtitle="Answers customers who message your WhatsApp number, inside the 24 hours WhatsApp allows."
      />
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {on ? 'Answering new conversations' : 'Not answering'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {on
                ? 'A customer who writes in gets an answer straight away — your prices, your hours, and real times from your diary. It offers appointments and never books one without the customer saying yes.'
                : 'Customers who write in are stored in your Inbox for somebody to answer. Nothing automatic goes out.'}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Let the assistant answer new conversations"
            disabled={busy}
            onClick={() => void set(!on)}
            className={cn(
              'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
              on ? 'bg-brand-600' : 'bg-stone-300',
              busy && 'opacity-60',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-all',
                on ? 'left-[1.375rem]' : 'left-0.5',
              )}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin text-ink-subtle" /> : null}
            </span>
          </button>
        </div>

        {/**
          * Said on the screen, because it is the thing somebody will otherwise
          * assume wrongly — and assume in the more alarming direction.
          */}
        <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-2xs leading-relaxed text-ink-muted">
          This decides what happens to the <span className="font-medium">next</span> customer who writes in.
          Conversations already open keep whoever has them, so turning this off does not take over the ones the
          assistant is handling, and turning it on does not hand back the ones your team took over. Either way
          you can switch a single conversation in the Inbox.
        </p>

        {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      </CardBody>
    </Card>
  );
}
