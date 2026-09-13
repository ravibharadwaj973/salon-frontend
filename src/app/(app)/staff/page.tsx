import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles, Star, Trophy } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { AddStaffButton } from './staff-form';
import { dayjs, money, percent } from '@/lib/format';
import type { BranchSummary, Service, SessionUser, Staff, StaffLeaderboardRow } from '@/lib/types';

export const metadata: Metadata = { title: 'Staff' };
export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const today = dayjs().format('YYYY-MM-DD');

  const [{ data: staff }, leaderboard, user, branches, services] = await Promise.all([
    apiFetchList<Staff>('/staff', { query: { pageSize: 100, isActive: 'true' } }),
    apiFetchSafe<StaffLeaderboardRow[]>('/staff/leaderboard', { query: { from: monthStart, to: today, limit: 10 } }),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
    apiFetchList<BranchSummary>('/branches', { query: { pageSize: 50, isActive: 'true' } }).catch(() => null),
    apiFetchList<Service>('/services', { query: { pageSize: 200, isActive: 'true' } }).catch(() => null),
  ]);

  const canSeeReports = user?.permissions.includes('report.view') ?? false;
  const canManage = user?.permissions.includes('staff.manage') ?? false;
  const revenueById = new Map((leaderboard ?? []).map((row) => [row.staffId, row]));

  const addButton =
    canManage && branches ? <AddStaffButton branches={branches.data} services={services?.data ?? []} /> : null;

  return (
    <>
      <PageHeader title="Staff" description={`${staff.length} active team members`} action={addButton} />

      {canSeeReports && leaderboard && leaderboard.length > 0 ? (
        <Card className="mb-5">
          <CardHeader title="This month's revenue" subtitle="Service revenue billed against each person" />
          <div className="space-y-2 p-5">
            {leaderboard.slice(0, 5).map((row, index) => (
              <div key={row.staffId} className="flex items-center gap-3">
                <span className="w-4 shrink-0 text-center text-xs font-semibold text-ink-subtle">{index + 1}</span>
                <Avatar name={row.name} id={row.staffId} size="xs" />
                <Link href={`/staff/${row.staffId}`} className="w-32 shrink-0 truncate text-sm text-ink hover:text-brand-700">
                  {row.name}
                </Link>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.max(2, row.shareOfRevenuePct)}%` }}
                  />
                </div>
                <span className="tnum w-24 shrink-0 text-right text-sm font-medium text-ink">{money(row.revenue)}</span>
                <span className="tnum w-12 shrink-0 text-right text-xs text-ink-subtle">
                  {percent(row.shareOfRevenuePct, 0)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        {staff.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No staff yet"
            description="Add your stylists and beauticians so they appear on the calendar and earn commission."
            action={addButton}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Branch</TH>
                <TH align="right">Rating</TH>
                <TH align="right">Services</TH>
                {canSeeReports ? <TH align="right">Month revenue</TH> : null}
                <TH>Bookable</TH>
              </TR>
            </THead>
            <TBody>
              {staff.map((member) => {
                const stats = revenueById.get(member.id);
                return (
                  <TR key={member.id}>
                    <TD>
                      <Link href={`/staff/${member.id}`} className="flex items-center gap-2.5">
                        <Avatar name={member.displayName} src={member.avatarUrl} id={member.id} size="sm" />
                        <span className="font-medium text-ink hover:text-brand-700">{member.displayName}</span>
                      </Link>
                    </TD>
                    <TD className="text-xs text-ink-muted">{member.designation ?? '—'}</TD>
                    <TD className="text-xs text-ink-muted">{member.branch?.name ?? '—'}</TD>
                    <TD align="right">
                      {member.ratingCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Star className="h-3 w-3 fill-current" />
                          {Number(member.avgRating).toFixed(1)}
                          <span className="text-ink-subtle">({member.ratingCount})</span>
                        </span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </TD>
                    <TD align="right" className="text-ink-muted">
                      {member._count?.services ?? 0}
                    </TD>
                    {canSeeReports ? (
                      <TD align="right" className="font-medium">
                        {stats ? money(stats.revenue) : '—'}
                      </TD>
                    ) : null}
                    <TD>{member.isBookable ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {canSeeReports ? (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-subtle">
          <Trophy className="h-3.5 w-3.5" />
          Open a stylist to see retention, commission and target achievement.
        </p>
      ) : null}
    </>
  );
}
