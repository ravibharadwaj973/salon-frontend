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
  searchParams: Promise<{
    date?: string;
    groupBy?: string;
    appointment?: string;
    /** The hand-off from the hair studio's "Book it". See `preset` below. */
    service?: string;
    design?: string;
    customer?: string;
  }>;
}) {
  const params = await searchParams;
  const date = params.date ?? dayKey();
  const groupBy = params.groupBy === 'resource' ? 'resource' : 'staff';

  const user = await apiFetch<SessionUser>('/auth/me', { noBranch: true });

  const [calendar, services, staff, presetCustomer, presetDesign] = await Promise.all([
    apiFetchSafe<CalendarResponse>('/appointments/calendar', { query: { date, groupBy, view: 'day' } }),
    apiFetchSafe<{ id: string; name: string; services: Service[] }[]>('/services/menu'),
    apiFetchSafe<Staff[]>('/staff/bookable', {
      query: { branchId: user.branches[0]?.id ?? '' },
    }),
    /*
     * BOTH FETCHES ARE `Safe`, AND THAT IS THE POINT.
     *
     * These ids come out of a url somebody may have bookmarked, pasted or sat on
     * for a week. A deleted design or a customer merged into another record must
     * open an ordinary empty booking form, never an error page: the receptionist
     * in front of a waiting customer needs the calendar, and a stale link is not
     * a reason to withhold it.
     */
    params.customer
      ? apiFetchSafe<{ id: string; firstName: string; lastName: string }>(`/customers/${params.customer}`)
      : Promise.resolve(null),
    params.design
      ? apiFetchSafe<{ id: string; name: string; notes: string | null }>(`/hair-studio/designs/${params.design}`)
      : Promise.resolve(null),
  ]);

  /**
   * WHAT THE STUDIO ASKED FOR, CARRIED INTO THE BOOKING FORM.
   *
   * "Book it" in the hair studio has pushed `?service=&design=&customer=` at this
   * page since the studio was built, and this page ignored all three — so the
   * promise at the end of every consultation was a link to a blank form, and the
   * design the customer agreed to was never attached to the appointment that
   * would cut it.
   */
  const preset =
    params.service || presetCustomer || presetDesign
      ? {
          serviceId: params.service ?? null,
          customer: presetCustomer,
          design: presetDesign,
        }
      : null;

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
          preset={preset}
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
