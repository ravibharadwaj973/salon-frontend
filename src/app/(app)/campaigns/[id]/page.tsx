import { PermissionGate } from '@/components/permission-gate';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Hourglass } from 'lucide-react';
import { FollowUpPanel } from '../follow-up';
import { ApiError, apiFetch, apiFetchAllowed, apiFetchList } from '@/lib/api';
import { Badge, Card, CardBody, CardHeader, EmptyState, StatTile, StatusBadge } from '@/components/ui/display';
import { CampaignFunnel, type FunnelStage } from './funnel';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { count, dateTime, fromNow, fullName, money, percent } from '@/lib/format';
import type { Campaign, Customer, Money } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface MessageRow {
  id: string;
  status: string;
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL';
  toAddress: string;
  errorMessage: string | null;
  queuedAt: string;
  sentAt: string | null;
  attributedRevenue: Money;
  customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'phone'> | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const campaign = await apiFetch<Campaign>(`/campaigns/${(await params).id}`);
    return { title: campaign.name };
  } catch {
    return { title: 'Campaign' };
  }
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let campaign: Campaign | null;
  try {
    campaign = await apiFetchAllowed<Campaign>(`/campaigns/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (!campaign) {
    return (
      <PermissionGate
        permission="campaign.view"
        what="Campaigns are restricted."
        backHref="/campaigns"
        backLabel="All campaigns"
      />
    );
  }

  const messages = await apiFetchList<MessageRow>(`/campaigns/${id}/messages`, { query: { pageSize: 50 } }).catch(
    () => null,
  );

  const performance = campaign.performance;

  return (
    <>
      <Link href="/campaigns" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        All campaigns
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{campaign.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <StatusBadge status={campaign.status} />
            <Badge>{campaign.channel.toLowerCase()}</Badge>
            {campaign.segment ? <span>Audience: {campaign.segment.name}</span> : null}
            {campaign.template ? <span>Template: {campaign.template.name}</span> : null}
          </div>
        </div>
      </header>

      {/* Where the campaign leaks. Stages that cannot be measured on this
          channel are left out rather than shown as a misleading zero. */}
      <Card className="mb-3">
        <CardHeader
          title="What happened to the messages"
          subtitle="Each stage as a share of the one before it — that is where the drop-off actually is."
        />
        <CardBody>
          <CampaignFunnel
            stages={
              [
                { key: 'targeted', label: 'Targeted', value: campaign.targetCount, sequential: true },
                { key: 'sent', label: 'Sent', value: campaign.sentCount, sequential: true },
                {
                  key: 'delivered',
                  label: 'Delivered',
                  value: campaign.deliveredCount,
                  sequential: true,
                  // Messages the provider accepted and never reported back on.
                  // Without this the stage claims they failed.
                  unreported: campaign.receipts?.awaiting ?? 0,
                },
                campaign.channel === 'SMS'
                  ? null
                  : {
                      key: 'read',
                      label: campaign.channel === 'EMAIL' ? 'Opened' : 'Read',
                      value: campaign.readCount,
                      sequential: true,
                      unreported: campaign.receipts?.awaiting ?? 0,
                      note:
                        campaign.channel === 'EMAIL'
                          ? 'an open is not a guaranteed read'
                          : undefined,
                    },
                { key: 'clicked', label: 'Clicked a link', value: campaign.clickedCount },
                campaign.channel === 'EMAIL'
                  ? null
                  : { key: 'replied', label: 'Replied', value: campaign.repliedCount },
                // The stage the funnel was missing. Between "it arrived" and
                // "they came" is "they looked", and without it a campaign
                // nobody opened looks the same as one everybody opened and
                // ignored.
                {
                  key: 'engaged',
                  label: 'Engaged',
                  value: campaign.engagedCount ?? 0,
                  note: 'read, clicked or replied',
                },
                // The stage between the tap and the booking. Left out
                // entirely where the salon has no website reporting, rather
                // than shown as a zero — see the note on `site.measured`.
                campaign.site?.measured
                  ? {
                      key: 'site',
                      label: 'Opened the website',
                      value: campaign.site.visitors,
                      note: 'at least — only visitors who arrived from this message are counted',
                    }
                  : null,
                {
                  key: 'bookings',
                  label: 'Booked',
                  value: campaign.bookingCount,
                  note: 'made an appointment inside the window',
                },
                {
                  key: 'visits',
                  label: 'Came in',
                  value: campaign.visitCount ?? 0,
                  note: 'actually turned up and was billed',
                },
              ].filter(Boolean) as FunnelStage[]
            }
          />
        </CardBody>
      </Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sent" value={count(campaign.sentCount)} hint={`of ${count(campaign.targetCount)} targeted`} />
        <StatTile
          label="Delivered"
          value={count(campaign.deliveredCount)}
          hint={performance ? percent(performance.deliveryRatePct, 0) : undefined}
        />
        <StatTile
          label="Read"
          value={count(campaign.readCount)}
          hint={performance ? percent(performance.readRatePct, 0) : undefined}
        />
        <StatTile label="Failed" value={count(campaign.failedCount)} tone={campaign.failedCount > 0 ? 'negative' : 'neutral'} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Booked"
          value={count(campaign.bookingCount)}
          hint={performance ? `${percent(performance.bookingRatePct, 1)} of delivered` : undefined}
        />
        <StatTile
          label="Came in"
          value={count(campaign.visitCount ?? 0)}
          hint={performance ? `${percent(performance.visitRatePct, 1)} of delivered` : undefined}
        />
        <StatTile label="Revenue" value={money(campaign.revenue)} tone="positive" />
        <StatTile
          label="Cost per visit"
          value={performance?.costPerVisit ? money(performance.costPerVisit) : '—'}
          hint={`${money(campaign.cost)} spent`}
        />
      </section>

      {/* The window, stated. A number attributed to a campaign is meaningless
          without the period it was attributed over, and the period is the
          owner's own choice rather than a constant. */}
      <p className="mt-3 text-2xs leading-relaxed text-ink-subtle">
        Bookings and visits are counted for{' '}
        <strong className="font-medium text-ink-muted">{campaign.attributionWindowDays} days</strong> after each
        customer received this — measured from their own delivery, so somebody reached on the last day of the send
        gets the same window as the first.
        {campaign.windowRationale ? ` ${campaign.windowRationale}` : ''}
      </p>

      {campaign.attributionPending ? (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-ink-muted">
          <Hourglass className="mt-px h-3.5 w-3.5 shrink-0" />
          The attribution window is still open, so bookings and visits are not final yet. They are counted once it
          closes — a zero here means &ldquo;not counted yet&rdquo;, not &ldquo;nobody came&rdquo;.
        </p>
      ) : null}

      {/* THE DIAGNOSIS.
          A screenful of zeros is a symptom. This says which of the two causes
          it is, because the salon's next action is completely different for
          each: correct the customers' numbers, or fix the webhook. */}
      {(campaign.receipts?.awaiting ?? 0) > 0 ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <Hourglass className="mt-px h-4 w-4 shrink-0" />
          <span>
            WhatsApp accepted {count(campaign.receipts!.awaiting)} of these and has not sent a delivery receipt back, so
            the app does not know whether they arrived.{' '}
            {campaign.receipts?.looksUnwired ? (
              <>
                <strong className="font-semibold">
                  No receipt has ever arrived for any message from this salon
                </strong>
                , which points at the status webhook rather than at your customers&rsquo; numbers — check that the
                webhook URL and verify token in Meta match the ones under Settings → Messaging.
              </>
            ) : campaign.receipts?.lastAnywhereAt ? (
              <>Receipts are arriving for other messages — the most recent was {fromNow(campaign.receipts.lastAnywhereAt)} — so this is more likely a delay than a fault.</>
            ) : null}
          </span>
        </p>
      ) : null}

      {/* Who did what, and a way to message part of them again. Sits above the
          template, because after a send the question is what to do next rather
          than what was said. */}
      <div className="mt-5">
        <FollowUpPanel campaign={campaign} />
      </div>

      {campaign.template ? (
        <Card className="mt-5">
          <CardHeader title="What was sent" />
          <CardBody>
            <p className="whitespace-pre-wrap rounded-lg bg-stone-50 p-4 text-sm leading-relaxed text-ink">
              {(campaign.template as { bodyText?: string }).bodyText ?? 'Template body not available.'}
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-5">
        <CardHeader
          title="Recipients"
          subtitle="Skipped rows are customers without marketing consent"
          action={
            <Link
              href={`/messages?campaignId=${campaign.id}`}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              Open in the message log
            </Link>
          }
        />
        {!messages || messages.data.length === 0 ? (
          <EmptyState title="No messages logged yet" description="They appear as the worker sends them." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH>To</TH>
                <TH>Status</TH>
                <TH>Sent</TH>
                <TH align="right">Revenue credited</TH>
              </TR>
            </THead>
            <TBody>
              {messages.data.map((message) => (
                <TR key={message.id}>
                  <TD>
                    {message.customer ? (
                      <Link href={`/customers/${message.customer.id}`} className="text-ink hover:text-brand-700">
                        {fullName(message.customer)}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </TD>
                  <TD className="tnum text-xs text-ink-muted">{message.toAddress}</TD>
                  <TD>
                    {/* StatusBadge owns the colour for every delivery state, so a
                        new one (a bounce, a complaint) cannot end up blue here
                        and red on the messages page. */}
                    <StatusBadge
                      status={message.status}
                      label={
                        message.status === 'READ'
                          ? message.channel === 'EMAIL'
                            ? 'opened'
                            : 'read'
                          : undefined
                      }
                    />
                    {message.errorMessage ? (
                      <p className="mt-0.5 max-w-xs truncate text-2xs text-ink-subtle">{message.errorMessage}</p>
                    ) : null}
                  </TD>
                  <TD className="text-xs text-ink-muted">{message.sentAt ? dateTime(message.sentAt) : '—'}</TD>
                  <TD align="right" className={Number(message.attributedRevenue) > 0 ? 'font-medium text-emerald-700' : 'text-ink-subtle'}>
                    {Number(message.attributedRevenue) > 0 ? money(message.attributedRevenue) : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
