import Link from 'next/link';
import type { Metadata } from 'next';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CreditCard,
  Info,
  Lightbulb,
  TriangleAlert,
  UserPlus,
} from 'lucide-react';
import { apiFetchSafe, apiFetchList } from '@/lib/api';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, StatTile, StatusBadge, Avatar } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { count, fullName, money, moneyCompact, time } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Appointment, BusinessAlert, DashboardResponse, Insight } from '@/lib/types';
import { DayPicker } from './day-picker';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

interface TodaySummary {
  total: number;
  isToday: boolean;
  counts: Record<string, number>;
  completed: number;
  noShows: number;
  cancelled: number;
  upcoming: Appointment[];
  unconfirmedTomorrow: number;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  // A plain query parameter, so a particular day is a link somebody can send.
  const asked = (await searchParams).date;

  const [dashboard, todayList, alerts, insights] = await Promise.all([
    apiFetchSafe<DashboardResponse>('/analytics/dashboard', { query: asked ? { date: asked } : {} }),
    apiFetchSafe<TodaySummary>('/appointments/today', { query: asked ? { date: asked } : {} }),
    apiFetchList<BusinessAlert>('/analytics/alerts', { query: { pageSize: 8 } }).catch(() => null),
    apiFetchSafe<{ insights: Insight[] }>('/analytics/insights'),
  ]);

  const today = dashboard?.today;
  const change = dashboard?.comparison;
  const viewingToday = dashboard?.isToday ?? true;

  return (
    <>
      <PageHeader
        // The heading follows the day being looked at. Leaving it as "Today"
        // over last Saturday's takings is how a number gets misread.
        title={viewingToday ? 'Today' : 'That day'}
        description={dashboard ? new Date(dashboard.date).toDateString() : undefined}
        action={
          <>
            <ButtonLink href="/calendar" variant="secondary" size="md">
              <CalendarDays className="h-4 w-4" />
              Calendar
            </ButtonLink>
            <ButtonLink href="/pos" size="md">
              <CreditCard className="h-4 w-4" />
              New bill
            </ButtonLink>
          </>
        }
      />

      {dashboard ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <DayPicker date={dashboard.date} earliest={dashboard.earliestDate} latest={dashboard.latestDate} />
          {!viewingToday ? (
            <p className="text-2xs text-ink-subtle">
              Showing a past day. Figures are final; nothing here updates.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* The one case where the day shown is not the day asked for: a stale
          bookmark, or a URL typed by hand. Said plainly rather than silently
          answering a different question. */}
      {dashboard?.clamped ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          <Info className="mt-px h-4 w-4 shrink-0" />
          That day is outside your account&rsquo;s history, so this is {new Date(dashboard.date).toDateString()} instead.
          Your account starts on {new Date(dashboard.earliestDate).toDateString()}.
        </p>
      ) : null}

      {!dashboard ? (
        <Card>
          <EmptyState
            icon={TriangleAlert}
            title="Could not load today's numbers"
            description="The API did not respond. Check that the backend is running and your branch is selected."
          />
        </Card>
      ) : (
        <>
          {/* The seven numbers an owner actually opens the app for. */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Revenue" value={money(today?.revenue)} change={change?.revenueChangePct} />
            <StatTile label="Collected" value={money(today?.collected)} hint={`${count(today?.invoices ?? 0)} bills`} />
            <StatTile label="Appointments" value={count(today?.appointments ?? 0)} change={change?.appointmentsChangePct} />
            <StatTile label="Completed" value={count(today?.completed ?? 0)} hint={`${count(today?.upcoming ?? 0)} upcoming`} />
          </section>

          <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="New customers" value={count(today?.newCustomers ?? 0)} change={change?.newCustomersChangePct} />
            <StatTile label="Returning" value={count(today?.returningCustomers ?? 0)} hint="customers served" />
            <StatTile label="No-shows" value={count(today?.noShows ?? 0)} tone={today && today.noShows > 0 ? 'negative' : 'neutral'} />
            <StatTile
              label="Outstanding"
              value={money(today?.outstanding)}
              tone={today && Number(today.outstanding) > 0 ? 'negative' : 'neutral'}
              href="/invoices?unpaidOnly=true"
            />
          </section>

          {/* Money in vs money out — the line owners rarely see day to day. */}
          {dashboard && !dashboard.comparable ? (
            <p className="mt-3 text-2xs text-ink-subtle">
              No comparison shown — the day before this one is before your account existed.
            </p>
          ) : null}

          <section className="mt-3 grid gap-3 sm:grid-cols-3">
            <StatTile label={viewingToday ? "Today's expenses" : 'Expenses'} value={money(today?.expenses)} href="/expenses" />
            <StatTile
              label="Gross profit"
              value={money(today?.grossProfit)}
              tone={today && Number(today.grossProfit) >= 0 ? 'positive' : 'negative'}
              hint="revenue − expenses"
            />
            <StatTile label="Average bill" value={money(today?.averageBill)} change={change?.averageBillChangePct} />
          </section>
        </>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Alerts — what needs attention, not another chart. */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Needs your attention"
            subtitle="Generated every morning from your own data"
            action={
              <Link href="/reports" className="text-xs font-medium text-brand-700 hover:underline">
                All reports
              </Link>
            }
          />
          {alerts && alerts.data.length > 0 ? (
            <ul className="divide-y divide-stone-100">
              {alerts.data.map((alert) => (
                <li key={alert.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                      alert.severity === 'CRITICAL' && 'bg-rose-100 text-rose-600',
                      alert.severity === 'WARNING' && 'bg-amber-100 text-amber-600',
                      alert.severity === 'INFO' && 'bg-sky-100 text-sky-600',
                    )}
                  >
                    {alert.severity === 'INFO' ? <Info className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{alert.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{alert.body}</p>
                  </div>
                  {alertLink(alert) ? (
                    <Link
                      href={alertLink(alert)!}
                      className="mt-0.5 shrink-0 text-xs font-medium text-brand-700 hover:underline"
                    >
                      Act
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nothing needs chasing"
              description="No lapsed customers, expiring memberships or unconfirmed bookings right now."
            />
          )}
        </Card>

        {/* Next up */}
        <Card>
          <CardHeader
            // "Next up" over a past day is wrong twice: nothing is next, and
            // the list below is what the day held rather than what is coming.
            title={viewingToday ? 'Next up' : "That day's appointments"}
            subtitle={
              todayList ? `${count(todayList.total)} booked ${viewingToday ? 'today' : 'that day'}` : undefined
            }
            action={
              <Link href="/calendar" className="text-xs font-medium text-brand-700 hover:underline">
                Calendar
              </Link>
            }
          />
          {todayList && todayList.upcoming.length > 0 ? (
            <ul className="divide-y divide-stone-100">
              {todayList.upcoming.slice(0, 7).map((appointment) => (
                <li key={appointment.id}>
                  <Link href={`/calendar?appointment=${appointment.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
                    <span className="tnum w-14 shrink-0 text-xs font-medium text-ink-muted">{time(appointment.startAt)}</span>
                    <Avatar name={fullName(appointment.customer)} id={appointment.customerId ?? appointment.id} size="xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {appointment.customer ? fullName(appointment.customer) : (appointment.walkInName ?? 'Walk-in')}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {appointment.services.map((s) => s.service.name).join(', ') || 'No services'}
                      </p>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title={viewingToday ? 'Nothing left today' : 'No appointments that day'}
              description={
                viewingToday
                  ? 'No more confirmed appointments on the books for today.'
                  : 'Nobody was booked in on this day.'
              }
              action={
                viewingToday ? (
                  <ButtonLink href="/calendar" size="sm" variant="secondary">
                    <UserPlus className="h-3.5 w-3.5" />
                    Book someone in
                  </ButtonLink>
                ) : undefined
              }
            />
          )}
          {todayList && todayList.unconfirmedTomorrow > 0 ? (
            <div className="border-t border-stone-200 bg-amber-50/60 px-5 py-3 text-xs text-amber-800">
              {count(todayList.unconfirmedTomorrow)} appointment{todayList.unconfirmedTomorrow === 1 ? '' : 's'} tomorrow
              {' '}still unconfirmed.
            </div>
          ) : null}
        </Card>
      </div>

      {/* Business intelligence in sentences, which is the point. */}
      {insights && insights.insights.length > 0 ? (
        <Card className="mt-5">
          <CardHeader title="What the numbers are saying" subtitle="This month against last" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {insights.insights.slice(0, 6).map((insight, index) => (
              <div key={`${insight.type}-${index}`} className="flex items-start gap-2.5 rounded-lg bg-stone-50 p-3">
                <Lightbulb
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    insight.severity === 'WARNING' ? 'text-amber-500' : 'text-brand-500',
                  )}
                />
                <p className="text-xs leading-relaxed text-ink">{insight.message}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {dashboard ? (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-subtle">
          Yesterday you took {moneyCompact(dashboard.previous.revenue)} across {count(dashboard.previous.invoices)} bills.
          <Link href="/reports" className="font-medium text-brand-700 hover:underline">
            See the full picture <ArrowRight className="inline h-3 w-3" />
          </Link>
        </p>
      ) : null}
    </>
  );
}

/** Each alert type knows where the fix lives. */
function alertLink(alert: BusinessAlert): string | null {
  switch (alert.type) {
    case 'LAPSED_CUSTOMERS':
      return '/customers?lapsed=true';
    case 'MEMBERSHIPS_EXPIRING':
      return '/memberships?expiringInDays=7';
    case 'UNCONFIRMED_APPOINTMENTS':
      return '/calendar';
    case 'LOW_STOCK':
      return '/inventory?lowOnly=true';
    case 'OUTSTANDING_PAYMENTS':
      return '/invoices?unpaidOnly=true';
    case 'PACKAGES_EXPIRING':
      return '/packages?tab=purchases';
    case 'UNRESOLVED_COMPLAINTS':
      return '/feedback?unresolvedOnly=true';
    case 'LOW_RATING':
      return '/feedback';
    default:
      return alert.type.startsWith('STAFF_UNDERUTILISED') ? '/staff' : null;
  }
}
