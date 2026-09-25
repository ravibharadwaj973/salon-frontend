import type { Metadata } from 'next';
import Link from 'next/link';
import { Megaphone, TrendingUp } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Card, CardHeader, EmptyState, PageHeader, StatTile, StatusBadge } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { CampaignComposer } from './campaign-composer';
import { PlanGate, PlanGateList } from '@/components/plan-gate';
import { count, date, dayjs, money, percent } from '@/lib/format';
import type { Campaign, MessageTemplate, Money, Segment, SessionUser } from '@/lib/types';
import { SendAgain } from './send-again';

export const metadata: Metadata = { title: 'Campaigns' };
export const dynamic = 'force-dynamic';

interface Roi {
  campaigns: {
    id: string;
    name: string;
    channel: string;
    segment: string | null;
    sent: number;
    delivered: number;
    read: number;
    bookings: number;
    revenue: Money;
    cost: Money;
    roiPct: number | null;
  }[];
  totals: { sent: number; delivered: number; bookings: number; revenue: Money; cost: Money; roiPct: number | null; revenuePerMessage: Money };
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ segmentId?: string }>;
}) {
  const params = await searchParams;
  const from = dayjs().subtract(90, 'day').format('YYYY-MM-DD');
  const to = dayjs().format('YYYY-MM-DD');

  // The plan is checked before the fetch, because the API answers 402 for a
  // salon without marketing and an unexplained error is a worse answer than a
  // sentence saying what this screen is.
  const session = await apiFetchSafe<SessionUser>('/auth/me', { noBranch: true });
  if (session && !(session.features ?? []).includes('marketing')) {
    return (
      <PlanGate
        title="Campaigns are not on your plan"
        what="A campaign is a one-off message to a group of customers — an offer, a reopening notice, a slow-Tuesday nudge."
        planName={session.tenant.plan?.name}
      >
        <PlanGateList
          items={[
            'Send to a segment on WhatsApp, SMS or email',
            'Ready-written campaigns you can send as they are',
            'Revenue attributed back to each send, not just opens',
          ]}
        />
      </PlanGate>
    );
  }

  const [{ data: campaigns }, roi, segments, templates, user] = await Promise.all([
    apiFetchList<Campaign>('/campaigns', { query: { pageSize: 50 } }),
    apiFetchSafe<Roi>('/campaigns/roi', { query: { from, to } }),
    apiFetchList<Segment>('/segments', { query: { pageSize: 100 } }).catch(() => null),
    apiFetchList<MessageTemplate>('/templates', { query: { pageSize: 100 } }).catch(() => null),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  const canManage = user?.permissions.includes('campaign.manage') ?? false;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="One-off sends to a segment. The number that matters is at the end: revenue, not opens."
        action={
          canManage ? (
            <CampaignComposer
              segments={segments?.data ?? []}
              templates={templates?.data ?? []}
              defaultSegmentId={params.segmentId}
            />
          ) : null
        }
      />

      {roi ? (
        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Messages sent (90d)" value={count(roi.totals.sent)} />
          <StatTile label="Bookings from them" value={count(roi.totals.bookings)} />
          <StatTile label="Revenue attributed" value={money(roi.totals.revenue)} tone="positive" />
          <StatTile
            label="Return on spend"
            value={roi.totals.roiPct !== null ? percent(roi.totals.roiPct, 0) : '—'}
            hint={`${money(roi.totals.revenuePerMessage)} per message`}
          />
        </section>
      ) : null}

      <Card>
        <CardHeader title="All campaigns" subtitle="Attribution counts any invoice from a recipient inside the window" />
        {campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Pick a segment, pick a template, send. Revenue is credited back automatically."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH>Audience</TH>
                <TH>Status</TH>
                <TH align="right">Sent</TH>
                <TH align="right">Delivered</TH>
                <TH align="right">Read</TH>
                <TH align="right">Bookings</TH>
                <TH align="right">Revenue</TH>
                <TH align="right">ROI</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {campaigns.map((campaign) => {
                const roiRow = roi?.campaigns.find((row) => row.id === campaign.id);
                return (
                  <TR key={campaign.id}>
                    <TD>
                      <Link href={`/campaigns/${campaign.id}`} className="font-medium text-ink hover:text-brand-700">
                        {campaign.name}
                      </Link>
                      <p className="text-2xs text-ink-subtle">
                        {campaign.channel.toLowerCase()}
                        {campaign.startedAt ? ` · ${date(campaign.startedAt, 'DD MMM')}` : ''}
                      </p>
                    </TD>
                    <TD className="text-xs text-ink-muted">{campaign.segment?.name ?? '—'}</TD>
                    <TD>
                      <StatusBadge status={campaign.status} />
                    </TD>
                    <TD align="right">{count(campaign.sentCount)}</TD>
                    <TD align="right" className="text-ink-muted">
                      {count(campaign.deliveredCount)}
                    </TD>
                    <TD align="right" className="text-ink-muted">
                      {count(campaign.readCount)}
                    </TD>
                    <TD align="right" className="font-medium">
                      {count(campaign.bookingCount)}
                    </TD>
                    <TD align="right" className="font-medium text-emerald-700">
                      {money(campaign.revenue)}
                    </TD>
                    <TD align="right" className="text-ink-muted">
                      {roiRow?.roiPct !== null && roiRow?.roiPct !== undefined ? percent(roiRow.roiPct, 0) : '—'}
                    </TD>
                    {/* Only on one that is finished. A campaign still going
                        does not need a second copy of itself. */}
                    <TD align="right">
                      {campaign.status === 'COMPLETED' ? (
                        <SendAgain
                          campaignId={campaign.id}
                          name={campaign.name}
                          channel={campaign.channel as 'WHATSAPP' | 'SMS' | 'EMAIL'}
                          segmentId={campaign.segment?.id ?? null}
                          segmentName={campaign.segment?.name ?? 'the segment'}
                          segmentSize={campaign.segment?.lastCount ?? 0}
                          templateName={campaign.template?.name ?? '—'}
                          templateCategory={campaign.template?.category ?? 'MARKETING'}
                          costPerMessage={Number(campaign.costPerMessage ?? 0)}
                          attributionWindowDays={campaign.attributionWindowDays ?? 14}
                        />
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-ink-subtle">
        <TrendingUp className="h-3.5 w-3.5 shrink-0" />
        Marketing messages only reach customers who opted in — the rest are skipped and logged, never silently sent.
      </p>
    </>
  );
}
