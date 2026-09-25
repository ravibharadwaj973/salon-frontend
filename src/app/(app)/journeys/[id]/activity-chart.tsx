'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { count, dayjs } from '@/lib/format';

/**
 * HOW OFTEN THIS AUTOMATION FIRES.
 *
 * The one chart a campaign has no use for, and the one an automation lives by.
 *
 * A campaign is a single moment: it was sent, and the only question left is
 * what became of it. An automation has no moment — it has a RATE, and the
 * failure it suffers from is not "the messages bounced" but "it quietly
 * stopped firing." That failure is invisible in every total: a birthday
 * journey that fired forty times a month until March and has fired twice since
 * still shows a healthy lifetime count and a 96% delivery rate, because the
 * two that went out arrived perfectly.
 *
 * So this is the shape, not the sum.
 *
 * ── Why these choices ─────────────────────────────────────────────────────
 *
 *  - BARS, NOT A LINE. A line interpolates between points, which asserts that
 *    something happened in between. Counts of discrete events on discrete days
 *    did not happen in between, and on a journey that fires in bursts the line
 *    invents a gentle slope across a week of silence.
 *  - ZERO-FILLED SERVER-SIDE, so a gap is drawn as a row of zeros rather than
 *    skipped. A sparse series joins 12 March straight to 2 April and three
 *    weeks of nothing reads as steady activity — the precise misreading this
 *    chart exists to prevent.
 *  - ONE HUE. One series, one quantity; a second colour would have to mean
 *    something, and there is nothing for it to mean. For the same reason there
 *    is no legend: the card title names the series.
 *  - NO Y-AXIS ZOOM. The axis starts at zero. A journey dropping from 40 to 2
 *    must look like a cliff, and a truncated axis would flatter it.
 */

// The app's validated single hue. Clears 3:1 against the card surface.
const RUNS = '#2a78d6';
const GRID = '#E7E5E4';
const AXIS_TEXT = '#78716C';

const axisProps = {
  stroke: GRID,
  tick: { fill: AXIS_TEXT, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: GRID },
};

export interface ActivityPoint {
  date: string;
  runs: number;
}

function ActivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: { fullDate?: string } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const runs = payload[0]?.value ?? 0;

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-pop">
      <p className="text-2xs font-medium text-ink-muted">{payload[0]?.payload?.fullDate ?? label}</p>
      <p className="tnum mt-0.5 text-sm font-semibold text-ink">
        {runs === 0 ? 'Did not fire' : `${count(runs)} ${runs === 1 ? 'customer' : 'customers'} entered`}
      </p>
    </div>
  );
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-subtle">Nothing to plot for this period.</p>;
  }

  const rows = data.map((point) => ({
    date: dayjs(point.date).format('DD MMM'),
    fullDate: dayjs(point.date).format('dddd, DD MMM YYYY'),
    Runs: point.runs,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" {...axisProps} interval="preserveStartEnd" minTickGap={28} />
        {/* allowDecimals off: half a run is not a thing, and recharts will
            happily label one otherwise on a journey that fires twice a month. */}
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip content={<ActivityTooltip />} cursor={{ fill: '#f5f5f4' }} />
        <Bar dataKey="Runs" fill={RUNS} radius={[3, 3, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
