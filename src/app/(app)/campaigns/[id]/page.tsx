import { PermissionGate } from '@/components/permission-gate';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApiError, apiFetch, apiFetchAllowed, apiFetchList } from '@/lib/api';
import { Badge, Card, CardBody, CardHeader, EmptyState, StatTile, StatusBadge } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { count, dateTime, fullName, money, percent } from '@/lib/format';
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
          label="Bookings"
          value={count(campaign.bookingCount)}
          hint={performance ? `${percent(performance.conversionRatePct, 1)} conversion` : undefined}
        />
        <StatTile label="Revenue" value={money(campaign.revenue)} tone="positive" />
        <StatTile label="Cost" value={money(campaign.cost)} />
        <StatTile
          label="ROI"
          value={performance?.roi !== null && performance?.roi !== undefined ? percent(performance.roi, 0) : '—'}
          tone={(performance?.roi ?? 0) > 0 ? 'positive' : 'neutral'}
        />
      </section>

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
