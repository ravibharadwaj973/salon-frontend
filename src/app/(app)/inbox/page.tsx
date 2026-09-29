import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, MessagesSquare, User as UserIcon } from 'lucide-react';
import { apiFetchListAllowed } from '@/lib/api';
import { PermissionGate } from '@/components/permission-gate';
import { Card, EmptyState, PageHeader } from '@/components/ui/display';
import { cn } from '@/lib/cn';
import { fromNow } from '@/lib/format';
import { ConversationPane } from './conversation-pane';
import type { ConversationSummary } from './types';

export const metadata: Metadata = { title: 'Inbox' };
export const dynamic = 'force-dynamic';

/**
 * WHAT THE ASSISTANT HAS BEEN SAYING, AND THE PLACE TO TAKE OVER.
 *
 * Until this screen existed, a salon could not read a conversation its own
 * WhatsApp number was having. The customer's messages were stored and the
 * replies were stored and nothing put them side by side — so the assistant
 * answered people in the salon's name and the salon's only evidence of it was
 * the customer mentioning it later.
 *
 * It also makes a promise true. The assistant tells customers "someone from the
 * salon will look at this personally" whenever it refuses something — a
 * complaint, a burn, a booking that failed for our own reasons — and until now
 * there was nowhere for that to land. Those threads arrive here flagged.
 *
 * ── Why the list and the thread are one screen ────────────────────────────
 *
 * A separate list page and detail page would mean a round trip to find out
 * whether a thread needs answering, and somebody at a counter checks this
 * between customers. Both panes, one glance.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; waiting?: string }>;
}) {
  const { c: selectedId, waiting } = await searchParams;
  const onlyWaiting = waiting === '1';

  const result = await apiFetchListAllowed<ConversationSummary>('/messaging/conversations', {
    query: { pageSize: 50, ...(onlyWaiting ? { needsAttentionOnly: true } : {}) },
    noBranch: true,
  });

  // Forbidden rather than empty: the salon's own screen saying so plainly beats
  // an inbox that looks like nobody has ever written in.
  if (!result) return <PermissionGate what="the inbox" />;

  const conversations = result.data;
  const waitingCount = conversations.filter((row) => row.needsAttention).length;
  const selected = selectedId ?? conversations[0]?.id ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inbox"
        description="Every WhatsApp conversation, whether the assistant or a person is answering it."
      />

      <div className="flex gap-2">
        <FilterChip href="/inbox" active={!onlyWaiting} label="All" />
        <FilterChip
          href="/inbox?waiting=1"
          active={onlyWaiting}
          label={waitingCount > 0 ? `Waiting for a person (${waitingCount})` : 'Waiting for a person'}
        />
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={onlyWaiting ? 'Nothing is waiting' : 'No conversations yet'}
          description={
            onlyWaiting
              ? 'Threads the assistant hands over appear here, along with anything your team takes on.'
              : 'When a customer messages your WhatsApp number, the conversation appears here.'
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <Card className="max-h-[70vh] overflow-y-auto p-1">
            <ul className="divide-y divide-stone-100">
              {conversations.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/inbox?c=${row.id}${onlyWaiting ? '&waiting=1' : ''}`}
                    className={cn(
                      'block px-3 py-3 transition-colors',
                      row.id === selected ? 'bg-brand-50' : 'hover:bg-stone-50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{row.name}</span>
                      <span className="shrink-0 text-2xs text-ink-subtle">{fromNow(row.lastMessageAt)}</span>
                    </div>

                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
                      {/* Who spoke last, because "AI said something 20 seconds
                          ago" and "the customer is waiting" look identical
                          otherwise, and only one of them needs somebody. */}
                      {row.previewFrom === 'CUSTOMER' ? null : row.previewFrom === 'HUMAN' ? (
                        <UserIcon className="h-3 w-3 shrink-0 text-ink-subtle" aria-label="Staff" />
                      ) : (
                        <Bot className="h-3 w-3 shrink-0 text-ink-subtle" aria-label="Assistant" />
                      )}
                      <span className="truncate">{row.preview || '—'}</span>
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {row.needsAttention ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-medium text-amber-700">
                          Needs a person
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-2xs font-medium',
                          row.mode === 'AI' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-ink-muted',
                        )}
                      >
                        {row.mode === 'AI' ? 'Assistant' : row.assignedTo ?? 'A person'}
                      </span>
                      {row.stranger ? (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-2xs text-ink-muted">
                          Not on the book
                        </span>
                      ) : null}
                      {!row.window.open ? (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-2xs text-ink-muted">
                          Window closed
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {selected ? (
            <ConversationPane id={selected} />
          ) : (
            <Card className="p-6">
              <p className="text-sm text-ink-muted">Pick a conversation to read it.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-brand-300 bg-brand-50 text-brand-700'
          : 'border-stone-200 bg-white text-ink-muted hover:border-brand-200',
      )}
    >
      {label}
    </Link>
  );
}
