import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { apiFetchListAllowed } from '@/lib/api';
import { PermissionGate } from '@/components/permission-gate';
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge } from '@/components/ui/display';
import { Pagination, TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { fromNow, phone as formatPhone } from '@/lib/format';
import type { MessageLogEntry } from '@/lib/types';

export const metadata: Metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

/**
 * Every message the salon has sent, and what became of it.
 *
 * This page exists because "Sent" on the send screen is not true yet — it
 * means the message was queued. The worker picks it up a moment later and the
 * provider may still refuse it: an unapproved template, an expired token, a
 * number WhatsApp will not deliver to. Until this page existed there was
 * nowhere to find that out, so a message that never arrived looked identical
 * to one that did.
 *
 * Since the provider webhooks were wired up the log goes further than sent or
 * not. WhatsApp and Resend both report back, so a row can say the message
 * landed, that the customer opened it, that they clicked the link — or that
 * the address bounced and should not be written to again.
 *
 * The reason is shown in full rather than behind a click. Somebody standing at
 * the desk wondering why a customer never got their reminder should not have
 * to go looking.
 */

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'QUEUED', label: 'Waiting' },
  { key: 'SENT', label: 'Sent' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'READ', label: 'Opened' },
  { key: 'CLICKED', label: 'Clicked' },
  // One chip for everything that needs a human: four different endings, but
  // nobody comes to this page thinking "show me complaints specifically".
  { key: 'DELAYED,BOUNCED,COMPLAINED,FAILED', label: 'Problems' },
] as const;

const NEEDS_ATTENTION = new Set(['DELAYED', 'BOUNCED', 'COMPLAINED', 'FAILED']);

/** READ is a read receipt on WhatsApp and an open in email — same fact, two words. */
function statusLabel(message: MessageLogEntry): string | undefined {
  if (message.status !== 'READ') return undefined;
  return message.channel === 'EMAIL' ? 'opened' : 'read';
}

/**
 * The last column. Each status gets the sentence a receptionist would need,
 * not the provider's wording — and where a message has climbed past delivery,
 * it says how far it got rather than repeating the badge.
 */
function outcome(message: MessageLogEntry): { text: string; tone: string } {
  const reason = message.errorMessage ?? message.errorCode;

  switch (message.status) {
    case 'QUEUED':
      return {
        text: 'Waiting for the sender. If it stays here, the background worker is not running.',
        tone: 'text-ink-subtle',
      };
    case 'SENT':
      return {
        text: 'Accepted by the provider. No delivery confirmation yet.',
        tone: 'text-ink-subtle',
      };
    case 'DELIVERED':
      return { text: 'Delivered to the customer.', tone: 'text-emerald-700' };
    case 'READ':
      return {
        text:
          message.channel === 'EMAIL'
            ? 'Delivered, and the customer opened it.'
            : 'Delivered, and the customer read it.',
        tone: 'text-emerald-700',
      };
    case 'CLICKED':
      return { text: 'The customer opened it and clicked a link.', tone: 'text-emerald-700' };
    case 'DELAYED':
      return {
        text:
          reason ??
          'The receiving server asked us to try later. It usually arrives; if it never does it will turn into a bounce.',
        tone: 'text-amber-700',
      };
    case 'BOUNCED':
      return {
        text: `${reason ?? 'The receiving server rejected this address'} — it will not be written to again.`,
        tone: 'text-rose-700',
      };
    case 'COMPLAINED':
      return {
        text: 'The customer marked this as spam. Marketing consent has been withdrawn for them.',
        tone: 'text-rose-700',
      };
    case 'FAILED':
      return { text: reason ?? 'Delivery failed.', tone: 'text-rose-700' };
    case 'SKIPPED':
      return { text: reason ?? 'Not sent — the customer had no address on this channel.', tone: 'text-ink-subtle' };
    default:
      return { text: '—', tone: 'text-ink-subtle' };
  }
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; channel?: string; campaignId?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const status = params.status ?? '';
  const campaignId = params.campaignId ?? '';

  const result = await apiFetchListAllowed<MessageLogEntry>('/messages', {
    query: {
      page,
      pageSize: 25,
      status: status || undefined,
      channel: params.channel || undefined,
      campaignId: campaignId || undefined,
    },
  });

  if (!result) {
    return <PermissionGate permission="campaign.view" what="The message log is restricted." />;
  }

  const { data: messages, meta } = result;
  const problems = messages.filter((m) => NEEDS_ATTENTION.has(m.status)).length;

  // Changing the status must not silently drop the campaign the person came in
  // with, or "Problems" would jump from one campaign to the whole salon.
  const href = (nextStatus: string) => {
    const query = new URLSearchParams();
    if (nextStatus) query.set('status', nextStatus);
    if (campaignId) query.set('campaignId', campaignId);
    const qs = query.toString();
    return qs ? `/messages?${qs}` : '/messages';
  };

  // The campaign's own name, taken from the rows rather than fetched again.
  const campaignName = campaignId ? messages.find((m) => m.campaign)?.campaign?.name : undefined;

  return (
    <>
      <PageHeader
        title="Messages"
        description={
          campaignId
            ? `Every message ${campaignName ? `“${campaignName}”` : 'this campaign'} sent — and what became of each one.`
            : 'What was sent, what arrived, and what did not — with the reason.'
        }
      />

      {campaignId ? (
        <div className="mb-4 flex items-center gap-3 text-xs">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
            {campaignName ?? 'One campaign'}
          </span>
          <Link href={status ? `/messages?status=${encodeURIComponent(status)}` : '/messages'} className="text-ink-muted hover:underline">
            Show every message
          </Link>
        </div>
      ) : null}

      <div className="mb-5 flex w-fit flex-wrap rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm">
        {FILTERS.map((item) => (
          <Link
            key={item.key || 'all'}
            href={href(item.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              status === item.key ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader
          title={`${meta?.total ?? messages.length} messages`}
          subtitle={
            problems > 0
              ? `${problems} on this page need a look — the reason is in the last column`
              : 'Newest first'
          }
        />

        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nothing sent yet"
            description="Messages appear here the moment they are queued, whether or not they reach the customer."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>To</TH>
                  <TH>Channel</TH>
                  {/* Every row would say the same campaign — the chip above
                      already says which one. */}
                  {campaignId ? null : <TH>Campaign</TH>}
                  <TH>Template</TH>
                  <TH>Status</TH>
                  <TH>When</TH>
                  <TH>What happened</TH>
                </TR>
              </THead>
              <TBody>
                {messages.map((message) => {
                  const result = outcome(message);
                  return (
                    <TR key={message.id}>
                      <TD>
                        {message.customer ? (
                          <Link
                            href={`/customers/${message.customer.id}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {message.customer.firstName} {message.customer.lastName ?? ''}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                        <div className="tnum text-2xs text-ink-subtle">
                          {message.channel === 'EMAIL' ? message.toAddress : formatPhone(message.toAddress)}
                        </div>
                      </TD>

                      <TD className="text-xs text-ink-muted">{message.channel}</TD>

                      {campaignId ? null : (
                      <TD className="text-xs">
                        {message.campaign ? (
                          <Link
                            href={`/campaigns/${message.campaign.id}`}
                            className="text-ink-muted hover:text-ink hover:underline"
                          >
                            {message.campaign.name}
                          </Link>
                        ) : (
                          // Reminders, birthday wishes, a send from a profile.
                          <span className="text-ink-subtle">One-off</span>
                        )}
                      </TD>
                      )}

                      <TD className="text-xs text-ink-muted">
                        {message.template?.name ?? <span className="text-ink-subtle">Free text</span>}
                      </TD>

                      <TD>
                        <StatusBadge status={message.status} label={statusLabel(message)} />
                      </TD>

                      {/* The most recent thing that happened, not when we queued it. */}
                      <TD className="text-xs text-ink-muted">
                        {fromNow(
                          message.clickedAt ??
                            message.readAt ??
                            message.deliveredAt ??
                            message.sentAt ??
                            message.queuedAt,
                        )}
                      </TD>

                      {/* The column that makes this page worth having. */}
                      <TD className={`max-w-md text-xs leading-relaxed ${result.tone}`}>{result.text}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            {meta ? (
              <Pagination
                page={meta.page}
                pageSize={meta.pageSize}
                total={meta.total}
                basePath="/messages"
                searchParams={{ status: status || undefined, campaignId: campaignId || undefined }}
              />
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
