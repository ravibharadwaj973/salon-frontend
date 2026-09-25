'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { dayjs } from '@/lib/format';

/**
 * WHICH DAY THE DASHBOARD IS SHOWING.
 *
 * The dashboard only ever showed today, so "how did Saturday go?" meant going
 * to Reports and building a range for a single day.
 *
 * The part worth explaining is the floor. Days before the salon's account
 * existed are not selectable — not because asking is dangerous, but because the
 * answer would be a screenful of zeros, and zeros are indistinguishable from a
 * terrible day. An owner scrolling back through January would find a wall of
 * empty dashboards with no way to tell "we took nothing" from "we did not exist
 * yet". So those dates are greyed out in the calendar and the arrow stops,
 * which answers the question before it is asked.
 *
 * `min` and `max` on a native date input is what greys them: the browser's own
 * calendar refuses them, on a phone as well as a desktop, with no JavaScript
 * and no custom calendar to keep accessible. The server clamps anyway, because
 * a hand-typed URL is not bound by the widget.
 */
export function DayPicker({
  date,
  earliest,
  latest,
}: {
  date: string;
  earliest: string;
  latest: string;
}) {
  const router = useRouter();

  const current = dayjs(date);
  const previous = current.subtract(1, 'day');
  const next = current.add(1, 'day');

  const canGoBack = !previous.isBefore(dayjs(earliest), 'day');
  const canGoForward = !next.isAfter(dayjs(latest), 'day');
  const isToday = current.isSame(dayjs(latest), 'day');

  const go = (value: string) => router.push(value === latest ? '/' : `/?date=${value}`);

  const arrow = 'flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-ink-muted';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-label="Previous day"
        disabled={!canGoBack}
        onClick={() => go(previous.format('YYYY-MM-DD'))}
        className={cn(arrow, canGoBack ? 'hover:text-ink' : 'cursor-not-allowed opacity-40')}
        // Says why rather than simply refusing to move.
        title={canGoBack ? previous.format('ddd D MMM') : 'Your account starts here — there is nothing before this day'}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <input
        type="date"
        value={date}
        min={earliest}
        max={latest}
        onChange={(e) => e.target.value && go(e.target.value)}
        aria-label="Show a different day"
        className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm text-ink shadow-sm"
      />

      <button
        type="button"
        aria-label="Next day"
        disabled={!canGoForward}
        onClick={() => go(next.format('YYYY-MM-DD'))}
        className={cn(arrow, canGoForward ? 'hover:text-ink' : 'cursor-not-allowed opacity-40')}
        title={canGoForward ? next.format('ddd D MMM') : 'That day has not happened yet'}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {!isToday ? (
        <button
          type="button"
          onClick={() => go(latest)}
          className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-ink-muted hover:text-ink"
        >
          Today
        </button>
      ) : null}
    </div>
  );
}
