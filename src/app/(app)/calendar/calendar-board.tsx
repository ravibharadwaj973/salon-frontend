'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { apiGet } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/display';
import { dayjs, duration, fullName, time } from '@/lib/format';
import { BookingModal } from './booking-modal';
import { AppointmentDrawer } from './appointment-drawer';
import type { CalendarColumn, CalendarResponse, Service, Staff } from '@/lib/types';

const PX_PER_MIN = 1.4;
const DEFAULT_OPEN = 9 * 60;
const DEFAULT_CLOSE = 21 * 60;

function toMinutes(iso: string): number {
  const d = dayjs(iso);
  return d.hour() * 60 + d.minute();
}

function parseTime(value: string): number {
  const [h = '0', m = '0'] = value.split(':');
  return Number(h) * 60 + Number(m);
}

const STATUS_STYLES: Record<string, string> = {
  BOOKED: 'bg-sky-50 border-sky-300 text-sky-900',
  CONFIRMED: 'bg-brand-50 border-brand-300 text-brand-900',
  CHECKED_IN: 'bg-amber-50 border-amber-300 text-amber-900',
  IN_PROGRESS: 'bg-amber-100 border-amber-400 text-amber-900',
  COMPLETED: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  NO_SHOW: 'bg-rose-50 border-rose-300 text-rose-900',
  CANCELLED: 'bg-stone-100 border-stone-300 text-stone-500 line-through',
};

export function CalendarBoard({
  initial,
  date,
  groupBy,
  serviceGroups,
  staff,
  openAppointmentId,
  canManage,
}: {
  initial: CalendarResponse;
  date: string;
  groupBy: 'staff' | 'resource';
  serviceGroups: { id: string; name: string; services: Service[] }[];
  staff: Staff[];
  openAppointmentId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [booking, setBooking] = useState<{ staffId?: string; startAt?: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(openAppointmentId);

  const { data: calendar = initial, refetch } = useQuery({
    queryKey: ['calendar', date, groupBy],
    queryFn: () => apiGet<CalendarResponse>('appointments/calendar', { query: { date, groupBy, view: 'day' } }),
    initialData: initial,
    refetchInterval: 60_000, // the front desk keeps this screen open all day
  });

  // Grid bounds come from the branch's own opening hours for this weekday.
  const { open, close } = useMemo(() => {
    const weekday = String(dayjs(date).day());
    const windows = calendar.openingHours?.[weekday] ?? [];
    if (!windows.length) return { open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
    return {
      open: Math.min(...windows.map((w) => parseTime(w.open))),
      close: Math.max(...windows.map((w) => parseTime(w.close))),
    };
  }, [calendar.openingHours, date]);

  const height = (close - open) * PX_PER_MIN;
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let minute = Math.floor(open / 60) * 60; minute <= close; minute += 60) list.push(minute);
    return list;
  }, [open, close]);

  const isToday = date === dayjs().format('YYYY-MM-DD');
  const nowOffset = isToday ? (dayjs().hour() * 60 + dayjs().minute() - open) * PX_PER_MIN : null;

  const go = (nextDate: string) => router.push(`/calendar?date=${nextDate}&groupBy=${groupBy}`);

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-stone-300 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => go(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))}
            className="rounded-l-lg px-2 py-1.5 text-ink-muted hover:bg-stone-50"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(event) => go(event.target.value)}
            className="tnum border-x border-stone-200 px-2 py-1.5 text-xs font-medium text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => go(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))}
            className="rounded-r-lg px-2 py-1.5 text-ink-muted hover:bg-stone-50"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <Button variant="secondary" size="sm" onClick={() => go(dayjs().format('YYYY-MM-DD'))}>
          Today
        </Button>

        <div className="flex rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm">
          {(['staff', 'resource'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => router.push(`/calendar?date=${date}&groupBy=${mode}`)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                groupBy === mode ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink',
              )}
            >
              {mode === 'staff' ? 'By stylist' : 'By chair'}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs text-ink-muted">
          <span className="tnum">
            {calendar.totals.appointments} appointments · {duration(calendar.totals.bookedMinutes)} booked
          </span>
          {canManage ? (
            <Button size="sm" onClick={() => setBooking({})}>
              <Plus className="h-3.5 w-3.5" />
              New appointment
            </Button>
          ) : null}
        </div>
      </div>

      {calendar.columns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={groupBy === 'staff' ? 'No bookable stylists in this branch' : 'No chairs or rooms set up'}
            description={
              groupBy === 'staff'
                ? 'Add staff and mark them bookable to see them on the calendar.'
                : 'Add chairs or rooms under Settings → Branches.'
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="scrollbar-thin overflow-x-auto">
            <div className="flex min-w-max">
              {/* Time gutter */}
              <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-stone-200 bg-white">
                <div className="h-11 border-b border-stone-200" />
                <div className="relative" style={{ height }}>
                  {hours.map((minute) => (
                    <div
                      key={minute}
                      className="absolute right-2 -translate-y-1/2 text-2xs tabular-nums text-ink-subtle"
                      style={{ top: (minute - open) * PX_PER_MIN }}
                    >
                      {dayjs().startOf('day').add(minute, 'minute').format('h A')}
                    </div>
                  ))}
                </div>
              </div>

              {/* Columns */}
              {calendar.columns.map((column) => (
                <Column
                  key={column.id}
                  column={column}
                  open={open}
                  close={close}
                  height={height}
                  hours={hours}
                  date={date}
                  nowOffset={nowOffset}
                  canManage={canManage}
                  onSelect={setSelectedId}
                  onBook={(startAt) => setBooking({ staffId: groupBy === 'staff' ? column.id : undefined, startAt })}
                />
              ))}
            </div>
          </div>

          {calendar.unassigned.length > 0 ? (
            <div className="border-t border-stone-200 bg-amber-50/50 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-amber-800">
                {calendar.unassigned.length} service{calendar.unassigned.length === 1 ? '' : 's'} with nobody assigned
              </p>
              <div className="flex flex-wrap gap-2">
                {calendar.unassigned.map((line) => (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => setSelectedId(line.appointmentId)}
                    className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-ink hover:bg-amber-50"
                  >
                    {time(line.startAt)} · {line.service.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      )}

      {booking ? (
        <BookingModal
          open
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            void refetch();
          }}
          date={date}
          defaultStaffId={booking.staffId}
          defaultStartAt={booking.startAt}
          serviceGroups={serviceGroups}
          staff={staff}
          branchId={calendar.branch.id}
        />
      ) : null}

      {selectedId ? (
        <AppointmentDrawer
          appointmentId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void refetch()}
          canManage={canManage}
        />
      ) : null}
    </>
  );
}

function Column({
  column,
  open,
  close,
  height,
  hours,
  date,
  nowOffset,
  canManage,
  onSelect,
  onBook,
}: {
  column: CalendarColumn;
  open: number;
  close: number;
  height: number;
  hours: number[];
  date: string;
  nowOffset: number | null;
  canManage: boolean;
  onSelect: (id: string) => void;
  onBook: (startAt: string) => void;
}) {
  return (
    <div className="w-[190px] shrink-0 border-r border-stone-200 last:border-r-0">
      <div className="sticky top-0 z-10 flex h-11 items-center gap-2 border-b border-stone-200 bg-white px-3">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: column.colorHex ?? '#B03A6B' }} />
        <span className="truncate text-xs font-medium text-ink">{column.label}</span>
        <span className="ml-auto text-2xs text-ink-subtle">{column.appointments.length}</span>
      </div>

      <div className="relative bg-white" style={{ height }}>
        {/* Hour lines double as click targets for a quick booking. */}
        {hours.map((minute) => (
          <div
            key={minute}
            className="absolute inset-x-0 border-t border-stone-100"
            style={{ top: (minute - open) * PX_PER_MIN, height: 60 * PX_PER_MIN }}
          >
            {canManage && minute + 60 <= close ? (
              <button
                type="button"
                onClick={() => onBook(dayjs(`${date}T00:00:00`).add(minute, 'minute').toISOString())}
                className="group h-full w-full text-left"
                aria-label={`Book at ${dayjs().startOf('day').add(minute, 'minute').format('h:mm A')}`}
              >
                <span className="hidden h-full w-full items-center justify-center text-2xs font-medium text-brand-600 group-hover:flex group-hover:bg-brand-50/50">
                  <Plus className="h-3 w-3" />
                </span>
              </button>
            ) : null}
          </div>
        ))}

        {nowOffset !== null && nowOffset >= 0 && nowOffset <= height ? (
          <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowOffset }}>
            <div className="relative h-px bg-rose-500">
              <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-rose-500" />
            </div>
          </div>
        ) : null}

        {column.appointments.map((line) => {
          const top = (toMinutes(line.startAt) - open) * PX_PER_MIN;
          const blockHeight = Math.max(line.durationMin * PX_PER_MIN, 22);
          const status = line.appointment.status;
          const customerName = line.appointment.customer
            ? fullName(line.appointment.customer)
            : (line.appointment.walkInName ?? 'Walk-in');

          return (
            <button
              key={line.id}
              type="button"
              onClick={() => onSelect(line.appointmentId)}
              className={cn(
                'absolute inset-x-1 z-[5] overflow-hidden rounded-md border-l-4 px-2 py-1 text-left shadow-sm transition-shadow hover:shadow-pop',
                STATUS_STYLES[status] ?? STATUS_STYLES.BOOKED,
              )}
              style={{ top, height: blockHeight }}
            >
              <span className="block truncate text-2xs font-semibold">{customerName}</span>
              {blockHeight > 34 ? (
                <span className="block truncate text-2xs opacity-80">{line.service.name}</span>
              ) : null}
              {blockHeight > 52 ? (
                <span className="tnum block truncate text-2xs opacity-70">
                  {time(line.startAt)} · {duration(line.durationMin)}
                </span>
              ) : null}
            </button>
          );
        })}

        {column.appointments.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-8">
            <span className="flex items-center gap-1.5 text-2xs text-ink-subtle">
              <CalendarDays className="h-3 w-3" />
              Free all day
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
