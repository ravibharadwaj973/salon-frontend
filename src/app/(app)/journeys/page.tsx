import type { Metadata } from 'next';
import { ArrowDown, Workflow } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Badge, Card, EmptyState, PageHeader, StatTile } from '@/components/ui/display';
import { JourneyToggle } from './journey-toggle';
import { count, duration } from '@/lib/format';
import type { Journey, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Journeys' };
export const dynamic = 'force-dynamic';

const TRIGGER_LABEL: Record<string, string> = {
  APPOINTMENT_BOOKED: 'When an appointment is booked',
  APPOINTMENT_COMPLETED: 'After a visit is completed',
  APPOINTMENT_CANCELLED: 'When an appointment is cancelled',
  FIRST_VISIT: 'After a customer’s first visit',
  INVOICE_PAID: 'When a bill is paid',
  NO_VISIT_DAYS: 'When a customer goes quiet',
  MEMBERSHIP_EXPIRING: 'Before a membership expires',
  PACKAGE_EXPIRING: 'Before a package expires',
  BIRTHDAY: 'On a birthday',
  LEAD_CREATED: 'When a new enquiry arrives',
  REVIEW_REQUEST: 'After feedback is left',
};

const ACTION_LABEL: Record<string, string> = {
  SEND_MESSAGE: 'Send message',
  ADD_TAG: 'Add tag',
  REMOVE_TAG: 'Remove tag',
  ADD_LOYALTY_POINTS: 'Award points',
  CREATE_TASK: 'Create a task',
  ADD_TO_SEGMENT: 'Add to segment',
  WAIT: 'Wait',
  EXIT_IF_BOOKED: 'Stop if they book',
};

export default async function JourneysPage() {
  const [{ data: journeys }, user] = await Promise.all([
    apiFetchList<Journey>('/journeys', { query: { pageSize: 50 } }),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

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

      {journeys.length === 0 ? (
        <Card>
          <EmptyState
            icon={Workflow}
            title="No journeys set up"
            description="New salons get eight ready-made journeys — booking confirmation, review request, win-back, birthday and more."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {journeys.map((journey) => (
            <Card key={journey.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-ink">{journey.name}</h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {TRIGGER_LABEL[journey.trigger] ?? journey.trigger.replace(/_/g, ' ').toLowerCase()}
                    {journey.trigger === 'NO_VISIT_DAYS' && journey.triggerConfig?.days
                      ? ` (${String(journey.triggerConfig.days)} days)`
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

              {journey.stats ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-stone-200 px-5 py-3 text-2xs text-ink-subtle">
                  {Object.entries(journey.stats.runs).map(([status, value]) => (
                    <span key={status}>
                      {status.toLowerCase()}: <span className="tnum font-medium text-ink">{value}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
