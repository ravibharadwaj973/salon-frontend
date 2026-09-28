import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDown, Workflow } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Badge, Card, EmptyState, PageHeader, StatTile } from '@/components/ui/display';
import { JourneyToggle } from './journey-toggle';
import { ACTION_LABEL, triggerLabel } from './labels';
import { count, duration } from '@/lib/format';
import type { Journey, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Journeys' };
export const dynamic = 'force-dynamic';


const CHANNELS = [
  { key: '', label: 'All' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'EMAIL', label: 'Email' },
  { key: 'SMS', label: 'SMS' },
] as const;

/**
 * An automation is not ON a channel — each of its STEPS is.
 *
 * So the filter asks whether any step sends on that channel, and a journey
 * that texts and then emails appears under both. The counts on the chips
 * therefore do not add up to the total, which is correct: "how many of my
 * automations touch email" is the question being asked, not "how do they
 * divide up".
 */
function usesChannel(journey: Journey, channel: string): boolean {
  return journey.steps.some((step) => step.channel === channel);
}

export default async function JourneysPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const params = await searchParams;
  const channel = CHANNELS.some((c) => c.key && c.key === params.channel) ? params.channel! : '';

  const [{ data: journeys }, user] = await Promise.all([
    apiFetchList<Journey>('/journeys', { query: { pageSize: 50 } }),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  const shown = channel ? journeys.filter((journey) => usesChannel(journey, channel)) : journeys;

  const canManage = user?.permissions.includes('journey.manage') ?? false;
  const active = journeys.filter((journey) => journey.isActive).length;
  const totalRuns = journeys.reduce((sum, journey) => sum + (journey._count?.runs ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Journeys"
        description="The retention engine. These run on their own — the point is that nobody has to remember to send anything."
      />

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Journeys" value={String(journeys.length)} />
        <StatTile label="Running" value={String(active)} tone={active > 0 ? 'positive' : 'neutral'} />
        <StatTile label="Customers enrolled" value={count(totalRuns)} hint="all time" />
        <StatTile label="Paused" value={String(journeys.length - active)} />
      </section>

      {/**
        * The same channel filter as Templates, and a link for the same reasons:
        * the URL carries it, so a filtered view is shareable and survives a
        * reload with no state to restore.
        */}
      {journeys.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by channel">
          {CHANNELS.map((option) => {
            const total = option.key
              ? journeys.filter((journey) => usesChannel(journey, option.key)).length
              : journeys.length;
            const active_ = channel === option.key;

            return (
              <Link
                key={option.key || 'all'}
                href={option.key ? `/journeys?channel=${option.key}` : '/journeys'}
                aria-current={active_ ? 'true' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active_
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-stone-300 bg-white text-ink-muted hover:border-brand-300 hover:text-ink'
                }`}
              >
                {option.label}
                <span className={active_ ? 'text-white/80' : 'text-ink-subtle'}>{total}</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {journeys.length === 0 ? (
        <Card>
          <EmptyState
            icon={Workflow}
            title="No journeys set up"
            description="New salons get eight ready-made journeys — booking confirmation, review request, win-back, birthday and more."
          />
        </Card>
      ) : shown.length === 0 ? (
        /* Filtered to a channel nothing sends on. Saying so beats a blank
           page, which reads as broken rather than empty. */
        <Card>
          <EmptyState
            icon={Workflow}
            title={`No automation sends on ${channel === 'WHATSAPP' ? 'WhatsApp' : channel === 'SMS' ? 'SMS' : 'email'}`}
            description="Open an automation and set one of its messages to this channel, or add a template for it first — a step with no template for its channel sends nothing."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((journey) => (
            <Card key={journey.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-ink">
                    <Link href={`/journeys/${journey.id}`} className="hover:text-brand-700 hover:underline">
                      {journey.name}
                    </Link>
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {triggerLabel(journey.trigger)}
                    {journey.trigger === 'NO_VISIT_DAYS' && journey.triggerConfig?.days
                      ? ` (${String(journey.triggerConfig.days)} days)`
                      : ''}
                    {/* The stages, not a day count — this journey has none.
                        Naming them is what tells the owner the difference
                        between chasing at "due soon" and at "at risk". */}
                    {journey.trigger === 'VISIT_DUE' && Array.isArray(journey.triggerConfig?.stages)
                      ? ` (${(journey.triggerConfig.stages as string[])
                          .map((stage) => stage.replace(/_/g, ' ').toLowerCase())
                          .join(', ')})`
                      : ''}
                  </p>
                </div>
                {canManage ? (
                  <JourneyToggle journeyId={journey.id} isActive={journey.isActive} />
                ) : (
                  <Badge tone={journey.isActive ? 'success' : 'neutral'}>{journey.isActive ? 'Running' : 'Paused'}</Badge>
                )}
              </div>

              <div className="flex-1 p-5">
                <ol className="space-y-0">
                  {journey.steps.map((step, index) => (
                    <li key={step.id}>
                      {index > 0 ? (
                        <div className="ml-3 flex items-center gap-1.5 py-1 text-2xs text-ink-subtle">
                          <ArrowDown className="h-3 w-3" />
                          {step.delayMinutes > 0 ? `wait ${duration(step.delayMinutes)}` : 'immediately'}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2.5 rounded-lg bg-stone-50 px-3 py-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xs font-semibold text-brand-700">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-xs text-ink">
                          {ACTION_LABEL[step.actionType] ?? step.actionType}
                          {step.template ? (
                            <span className="text-ink-muted"> · {step.template.name}</span>
                          ) : null}
                        </span>
                        {step.channel ? <Badge>{step.channel.toLowerCase()}</Badge> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-200 px-5 py-3 text-2xs text-ink-subtle">
                {journey.stats
                  ? Object.entries(journey.stats.runs).map(([status, value]) => (
                      <span key={status}>
                        {status.toLowerCase()}: <span className="tnum font-medium text-ink">{value}</span>
                      </span>
                    ))
                  : null}
                {/* A run count is not a result. This is the way through to
                    whether the messages it sent actually arrived. */}
                <Link
                  href={`/journeys/${journey.id}`}
                  className="ml-auto font-medium text-brand-700 hover:underline"
                >
                  See how it is doing
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
