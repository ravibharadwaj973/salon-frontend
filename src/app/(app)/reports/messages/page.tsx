import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Info, MessageSquare, PiggyBank } from 'lucide-react';
import { apiFetchSafe } from '@/lib/api';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, StatTile } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { count, date, dayjs, money, percent } from '@/lib/format';
import type { Money } from '@/lib/types';
import { Funnel, OutcomeTrend, RateBar, type TrendPoint } from './message-charts';

export const metadata: Metadata = { title: 'Message performance' };
export const dynamic = 'force-dynamic';

/**
 * DID THE MESSAGES ARRIVE, AND DID ANYBODY READ THEM?
 *
 * A salon pays per message and, until this page, had no way to tell a campaign
 * that worked from one that was never delivered. Both look identical from the
 * inside: the screen said "sent 400", the bill said 400, and Saturday was quiet
 * either way.
 *
 * The page is built around one rule. A figure that cannot be measured is shown
 * as "not reported", never as zero — SMS operators do not report opens, and a
 * 0% sitting next to WhatsApp's 71% would read as catastrophe and move the
 * salon's money away from the channel that works.
 */

interface Capability {
  delivery: boolean;
  read: boolean;
  click: boolean;
  bounce: boolean;
  complaint: boolean;
  note: string | null;
}

interface FunnelData {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  replied: number;
  bounced: number;
  complained: number;
  failed: number;
  skipped: number;
  queued: number;
  suppressed: number;
  deliveryRate: number | null;
  readRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  bounceRate: number | null;
  cost: Money;
  revenue: Money;
}

interface Overview {
  period: { from: string; to: string };
  overall: FunnelData;
  combinedCapability: Capability;
  channels: (FunnelData & { channel: 'WHATSAPP' | 'SMS' | 'EMAIL'; capability: Capability })[];
  purposes: (FunnelData & { purpose: string; label: string })[];
}

type TemplateRow = FunnelData & { id: string; name: string; channel: string; category: string };

const CHANNEL_LABEL: Record<string, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'Email' };

const PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 12 months', days: 365 },
];

export default async function MessageReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; channel?: string; purpose?: string }>;
}) {
  const params = await searchParams;
  const from = params.from ?? dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const to = params.to ?? dayjs().format('YYYY-MM-DD');
  const channel = params.channel && params.channel !== 'all' ? params.channel : undefined;
  const purpose = params.purpose && params.purpose !== 'all' ? params.purpose : undefined;

  const query = { from, to, ...(channel ? { channel } : {}), ...(purpose ? { purpose } : {}) };

  // Day buckets get unreadable past a couple of months, so the interval
  // follows the range rather than making the owner choose one.
  const span = dayjs(to).diff(dayjs(from), 'day');
  const interval = span > 180 ? 'month' : span > 60 ? 'week' : 'day';

  const [overview, trend, templates] = await Promise.all([
    apiFetchSafe<Overview>('/analytics/messaging', { query }),
    apiFetchSafe<TrendPoint[]>('/analytics/messaging/trend', { query: { ...query, interval } }),
    apiFetchSafe<TemplateRow[]>('/analytics/messaging/templates', { query: { ...query, minSent: 20 } }),
  ]);

  if (!overview) {
    return (
      <>
        <PageHeader title="Message performance" />
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="No figures available"
            description="Check that the API is running and that you have sent messages in this period."
          />
        </Card>
      </>
    );
  }

  const { overall, combinedCapability } = overview;
  const spend = Number(overall.cost);
  const earned = Number(overall.revenue);

  return (
    <>
      <PageHeader
        title="Message performance"
        description={`${date(from)} – ${date(to)}`}
        action={
          <Link href="/reports" className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" />
            All reports
          </Link>
        }
      />

      {/* Filters in one row above the charts; a plain form, so every view is a
          shareable URL and a bookmark. */}
      <form className="mb-5 flex flex-wrap items-center gap-2" action="/reports/messages">
        <input type="date" name="from" defaultValue={from} className="h-9 rounded-lg border border-stone-300 px-3 text-sm shadow-sm" />
        <span className="text-xs text-ink-subtle">to</span>
        <input type="date" name="to" defaultValue={to} className="h-9 rounded-lg border border-stone-300 px-3 text-sm shadow-sm" />

        <select name="channel" defaultValue={channel ?? 'all'} className="h-9 rounded-lg border border-stone-300 bg-white px-2.5 text-sm shadow-sm">
          <option value="all">Every channel</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="EMAIL">Email</option>
          <option value="SMS">SMS</option>
        </select>

        <select name="purpose" defaultValue={purpose ?? 'all'} className="h-9 rounded-lg border border-stone-300 bg-white px-2.5 text-sm shadow-sm">
          <option value="all">Everything we send</option>
          <option value="CAMPAIGN">Campaigns</option>
          <option value="FOLLOW_UP">Follow-ups &amp; win-backs</option>
          <option value="REVIEW">Review requests</option>
          <option value="FEEDBACK">Feedback requests</option>
          <option value="REMINDER">Appointment reminders</option>
          <option value="BILLING">Invoices &amp; payment</option>
          <option value="LOYALTY">Loyalty</option>
          <option value="OTHER">Other</option>
        </select>

        <button type="submit" className="h-9 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
          Update
        </button>

        <div className="ml-auto flex gap-1.5">
          {PRESETS.map((preset) => (
            <a
              key={preset.label}
              href={`/reports/messages?from=${dayjs().subtract(preset.days, 'day').format('YYYY-MM-DD')}&to=${dayjs().format('YYYY-MM-DD')}${channel ? `&channel=${channel}` : ''}${purpose ? `&purpose=${purpose}` : ''}`}
              className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              {preset.label}
            </a>
          ))}
        </div>
      </form>

      {overall.total === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="Nothing was sent in this period"
            description="Widen the dates, or clear the channel and purpose filters."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Messages sent" value={count(overall.sent)} hint={`${count(overall.total)} attempted`} />
            <StatTile
              label="Delivered"
              value={percent(overall.deliveryRate)}
              hint={`${count(overall.delivered)} arrived`}
              tone={overall.deliveryRate !== null && overall.deliveryRate < 85 ? 'negative' : 'neutral'}
            />
            <StatTile
              label="Opened"
              value={combinedCapability.read ? percent(overall.readRate) : 'Mixed'}
              hint={combinedCapability.read ? `${count(overall.read)} opened` : 'Not comparable across channels'}
            />
            <StatTile
              label="Spent"
              value={money(overall.cost)}
              hint={earned > 0 ? `${money(overall.revenue)} attributed back` : 'No bookings attributed yet'}
              tone={earned > spend && spend > 0 ? 'positive' : 'neutral'}
            />
          </div>

          {combinedCapability.note ? (
            <p className="flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              {combinedCapability.note}
            </p>
          ) : null}

          {/* Money not spent is worth the same as money earned, and this is the
              only place the salon can see it. */}
          {overall.suppressed > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50/60 p-3 text-xs leading-relaxed text-brand-800">
              <PiggyBank className="mt-px h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold">{count(overall.suppressed)}</strong> messages were not sent, and not
                charged for, because those numbers or addresses had already come back undeliverable. Correcting them on
                the customer&rsquo;s profile puts them back in.
              </span>
            </p>
          ) : null}

          <Card>
            <CardHeader
              title="What happened, week by week"
              subtitle="Every message stacked by how it ended. The height of a bar is what you sent; the blue part is what arrived."
            />
            <CardBody>
              <OutcomeTrend data={trend ?? []} />
            </CardBody>
          </Card>

          {/* Each channel on its own, because they do not measure the same
              things and a combined open rate would be arithmetic on two
              different questions. */}
          <div className="grid gap-4 lg:grid-cols-3">
            {overview.channels
              .filter((c) => c.total > 0)
              .map((c) => (
                <Card key={c.channel}>
                  <CardHeader
                    title={CHANNEL_LABEL[c.channel] ?? c.channel}
                    subtitle={`${count(c.total)} messages · ${money(c.cost)}`}
                  />
                  <CardBody className="space-y-3">
                    <Funnel
                      stages={[
                        { label: 'Sent', value: c.sent, rate: null },
                        { label: 'Delivered', value: c.delivered, rate: c.deliveryRate },
                        {
                          label: 'Opened',
                          value: c.capability.read ? c.read : null,
                          rate: c.readRate,
                          unmeasured: c.capability.read ? undefined : 'No operator reports whether an SMS was read.',
                        },
                        {
                          label: 'Clicked',
                          value: c.capability.click ? c.clicked : null,
                          rate: c.clickRate,
                          unmeasured: c.capability.click ? undefined : 'Links in an SMS are not tracked.',
                        },
                      ]}
                    />

                    {c.bounced > 0 || c.failed > 0 || c.skipped > 0 ? (
                      <dl className="grid grid-cols-3 gap-2 border-t border-stone-100 pt-3 text-2xs">
                        {[
                          ['Bounced', c.bounced],
                          ['Failed', c.failed],
                          ['Not sent', c.skipped],
                        ].map(([label, value]) => (
                          <div key={String(label)}>
                            <dt className="text-ink-subtle">{label}</dt>
                            <dd className="tnum mt-0.5 font-medium text-ink">{count(Number(value))}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}

                    {c.capability.note ? (
                      <p className="text-2xs leading-relaxed text-ink-subtle">{c.capability.note}</p>
                    ) : null}
                  </CardBody>
                </Card>
              ))}
          </div>

          {/* Eight purposes is past the point where colour helps, so this is a
              table with a rate track per row rather than an eight-hue chart. */}
          <Card>
            <CardHeader
              title="By what the message was for"
              subtitle="Category says whether Meta charges you for it. This says whether it worked."
            />
            <Table>
              <THead>
                <TR>
                  <TH>Purpose</TH>
                  <TH align="right">Sent</TH>
                  <TH>Delivered</TH>
                  <TH>Opened</TH>
                  <TH align="right">Did not arrive</TH>
                  <TH align="right">Cost</TH>
                  <TH align="right">Attributed</TH>
                </TR>
              </THead>
              <TBody>
                {overview.purposes.map((p) => (
                  <TR key={p.purpose}>
                    <TD>
                      <Link
                        href={`/reports/messages?from=${from}&to=${to}&purpose=${p.purpose}${channel ? `&channel=${channel}` : ''}`}
                        className="font-medium text-ink hover:text-brand-700"
                      >
                        {p.label}
                      </Link>
                    </TD>
                    <TD align="right" className="tnum">{count(p.sent)}</TD>
                    <TD><RateBar value={p.deliveryRate} /></TD>
                    <TD><RateBar value={p.readRate} /></TD>
                    <TD align="right" className="tnum">{count(p.bounced + p.failed)}</TD>
                    <TD align="right" className="tnum">{money(p.cost)}</TD>
                    <TD align="right" className="tnum">{Number(p.revenue) > 0 ? money(p.revenue) : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          {templates && templates.length > 0 ? (
            <Card>
              <CardHeader
                title="Templates, best read first"
                subtitle="Only templates sent at least 20 times in this period — a 100% open rate on three messages is noise, and rewriting the wrong template costs more than leaving it alone."
              />
              <Table>
                <THead>
                  <TR>
                    <TH>Template</TH>
                    <TH>Channel</TH>
                    <TH align="right">Sent</TH>
                    <TH>Delivered</TH>
                    <TH>Opened</TH>
                  </TR>
                </THead>
                <TBody>
                  {templates.slice(0, 15).map((t) => (
                    <TR key={t.id}>
                      <TD className="font-medium text-ink">{t.name}</TD>
                      <TD className="text-ink-muted">{CHANNEL_LABEL[t.channel] ?? t.channel}</TD>
                      <TD align="right" className="tnum">{count(t.sent)}</TD>
                      <TD><RateBar value={t.deliveryRate} /></TD>
                      <TD><RateBar value={t.readRate} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
