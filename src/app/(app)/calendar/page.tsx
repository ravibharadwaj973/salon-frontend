import type { Metadata } from 'next';
import { CalendarDays } from 'lucide-react';
import { apiFetch, apiFetchSafe } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/display';
import { CalendarBoard } from './calendar-board';
import { dayKey } from '@/lib/format';
import type { CalendarResponse, Service, SessionUser, Staff } from '@/lib/types';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; groupBy?: string; appointment?: string }>;
}) {
  const params = await searchParams;
  const date = params.date ?? dayKey();
  const groupBy = params.groupBy === 'resource' ? 'resource' : 'staff';

  const user = await apiFetch<SessionUser>('/auth/me', { noBranch: true });

  const [calendar, services, staff] = await Promise.all([
    apiFetchSafe<CalendarResponse>('/appointments/calendar', { query: { date, groupBy, view: 'day' } }),
    apiFetchSafe<{ id: string; name: string; services: Service[] }[]>('/services/menu'),
    apiFetchSafe<Staff[]>('/staff/bookable', {
      query: { branchId: user.branches[0]?.id ?? '' },
    }),
  ]);

  return (
    <>
      <PageHeader title="Calendar" description={calendar ? calendar.branch.name : 'Select a branch to see the diary'} />

      {calendar ? (
        <CalendarBoard
          initial={calendar}
          date={date}
          groupBy={groupBy}
          serviceGroups={services ?? []}
          staff={staff ?? []}
          openAppointmentId={params.appointment ?? null}
          canManage={user.permissions.includes('appointment.manage')}
        />
      ) : (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="No calendar to show"
            description="Pick a branch from the switcher at the top, or check that the API is running."
          />
        </Card>
      )}
    </>
  );
}
