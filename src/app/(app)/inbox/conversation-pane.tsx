'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, User as UserIcon } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, Spinner } from '@/components/ui/display';
import { cn } from '@/lib/cn';
import { dateTime } from '@/lib/format';
import type { ConversationDetail, ThreadTurn } from './types';

/**
 * ONE THREAD, AND THE TWO DECISIONS THAT CAN BE MADE ABOUT IT.
 *
 * Read it, take it over, hand it back. Everything else on this pane exists to
 * stop somebody making one of those decisions on a false impression.
 */

/**
 * Often enough to feel live at a counter, rarely enough to be free.
 *
 * Not websockets, deliberately: there is no socket server in this app, adding
 * one changes the deployment, and a salon has a handful of live threads rather
 * than a trading floor. Five seconds is indistinguishable from instant to
 * somebody reading a message, and costs one small query.
 */
const POLL_MS = 5000;

export function ConversationPane({ id }: { id: string }) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await apiGet<ConversationDetail>(`messaging/conversations/${id}`, { signal });
        setDetail(data);
        setError(null);
      } catch (err) {
        // A failed poll is not worth wiping a thread somebody is reading.
        if (!signal?.aborted) setError(errorMessage(err));
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    void load(controller.signal);

    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [id, load]);

  /** New messages arrive at the bottom, which is where somebody is reading. */
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [detail?.turns.length]);

  async function act(path: string) {
    setBusy(true);
    try {
      await apiPost(`messaging/conversations/${id}/${path}`, {});
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      const result = await apiPost<{ sent: boolean; reason?: string }>(
        `messaging/conversations/${id}/messages`,
        { body },
      );
      if (result.sent) {
        setDraft('');
        setError(null);
      } else {
        // The server refuses rather than attempting a send WhatsApp will drop,
        // so the reason is worth showing exactly as it came.
        setError(result.reason ?? 'That message could not be sent.');
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <Card className="flex h-[70vh] items-center justify-center">
        <Spinner />
      </Card>
    );
  }

  const windowShut = !detail.window.open;
  const hoursLeft = Math.floor(detail.window.minutesLeft / 60);

  return (
    <Card className="flex h-[70vh] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{detail.name}</p>
          <p className="text-2xs text-ink-subtle">
            {detail.address}
            {detail.stranger ? ' · not on the book' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-1 text-2xs font-medium',
              detail.mode === 'AI' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-ink-muted',
            )}
          >
            {detail.mode === 'AI' ? 'Assistant is answering' : `A person has this${detail.assignedTo ? ` · ${detail.assignedTo}` : ''}`}
          </span>

          {detail.mode === 'AI' ? (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => void act('take-over')}>
              Take over
            </Button>
          ) : (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => void act('resume-assistant')}>
              Give back to the assistant
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {detail.turns.length === 0 ? (
          <p className="text-center text-xs text-ink-subtle">Nothing has been said yet.</p>
        ) : (
          detail.turns.map((turn) => <Turn key={`${turn.from}-${turn.id}`} turn={turn} />)
        )}
        <div ref={bottom} />
      </div>

      <footer className="border-t border-stone-100 px-4 py-3">
        {/**
          * THE WINDOW, SAID BEFORE ANYTHING IS TYPED.
          *
          * WhatsApp refuses free text more than 24 hours after the customer's
          * last message, and refuses it asynchronously — the message looks sent,
          * sits in the thread, and never arrives. So the box is disabled and the
          * reason is given, rather than letting somebody write a paragraph and
          * find out from a delivery failure nobody is watching for.
          */}
        {windowShut ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            More than 24 hours have passed since {detail.name.split(' ')[0]} last wrote, so WhatsApp will not
            deliver a plain message. Send an approved template from Campaigns, or wait until they write again.
          </p>
        ) : (
          <>
            {detail.mode === 'AI' ? (
              <p className="mb-2 text-2xs leading-relaxed text-ink-subtle">
                The assistant is answering this one. Sending a message yourself does not stop it — use{' '}
                <span className="font-medium">Take over</span> for that.
              </p>
            ) : null}

            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter breaks the line — the shape every
                  // messaging app has taught people to expect.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendReply();
                  }
                }}
                rows={2}
                placeholder="Type a message…"
                className="min-h-[2.75rem] flex-1 resize-y rounded-lg border border-stone-200 px-3 py-2 text-sm text-ink outline-none focus:border-brand-400"
              />
              <Button onClick={() => void sendReply()} loading={busy} disabled={!draft.trim()}>
                <Send className="h-4 w-4" />
                Send
              </Button>
            </div>

            {hoursLeft < 4 ? (
              <p className="mt-1.5 text-2xs text-ink-subtle">
                About {hoursLeft < 1 ? `${detail.window.minutesLeft} minutes` : `${hoursLeft} hours`} left to
                reply freely.
              </p>
            ) : null}
          </>
        )}

        {error ? <p className="mt-2 text-xs leading-relaxed text-rose-600">{error}</p> : null}
      </footer>
    </Card>
  );
}

/**
 * One turn.
 *
 * The customer on the left, the salon on the right, and — the part that matters
 * — the salon's own turns labelled with WHICH of them said it. A salon reading
 * its thread needs to tell a staff reply from the assistant's at a glance;
 * that distinction is most of why anybody opens this screen.
 */
function Turn({ turn }: { turn: ThreadTurn }) {
  const mine = turn.from !== 'CUSTOMER';
  const failed = turn.status === 'FAILED';

  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[80%]', mine ? 'text-right' : 'text-left')}>
        {mine ? (
          <p className="mb-0.5 flex items-center justify-end gap-1 text-2xs text-ink-subtle">
            {turn.from === 'HUMAN' ? (
              <>
                <UserIcon className="h-3 w-3" aria-hidden /> Staff
              </>
            ) : turn.from === 'SYSTEM' ? (
              <>Campaign</>
            ) : (
              <>
                <Bot className="h-3 w-3" aria-hidden /> Assistant
              </>
            )}
          </p>
        ) : null}

        <div
          className={cn(
            'inline-block rounded-2xl px-3 py-2 text-left text-xs leading-relaxed',
            !mine
              ? 'bg-stone-100 text-ink'
              : failed
                ? 'bg-rose-50 text-rose-900'
                : turn.from === 'HUMAN'
                  ? 'bg-brand-600 text-white'
                  : 'bg-brand-50 text-ink',
          )}
        >
          {turn.body || <span className="italic opacity-70">({turn.messageType ?? 'no text'})</span>}
        </div>

        <p className="mt-0.5 text-2xs text-ink-subtle">
          {dateTime(turn.at)}
          {turn.status && turn.status !== 'QUEUED' ? ` · ${turn.status.toLowerCase()}` : ''}
        </p>

        {/* The reason in full, on the message it belongs to. A failed send with
            no reason sends somebody to the message log to guess. */}
        {failed && turn.error ? <p className="mt-0.5 text-2xs text-rose-600">{turn.error}</p> : null}
      </div>
    </div>
  );
}
