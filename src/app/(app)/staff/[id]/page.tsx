import { PermissionGate } from '@/components/permission-gate';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarClock, Clock, Sparkles, Star, Wallet } from 'lucide-react';
import { ApiError, apiFetch, apiFetchAllowed, apiFetchList, apiFetchSafe } from '@/lib/api';
import { Avatar, Badge, Card, CardBody, CardHeader, StatTile, StatusBadge } from '@/components/ui/display';
import { date, dayjs, money, percent, phone as formatPhone, time } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/permissions';
import { EditStaffButton } from '../staff-form';
import type {
  AttendanceView,
  BranchSummary,
  CommissionView,
  LeaveRequest,
  Money,
  Payslip,
  Service,
  SessionUser,
  Staff,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Performance {
  staff: { id: string; name: string; branch: { id: string; name: string } | null; avatarUrl: string | null };
  period: { from: string; to: string };
  revenue: Money;
  servicesBilled: number;
  appointments: number;
  uniqueCustomers: number;
  averageBill: Money;
  retentionPct: number;
  commission: Money;
  target: Money | null;
  achievementPct: number | null;
  averageRating: number;
  ratingCount: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const staff = await apiFetch<Staff>(`/staff/${(await params).id}`);
    return { title: staff.displayName };
  } catch {
    return { title: 'Staff member' };
  }
}

/**
 * One page, several sections — and the API decides which ones this viewer
 * gets (`staff.sections`), weighing their permissions, the owner's layout in
 * Settings → Who sees what, and whether they are looking at themselves. A
 * stylist opening their own page sees their hours and commission; opening a
 * colleague's, they see what the owner allows.
 */
export default async function StaffMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const from = query.from ?? dayjs().startOf('month').format('YYYY-MM-DD');
  const to = query.to ?? dayjs().format('YYYY-MM-DD');

  let staff: Staff | null;
  try {
    staff = await apiFetchAllowed<Staff>(`/staff/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (!staff) {
    return (
      <PermissionGate
        permission="staff.view"
        what="Team records are restricted."
        backHref="/staff"
        backLabel="All team members"
      />
    );
  }

  const shows = (key: string) => staff.sections?.includes(key) ?? true;

  const [user, branches, services] = await Promise.all([
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
    apiFetchList<BranchSummary>('/branches', { query: { pageSize: 50, isActive: 'true' } }).catch(() => null),
    apiFetchList<Service>('/services', { query: { pageSize: 200, isActive: 'true' } }).catch(() => null),
  ]);
  const canManage = user?.permissions.includes('staff.manage') ?? false;

  const [performance, attendance, commissions, payslips, leave] = await Promise.all([
    shows('performance') ? apiFetchSafe<Performance>(`/staff/${id}/performance`, { query: { from, to } }) : Promise.resolve(null),
    shows('attendance') ? apiFetchSafe<AttendanceView>(`/staff/${id}/attendance`, { query: { from, to, pageSize: 31 } }) : Promise.resolve(null),
    shows('earnings') ? apiFetchSafe<CommissionView>(`/staff/${id}/commissions`, { query: { from, to, pageSize: 10 } }) : Promise.resolve(null),
    shows('pay') ? apiFetchList<Payslip>(`/staff/${id}/payslips`, { query: { pageSize: 6 } }).then((r) => r.data).catch(() => null) : Promise.resolve(null),
    shows('leave') ? apiFetchList<LeaveRequest>(`/staff/${id}/leave`, { query: { pageSize: 6 } }).then((r) => r.data).catch(() => null) : Promise.resolve(null),
  ]);

  const hiddenCount = staff.sections ? 8 - staff.sections.length : 0;

  return (
    <>
      <Link href="/staff" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        All staff
      </Link>

      <header className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar name={staff.displayName} src={staff.avatarUrl} id={staff.id} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {staff.displayName}
            {staff.isSelf ? <span className="ml-2 text-sm font-normal text-ink-subtle">(you)</span> : null}
          </h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {staff.designation ?? 'Team member'}
            {staff.branch ? ` · ${staff.branch.name}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {staff.isBookable ? <Badge tone="success">Bookable</Badge> : <Badge>Not bookable</Badge>}
            {!staff.isActive ? <Badge tone="danger">Left</Badge> : null}
            {staff.ratingCount > 0 ? (
              <Badge tone="warning">
                <Star className="h-3 w-3 fill-current" />
                {Number(staff.avgRating).toFixed(1)} from {staff.ratingCount} reviews
              </Badge>
            ) : null}
            {staff.specialities.map((speciality) => (
              <Badge key={speciality}>{speciality}</Badge>
            ))}
          </div>
        </div>
        {canManage && branches ? (
          <EditStaffButton staff={staff} branches={branches.data} services={services?.data ?? []} />
        ) : null}
      </header>

      {/* Period picker — plain GET form, so the URL is shareable. */}
      {shows('performance') || shows('attendance') || shows('earnings') ? (
        <form className="mb-5 flex flex-wrap items-end gap-2" action={`/staff/${id}`}>
          <label className="text-xs text-ink-muted">
            From
            <input type="date" name="from" defaultValue={from} className="ml-2 h-8 rounded-lg border border-stone-300 px-2 text-xs shadow-sm" />
          </label>
          <label className="text-xs text-ink-muted">
            To
            <input type="date" name="to" defaultValue={to} className="ml-2 h-8 rounded-lg border border-stone-300 px-2 text-xs shadow-sm" />
          </label>
          <button type="submit" className="h-8 rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium hover:bg-stone-50">
            Update
          </button>
        </form>
      ) : null}

      {/* Headline numbers: how much they worked, how much they brought in, how much they earned */}
      {(shows('attendance') && attendance) || (shows('performance') && performance) || (shows('earnings') && commissions) ? (
        <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shows('attendance') && attendance ? (
            <>
              <StatTile label="Days worked" value={String(attendance.totals.daysPresent)} hint={`${attendance.totals.daysAbsent} absent · ${attendance.totals.onLeave} on leave`} />
              <StatTile label="Hours worked" value={`${attendance.totals.hoursWorked}h`} hint="from punches" />
            </>
          ) : null}
          {shows('performance') && performance ? (
            <>
              <StatTile label="Revenue" value={money(performance.revenue)} hint={`${performance.servicesBilled} services`} />
              <StatTile label="Customers" value={String(performance.uniqueCustomers)} hint={`${performance.appointments} appointments`} />
            </>
          ) : null}
          {shows('earnings') && commissions ? (
            <StatTile
              label="Commission earned"
              value={money(commissions.totalAmount)}
              hint={Number(commissions.unpaidAmount) > 0 ? `${money(commissions.unpaidAmount)} not yet paid` : 'all paid out'}
              tone={Number(commissions.unpaidAmount) > 0 ? 'negative' : 'neutral'}
            />
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Performance */}
          {shows('performance') && performance ? (
            <Card>
              <CardHeader title="Performance" subtitle={`${date(from)} – ${date(to)}`} />
              <CardBody className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatTile label="Average bill" value={money(performance.averageBill)} />
                  <StatTile
                    label="Retention"
                    value={percent(performance.retentionPct, 0)}
                    hint="customers who came back"
                    tone={performance.retentionPct >= 50 ? 'positive' : 'neutral'}
                  />
                  <StatTile
                    label="Rating"
                    value={performance.averageRating ? Number(performance.averageRating).toFixed(1) : '—'}
                    hint={`${performance.ratingCount} reviews in period`}
                  />
                </div>
                {performance.target && performance.achievementPct !== null ? (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">Target</span>
                      <span className="tnum text-ink-muted">
                        {money(performance.revenue)} of {money(performance.target)} · {percent(performance.achievementPct, 0)}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className={`h-full rounded-full ${performance.achievementPct >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                        style={{ width: `${Math.min(100, Math.max(1, performance.achievementPct))}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ink-subtle">No target set for this period.</p>
                )}
              </CardBody>
            </Card>
          ) : null}

          {/* Attendance */}
          {shows('attendance') && attendance ? (
            <Card>
              <CardHeader
                title="Attendance"
                subtitle={`${attendance.totals.daysPresent} of ${attendance.totals.daysMarked} marked days present · ${attendance.totals.hoursWorked} hours`}
              />
              {attendance.items.length === 0 ? (
                <CardBody>
                  <p className="text-xs text-ink-subtle">No attendance marked in this period.</p>
                </CardBody>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {attendance.items.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs">
                      <span className="w-28 shrink-0 text-ink">{date(row.date, 'ddd, DD MMM')}</span>
                      <span className="tnum flex-1 text-ink-muted">
                        {row.checkIn ? time(row.checkIn) : '—'} → {row.checkOut ? time(row.checkOut) : '—'}
                        {row.workedMinutes > 0 ? ` · ${(row.workedMinutes / 60).toFixed(1)}h` : ''}
                      </span>
                      <StatusBadge status={row.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {/* Commission ledger */}
          {shows('earnings') && commissions ? (
            <Card>
              <CardHeader
                title="Commission"
                subtitle={
                  staff.commissionRate !== null
                    ? `${Number(staff.commissionRate)}% on services · ${money(commissions.totalAmount)} in period`
                    : `${money(commissions.totalAmount)} in period`
                }
              />
              {commissions.items.length === 0 ? (
                <CardBody>
                  <p className="text-xs text-ink-subtle">Nothing earned in this period.</p>
                </CardBody>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {commissions.items.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs">
                      <div className="min-w-0">
                        <p className="text-ink">
                          {entry.invoice ? (
                            <Link href={`/invoices/${entry.invoice.id}`} className="hover:text-brand-700">
                              {entry.invoice.invoiceNumber}
                            </Link>
                          ) : (
                            'Manual entry'
                          )}
                        </p>
                        <p className="tnum text-2xs text-ink-subtle">
                          {date(entry.earnedOn)} · {Number(entry.ratePct)}% of {money(entry.baseAmount)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tnum font-medium text-ink">{money(entry.amount)}</p>
                        <p className={`text-2xs ${entry.isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>{entry.isPaid ? 'paid' : 'unpaid'}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {/* Employment details */}
          {shows('details') ? (
            <Card>
              <CardHeader title="Employment details" />
              <CardBody className="space-y-2.5 text-sm">
                <Detail label="Phone" value={staff.phone ? formatPhone(staff.phone) : '—'} />
                <Detail label="Email" value={staff.email ?? '—'} />
                <Detail label="Branch" value={staff.branch?.name ?? '—'} />
                <Detail label="Login" value={staff.user ? `${staff.user.email} · ${ROLE_LABEL[staff.user.role] ?? staff.user.role}` : 'No login'} />
                {staff.joinedAt || staff.createdAt ? <Detail label="Joined" value={date(staff.joinedAt ?? staff.createdAt, 'MMM YYYY')} /> : null}
              </CardBody>
            </Card>
          ) : null}

          {/* Salary & payslips */}
          {shows('pay') ? (
            <Card>
              <CardHeader
                title="Salary & payslips"
                subtitle={staff.baseSalary !== null ? `${money(staff.baseSalary)} base per month` : undefined}
              />
              {payslips && payslips.length > 0 ? (
                <ul className="divide-y divide-stone-100">
                  {payslips.map((slip) => (
                    <li key={slip.id} className="px-5 py-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-ink">
                          {MONTHS[slip.payroll.periodMonth - 1]} {slip.payroll.periodYear}
                        </span>
                        <span className="tnum font-semibold text-ink">{money(slip.netPay)}</span>
                      </div>
                      <p className="tnum mt-0.5 text-2xs text-ink-subtle">
                        {money(slip.baseSalary)} base + {money(slip.commission)} commission
                        {Number(slip.incentive) > 0 ? ` + ${money(slip.incentive)} incentive` : ''}
                        {Number(slip.deductions) > 0 ? ` − ${money(slip.deductions)}` : ''} · {slip.daysPresent} days ·{' '}
                        <span className={slip.payroll.paidAt ? 'text-emerald-700' : 'text-amber-700'}>
                          {slip.payroll.paidAt ? `paid ${date(slip.payroll.paidAt)}` : slip.payroll.status.toLowerCase()}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <CardBody>
                  <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
                    <Wallet className="h-3.5 w-3.5" />
                    No payslips yet — they appear once payroll is generated.
                  </p>
                </CardBody>
              )}
            </Card>
          ) : null}

          {/* Leave */}
          {shows('leave') ? (
            <Card>
              <CardHeader title="Leave" />
              {leave && leave.length > 0 ? (
                <ul className="divide-y divide-stone-100">
                  {leave.map((request) => (
                    <li key={request.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs">
                      <div className="min-w-0">
                        <p className="text-ink">
                          {date(request.fromDate, 'DD MMM')}
                          {request.toDate !== request.fromDate ? ` – ${date(request.toDate, 'DD MMM')}` : ''}
                        </p>
                        {request.reason ? <p className="truncate text-2xs text-ink-subtle">{request.reason}</p> : null}
                      </div>
                      <StatusBadge status={request.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <CardBody>
                  <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
                    <CalendarClock className="h-3.5 w-3.5" />
                    No leave requests.
                  </p>
                </CardBody>
              )}
            </Card>
          ) : null}

          {/* Weekly schedule */}
          {shows('schedule') ? (
            <Card>
              <CardHeader title="Weekly schedule" />
              <CardBody>
                {staff.availability && staff.availability.length > 0 ? (
                  <ul className="space-y-1.5 text-xs">
                    {[...staff.availability]
                      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                      .map((slot) => (
                        <li key={slot.id} className="flex items-center justify-between">
                          <span className="text-ink-muted">{DAYS[slot.dayOfWeek]}</span>
                          <span className="tnum text-ink">
                            {slot.startTime} – {slot.endTime}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
                    <Clock className="h-3.5 w-3.5" />
                    Follows the branch opening hours.
                  </p>
                )}
              </CardBody>
            </Card>
          ) : null}

          {/* Services offered */}
          {shows('services') ? (
            <Card>
              <CardHeader title="Services offered" subtitle="What this person can be booked for" />
              <CardBody>
                {staff.services && staff.services.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {staff.services.map((entry) => (
                      <Badge key={entry.id}>{entry.service.name}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">No services assigned yet — they will not appear in online booking.</p>
                )}
              </CardBody>
            </Card>
          ) : null}

          {hiddenCount > 0 ? (
            <p className="flex items-start gap-1.5 px-1 text-2xs leading-relaxed text-ink-subtle">
              <Sparkles className="mt-px h-3 w-3 shrink-0" />
              Some sections are hidden for your role. The owner chooses what each role sees in Settings → Who sees what.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-ink-muted">{label}</span>
      <span className="text-right text-xs text-ink">{value}</span>
    </div>
  );
}
