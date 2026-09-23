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

/**
 * The three channels are really three different jobs.
 *
 * WhatsApp fails for template and 24-hour-window reasons, email for address
 * and reputation ones, SMS for DLT ones. Mixed together, a salon chasing a
 * bounce has to read past reminders that went out fine on another channel —
 * and the statuses do not even mean the same thing across them, since only
 * email reports opens and clicks.
 */
const CHANNELS = [
  { key: '', label: 'All channels' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'EMAIL', label: 'Email' },
  { key: 'SMS', label: 'SMS' },
] as const;

/**
 * Which status chips are worth showing for a channel.
 *
 * Opens and clicks only exist in email — WhatsApp has a read receipt, which
 * shares the READ value, and SMS reports neither. Offering "Clicked" on SMS
 * is offering a filter that can only ever come back empty.
 */
function filtersFor(channel: string): readonly { key: string; label: string }[] {
  if (channel === 'SMS') return FILTERS.filter((f) => !['READ', 'CLICKED'].includes(f.key));
  if (channel === 'WHATSAPP') return FILTERS.filter((f) => f.key !== 'CLICKED').map((f) => (f.key === 'READ' ? { key: 'READ', label: 'Read' } : f));
  return FILTERS;
}

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
    case 'SENT': {
      /**
       * "Sent" covers two states that look identical and are not.
       *
       * The console provider returns ok so that journeys can run without
       * credentials — which means a message that was only written to a log
       * file reaches this screen wearing the same badge as one WhatsApp
       * accepted. Somebody reading "sent" then waits for a delivery receipt
       * that can never arrive, for a message that never left the building.
       *
       * The provider id is the only thing that tells them apart, so it decides
       * the sentence.
       */
      const id = message.providerMessageId ?? '';
      if (id.startsWith('console_')) {
        return {
          text: 'NOT SENT — logged only. This salon had no connected sender, so the message was written to the server log and nothing left the building.',
          tone: 'text-amber-700',
        };
      }
      if (id.startsWith('sim_')) {
        return {
          text: 'NOT SENT — simulated. The pretend carrier recorded this exactly like a real send and delivered nothing.',
          tone: 'text-amber-700',
        };
      }
      /**
       * Waiting for a receipt is normal for a few seconds and suspicious after
       * an hour, and which one it is depends on where this is running — so the
       * sentence does too.
       *
       * The first version of this explained localhost unconditionally, which
       * is useful on a laptop and nonsense on the salon's screen: an owner
       * reading "on localhost it never can" about their own message learns
       * nothing and distrusts the page. Deployment detail belongs in
       * development; a salon owner gets a fact about their message.
       */
      const waitedMs = message.sentAt ? Date.now() - new Date(message.sentAt).getTime() : 0;
      const stale = waitedMs > 60 * 60 * 1000;

      if (process.env.NODE_ENV !== 'production') {
        return {
          text: 'Accepted by the provider. Nothing further will appear until the provider’s webhook can reach this server — running locally it cannot, so a message stops here whether it arrived or not.',
          tone: 'text-ink-subtle',
        };
      }

      return {
        text: stale
          ? 'Accepted by the provider over an hour ago and still no delivery receipt. That usually means the provider cannot reach this server’s webhook, rather than that the message failed.'
          : 'Accepted by the provider. Waiting for a delivery receipt.',
        tone: stale ? 'text-amber-700' : 'text-ink-subtle',
      };
    }
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
  const campaignId = params.campaignId ?? '';
  const channel = CHANNELS.some((c) => c.key === params.channel) ? (params.channel ?? '') : '';

  // Switching to SMS while "Clicked" is selected would show an empty table and
  // look broken. The chip that cannot apply is dropped rather than obeyed.
  const allowed = filtersFor(channel);
  const status = allowed.some((f) => f.key === params.status) ? (params.status ?? '') : '';

  const result = await apiFetchListAllowed<MessageLogEntry>('/messages', {
    query: {
      page,
      pageSize: 25,
      status: status || undefined,
      channel: channel || undefined,
      campaignId: campaignId || undefined,
    },
  });

  if (!result) {
    return <PermissionGate permission="campaign.view" what="The message log is restricted." />;
  }

  const { data: messages, meta } = result;
  const problems = messages.filter((m) => NEEDS_ATTENTION.has(m.status)).length;

  // One link builder for both rows: picking a channel keeps the status you
  // were looking at, and picking a status keeps the channel. Dropping either
  // would send "Problems on email" back to the whole salon's log.
  const href = (next: { channel?: string; status?: string; campaignId?: string }) => {
    const query = new URLSearchParams();
    const nextChannel = next.channel ?? channel;
    const nextStatus = next.status ?? status;
    const nextCampaign = next.campaignId ?? campaignId;
    if (nextChannel) query.set('channel', nextChannel);
    // A status that does not exist on the channel being moved to is dropped
    // here too, so the link never points at an empty table.
    if (nextStatus && filtersFor(nextChannel).some((f) => f.key === nextStatus)) query.set('status', nextStatus);
    if (nextCampaign) query.set('campaignId', nextCampaign);
    const qs = query.toString();
    return qs ? `/messages?${qs}` : '/messages';
  };

  // The campaign's own name, taken from the rows rather than fetched again.
  const campaignName = campaignId ? messages.find((m) => m.campaign)?.campaign?.name : undefined;

  // "12 email messages" reads better than "12 messages" under an Email tab.
  const channelWord = CHANNELS.find((c) => c.key === channel && c.key)?.label.toLowerCase() ?? '';

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
          <Link href={href({ campaignId: '' })} className="text-ink-muted hover:underline">
            Show every message
          </Link>
        </div>
      ) : null}

      {/* Channel first: it is the bigger division, and it changes which status
          chips below even make sense. */}
      <div className="mb-3 flex w-fit flex-wrap gap-1 border-b border-stone-200">
        {CHANNELS.map((item) => (
          <Link
            key={item.key || 'all'}
            href={href({ channel: item.key })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              channel === item.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mb-5 flex w-fit flex-wrap rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm">
        {allowed.map((item) => (
          <Link
            key={item.key || 'all'}
            href={href({ status: item.key })}
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
          title={`${meta?.total ?? messages.length} ${channelWord ? `${channelWord} ` : ''}messages`}
          subtitle={
            problems > 0
              ? `${problems} on this page need a look — the reason is in the last column`
              : 'Newest first'
          }
        />

        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={channelWord ? `Nothing sent on ${channelWord} yet` : 'Nothing sent yet'}
            description="Messages appear here the moment they are queued, whether or not they reach the customer."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>To</TH>
                  {channel ? null : <TH>Channel</TH>}
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

                      {channel ? null : <TD className="text-xs text-ink-muted">{message.channel}</TD>}

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
                searchParams={{
                  status: status || undefined,
                  channel: channel || undefined,
                  campaignId: campaignId || undefined,
                }}
              />
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
