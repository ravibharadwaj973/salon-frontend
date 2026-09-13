'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dayjs, money, moneyCompact, percent } from '@/lib/format';
import type { Money } from '@/lib/types';

/**
 * Chart palette — validated with the data-viz colour checks (lightness band,
 * chroma floor, CVD separation, normal-vision floor, contrast) against the light
 * surface, all pairs. Two categorical slots is all this app needs; anything more
 * folds into "Other" rather than inventing hues.
 */
const SERIES_1 = '#B03A6B'; // brand plum — the primary measure
const SERIES_2 = '#2a78d6'; // blue — the comparison measure
const GRID = '#E7E5E4';
const AXIS_TEXT = '#78716C';

const axisProps = {
  stroke: GRID,
  tick: { fill: AXIS_TEXT, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: GRID },
};

function TooltipCard({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string | number;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-pop">
      <p className="mb-1 text-2xs font-medium text-ink-muted">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey ?? entry.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
          <span className="text-ink-muted">{entry.name}</span>
          <span className="tnum ml-auto font-medium text-ink">
            {formatter ? formatter(Number(entry.value)) : String(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ revenue trend --

export function RevenueTrend({
  data,
}: {
  data: { period: string; revenue: Money; invoices: number; customers: number }[];
}) {
  const rows = data.map((row) => ({
    period: row.period.length === 7 ? dayjs(`${row.period}-01`).format('MMM YY') : dayjs(row.period).format('DD MMM'),
    revenue: Number(row.revenue),
  }));

  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-subtle">No revenue in this period.</p>;
  }

  return (
    // A single series: the card title names it, so no legend box is needed.
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axisProps} width={56} tickFormatter={(value: number) => moneyCompact(value)} />
        <Tooltip
          cursor={{ stroke: AXIS_TEXT, strokeWidth: 1, strokeDasharray: '3 3' }}
          content={<TooltipCard formatter={(value) => money(value)} />}
        />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={SERIES_1}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// -------------------------------------------------------- service revenue ----

export function ServiceRevenue({
  data,
}: {
  data: { name: string; revenue: Money; bookings: number; shareOfRevenuePct: number }[];
}) {
  const rows = data.slice(0, 8).map((row) => ({
    name: row.name.length > 22 ? `${row.name.slice(0, 21)}…` : row.name,
    revenue: Number(row.revenue),
    bookings: row.bookings,
  }));

  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-subtle">No services billed in this period.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 4 }} barCategoryGap={6}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(value: number) => moneyCompact(value)} />
        <YAxis type="category" dataKey="name" {...axisProps} width={150} />
        <Tooltip cursor={{ fill: 'rgba(28,25,23,0.04)' }} content={<TooltipCard formatter={(value) => money(value)} />} />
        <Bar dataKey="revenue" name="Revenue" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// -------------------------------------------------------------- branch P&L ---

export function BranchPnl({
  data,
}: {
  data: { branchName: string; revenue: Money; operatingProfit: Money }[];
}) {
  const rows = data.map((row) => ({
    name: row.branchName,
    revenue: Number(row.revenue),
    profit: Number(row.operatingProfit),
  }));

  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-subtle">No branch figures for this period.</p>;
  }

  return (
    // Two series of the same unit (₹) share one axis — never a second scale.
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barGap={2}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" {...axisProps} />
        <YAxis {...axisProps} width={56} tickFormatter={(value: number) => moneyCompact(value)} />
        <Tooltip cursor={{ fill: 'rgba(28,25,23,0.04)' }} content={<TooltipCard formatter={(value) => money(value)} />} />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: AXIS_TEXT }}
        />
        <Bar dataKey="revenue" name="Revenue" fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Bar dataKey="profit" name="Operating profit" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// --------------------------------------------------------- retention grid ----

/**
 * Cohort retention. Sequential single hue, light to dark, and every cell carries
 * its number — so the colour is a reading aid, never the only encoding.
 */
export function RetentionGrid({
  cohorts,
}: {
  cohorts: { cohort: string; size: number; periods: { monthOffset: number; retained: number; retentionPct: number }[] }[];
}) {
  if (cohorts.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-subtle">Not enough history yet for cohorts.</p>;
  }

  const months = Math.max(...cohorts.map((cohort) => cohort.periods.length));

  const shade = (pct: number): { background: string; color: string } => {
    if (pct <= 0) return { background: '#FAFAF9', color: '#A8A29E' };
    if (pct < 10) return { background: '#FDF2F6', color: '#63243E' };
    if (pct < 25) return { background: '#FCE7EF', color: '#63243E' };
    if (pct < 40) return { background: '#FACFDF', color: '#63243E' };
    if (pct < 60) return { background: '#F5A8C4', color: '#63243E' };
    if (pct < 80) return { background: '#EC739F', color: '#ffffff' };
    return { background: '#B03A6B', color: '#ffffff' };
  };

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">
          Percentage of each month&apos;s new customers who came back in the months that followed
        </caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium text-ink-muted">
              Cohort
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium text-ink-muted">
              Size
            </th>
            {Array.from({ length: months }, (_, index) => (
              <th key={index} scope="col" className="px-2 py-1.5 text-center font-medium text-ink-muted">
                M{index}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.cohort}>
              <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-ink">
                {dayjs(`${cohort.cohort}-01`).format('MMM YYYY')}
              </th>
              <td className="tnum px-2 py-1.5 text-right text-ink-muted">{cohort.size}</td>
              {Array.from({ length: months }, (_, index) => {
                const period = cohort.periods[index];
                if (!period) return <td key={index} className="px-2 py-1.5" />;
                const style = shade(period.retentionPct);
                return (
                  <td
                    key={index}
                    className="tnum rounded px-2 py-1.5 text-center font-medium"
                    style={style}
                    title={`${period.retained} of ${cohort.size} customers returned`}
                  >
                    {percent(period.retentionPct, 0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Small inline bar used inside tables, where a full chart would be noise. */
export function MiniBar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'blue' }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
      <div
        className="h-full rounded-full"
        style={{ width: `${width}%`, backgroundColor: tone === 'brand' ? SERIES_1 : SERIES_2 }}
      />
    </div>
  );
}

export { SERIES_1, SERIES_2 };
export { Cell };
