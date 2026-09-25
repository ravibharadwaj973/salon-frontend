import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Hourglass, Mail, MessageSquare, Phone, TriangleAlert } from 'lucide-react';
import { PermissionGate } from '@/components/permission-gate';
import { ApiError, apiFetch, apiFetchAllowed, apiFetchList } from '@/lib/api';
import { Badge, Card, CardBody, CardHeader, EmptyState, StatTile, StatusBadge } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { CampaignFunnel, type FunnelStage } from '../../campaigns/[id]/funnel';
import { ActivityChart, type ActivityPoint } from './activity-chart';
import { JourneyToggle } from '../journey-toggle';
import { ACTION_LABEL, triggerLabel } from '../labels';
import { count, dateTime, fromNow, money, percent } from '@/lib/format';
import type { Money, SessionUser } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Capability {
  delivery: boolean;
  read: boolean;
  click: boolean;
  bounce: boolean;
  complaint: boolean;
  note: string;
}

interface Performance {
  journey: {
    id: string;
    name: string;
    trigger: string;
    isActive: boolean;
    steps: { id: string; channel: string | null; templateName: string | null; actionType: string }[];
  };
  period: { from: string; to: string };
  runs: Record<string, number> & { entered: number };
  funnel: {
    entered: number;
    attempted: number;
    sent: number;
    delivered: number;
    read: number;
    clicked: number;
    replied: number;
    failed: number;
    skipped: number;
    awaitingReceipt: number;
    cost: Money;
    deliveryRatePct: number | null;
    readRatePct: number | null;
  };
  channels: { channel: string; count: number; capability: Capability | null }[];
  activity: ActivityPoint[];
  readMeasurable: boolean;
}

interface MessageRow {
  id: string;
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'IN_APP';
  status: string;
  toAddress: string;
  customerName: string;
  addressKind: 'email' | 'phone';
  errorMessage: string | null;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  customer: { id: string; firstName: string; lastName: string | null } | null;
  template: { name: string } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const journey = await apiFetch<{ name: string }>(`/journeys/${(await params).id}`);
    return { title: journey.name };
  } catch {
    return { title: 'Automation' };
  }
}

export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let performance: Performance | null;
  try {
    performance = await apiFetchAllowed<Performance>(`/journeys/${id}/performance`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (!performance) {
    return (
      <PermissionGate
        permission="campaign.view"
        what="Automation results are restricted."
        backHref="/journeys"
        backLabel="All automations"
      />
    );
  }

  const [messages, user] = await Promise.all([
    apiFetchList<MessageRow>(`/journeys/${id}/messages`, { query: { pageSize: 50 } }).catch(() => null),
    apiFetch<SessionUser>('/auth/me', { noBranch: true }).catch(() => null),
  ]);

  const { journey, funnel, activity, channels, readMeasurable } = performance;
  const canManage = user?.permissions.includes('journey.manage') ?? false;

  const daysCovered = activity.length;
  const lastFired = [...activity].reverse().find((point) => point.runs > 0);
  const quietDays = lastFired ? activity.length - 1 - activity.findIndex((p) => p.date === lastFired.date) : null;

  /**
   * The read stage is dropped rather than zeroed where no channel this journey
   * used can report it. An SMS automation showing "Read 0" says nobody looked
   * at it; what is true is that nobody can ever know.
   */
  const stages: FunnelStage[] = [
    { key: 'attempted', label: 'Messages due', value: funnel.attempted, sequential: true },
    {
      key: 'sent',
      label: 'Sent',
      value: funnel.sent,
      sequential: true,
      note: funnel.skipped > 0 ? `${count(funnel.skipped)} skipped — no consent or no address` : undefined,
    },
    {
      key: 'delivered',
      label: 'Delivered',
      value: funnel.delivered,
      sequential: true,
      unreported: funnel.awaitingReceipt,
    },
    ...(readMeasurable
      ? [
          {
            key: 'read',
            label: 'Read',
            value: funnel.read,
            sequential: true,
            unreported: funnel.awaitingReceipt,
          } as FunnelStage,
        ]
      : []),
    { key: 'clicked', label: 'Clicked a link', value: funnel.clicked },
    { key: 'replied', label: 'Replied', value: funnel.replied },
  ];

  return (
    <>
      <Link href="/journeys" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        All automations
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{journey.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <Badge tone={journey.isActive ? 'success' : 'neutral'}>{journey.isActive ? 'Running' : 'Paused'}</Badge>
            <span>{triggerLabel(journey.trigger)}</span>
            <span className="text-ink-subtle">
              · {performance.period.from} to {performance.period.to}
            </span>
          </div>
        </div>
        {canManage ? <JourneyToggle journeyId={journey.id} isActive={journey.isActive} /> : null}
      </header>

      {/* THE FAILURE THAT MAKES NO NOISE.
          An automation that has stopped firing looks identical to one nobody
          has triggered yet, and identical to a healthy one in every total.
          It is called out first, because everything below it will look fine. */}
      {journey.isActive && funnel.entered === 0 ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0" />
          <span>
            This automation is switched on and has not run once in {count(daysCovered)} days. Nothing is wrong with the
            messages — none were due. Either nobody has met the trigger ({triggerLabel(journey.trigger).toLowerCase()}),
            or its audience rules are matching nobody.
          </span>
        </p>
      ) : null}

      <section className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Customers entered"
          value={count(funnel.entered)}
          hint={lastFired ? `last ${quietDays === 0 ? 'today' : `${count(quietDays ?? 0)}d ago`}` : 'never fired'}
        />
        <StatTile label="Messages sent" value={count(funnel.sent)} />
        <StatTile
          label="Delivered"
          value={count(funnel.delivered)}
          hint={funnel.deliveryRatePct !== null ? percent(funnel.deliveryRatePct, 0) : 'not reported'}
        />
        <StatTile
          label="Failed"
          value={count(funnel.failed)}
          tone={funnel.failed > 0 ? 'negative' : 'neutral'}
          hint={`${money(funnel.cost)} spent`}
        />
      </section>

      {/* The rate, not the total. See activity-chart.tsx for why this is the
          chart an automation needs and a campaign does not. */}
      <Card className="mb-3">
        <CardHeader
          title="How often it fires"
          subtitle="Customers entering this automation each day. A run of zeros is the thing to look for — it means the automation went quiet, which no total will ever show."
        />
        <CardBody>
          <ActivityChart data={activity} />
        </CardBody>
      </Card>

      <Card className="mb-3">
        <CardHeader
          title="What happened to the messages"
          subtitle="Each stage as a share of the one before it. Counted over messages, not over customers — one customer can be sent several."
        />
        <CardBody>
          <CampaignFunnel stages={stages} />
        </CardBody>
      </Card>

      {funnel.awaitingReceipt > 0 ? (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-ink-muted">
          <Hourglass className="mt-px h-3.5 w-3.5 shrink-0" />
          {count(funnel.awaitingReceipt)} of these were accepted by the provider and never reported on. They are drawn
          hatched above rather than as failures — the app does not know whether they arrived either way.
        </p>
      ) : null}

      {/* What each channel can and cannot tell you. Without this a blank read
          figure reads as a bug in the app rather than a limit of SMS. */}
      {channels.length > 0 ? (
        <Card className="mb-3">
          <CardHeader title="What can be measured here" />
          <CardBody className="space-y-2">
            {channels.map((entry) => (
              <p key={entry.channel} className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
                <Badge>{entry.channel.toLowerCase()}</Badge>
                <span>
                  <span className="tnum text-ink">{count(entry.count)}</span> messages.{' '}
                  {entry.capability?.note ?? 'No delivery reporting on this channel.'}
                </span>
              </p>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card className="mb-3">
        <CardHeader title="What it does" subtitle={triggerLabel(journey.trigger)} />
        <CardBody>
          <ol className="space-y-1.5">
            {journey.steps.map((step, index) => (
              <li key={step.id} className="flex items-center gap-2.5 rounded-lg bg-stone-50 px-3 py-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xs font-semibold text-brand-700">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-xs text-ink">
                  {ACTION_LABEL[step.actionType] ?? step.actionType}
                  {step.templateName ? <span className="text-ink-muted"> · {step.templateName}</span> : null}
                </span>
                {step.channel ? <Badge>{step.channel.toLowerCase()}</Badge> : null}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <RecipientTable journeyId={journey.id} rows={messages?.data ?? null} />
    </>
  );
}

/**
 * WHO IT WROTE TO, AND AT WHICH ADDRESS.
 *
 * The address is shown as it was actually used — the email address for an
 * email, the number for WhatsApp and SMS — because that is the field somebody
 * checks when a message did not arrive. It is deliberately the address on the
 * message rather than the one on the customer record today: a number corrected
 * last week does not change the fact that Monday's reminder went to the old one,
 * and a record that has since been fixed would otherwise hide the very thing
 * being investigated.
 *
 * The column HEADER follows the data rather than being fixed. A journey that
 * only ever emails says "Email"; one that only messages says "Number"; one
 * that does both says "Sent to", because neither word would be true of every
 * row and a wrong header is worse than a vague one.
 */
function RecipientTable({ journeyId, rows }: { journeyId: string; rows: MessageRow[] | null }) {
  const kinds = new Set((rows ?? []).map((row) => row.addressKind));
  const addressHeader = kinds.size === 1 ? (kinds.has('email') ? 'Email' : 'Number') : 'Sent to';

  return (
    <Card>
      <CardHeader
        title="Who it wrote to"
        subtitle="The most recent 50. Skipped rows are customers without consent or without an address on this channel."
        action={
          <Link href={`/messages?journeyId=${journeyId}`} className="text-xs font-medium text-brand-700 hover:underline">
            Open in the message log
          </Link>
        }
      />
      {!rows || rows.length === 0 ? (
        <EmptyState
          title="Nothing sent yet"
          description="Messages appear here as the automation runs — the trigger has to fire first."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Customer</TH>
              <TH>{addressHeader}</TH>
              <TH>Status</TH>
              <TH>Sent</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  {row.customer ? (
                    <Link href={`/customers/${row.customer.id}`} className="text-ink hover:text-brand-700">
                      {row.customerName}
                    </Link>
                  ) : (
                    <span className="text-ink-subtle">{row.customerName}</span>
                  )}
                  {row.template ? <p className="text-2xs text-ink-subtle">{row.template.name}</p> : null}
                </TD>
                {/* The icon says which kind of address this is without a second
                    column, so a mixed-channel automation stays readable. */}
                <TD className="tnum text-xs text-ink-muted">
                  <span className="flex items-center gap-1.5">
                    {row.addressKind === 'email' ? (
                      <Mail className="h-3 w-3 shrink-0 text-ink-subtle" aria-label="Email" />
                    ) : row.channel === 'SMS' ? (
                      <MessageSquare className="h-3 w-3 shrink-0 text-ink-subtle" aria-label="SMS" />
                    ) : (
                      <Phone className="h-3 w-3 shrink-0 text-ink-subtle" aria-label="WhatsApp" />
                    )}
                    {row.toAddress}
                  </span>
                </TD>
                <TD>
                  <StatusBadge
                    status={row.status}
                    label={row.status === 'READ' ? (row.channel === 'EMAIL' ? 'opened' : 'read') : undefined}
                  />
                  {row.errorMessage ? (
                    <p className="mt-0.5 max-w-xs truncate text-2xs text-ink-subtle">{row.errorMessage}</p>
                  ) : null}
                </TD>
                <TD className="text-xs text-ink-muted">
                  {row.sentAt ? (
                    <span title={dateTime(row.sentAt)}>{fromNow(row.sentAt)}</span>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
