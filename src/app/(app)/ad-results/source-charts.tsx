'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART, TooltipCard, axisProps } from '@/components/ui/chart';
import { money, moneyCompact } from '@/lib/format';
import type { SourceResult } from './types';

/**
 * ONE CHART, ONE QUESTION: for each thing the salon promoted, what did it cost
 * and what came back.
 *
 * Both measures are rupees, so they share an axis -- which is why this is a
 * legitimate two-series chart and not the dual-axis mistake. Spend in blue and
 * revenue in orange against a common scale means the comparison is the bar
 * LENGTH, read at a glance, with no mental arithmetic between two y-scales.
 *
 * Horizontal bars because the category labels are names a salon typed
 * ("Diwali reel", "Bridal package story") and those do not fit under a vertical
 * bar without being turned sideways or cut to initials.
 *
 * Deliberately NOT here: a second chart ranking cost per booking. It would
 * re-plot these same categories in a different order, which is how a useful
 * screen turns into a wall of bars. The table below carries it as a column,
 * costing no extra ink and sortable by eye.
 */
export function SpendVsReturn({ rows }: { rows: SourceResult[] }) {
  const top = [...rows].sort((a, b) => b.revenue - a.revenue || b.spend - a.spend).slice(0, 8);

  /*
   * 30 characters is what a 160px axis holds across the two lines recharts
   * wraps a tick into. The first cut at this was 24 and it rendered "Bridal
   * package story se..." and "Flyer QR at the metro g..." -- close enough to
   * each other that a salon running several stories could not tell which bar
   * was which, which is the whole job of the label.
   */
  const data = top.map((row) => ({
    name: row.name.length > 30 ? `${row.name.slice(0, 29)}…` : row.name,
    spend: row.spend,
    revenue: row.revenue,
  }));

  /** Anything still cut on the axis comes back whole on hover. */
  const fullName = new Map(data.map((row, index) => [row.name, top[index]!.name]));

  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-subtle">
        Nothing to compare yet. Add a promotion and share its link.
      </p>
    );
  }

  const everythingZero = data.every((row) => row.spend === 0 && row.revenue === 0);
  if (everythingZero) {
    return (
      <p className="py-12 text-center text-sm text-ink-subtle">
        No spend recorded and nothing billed in this period yet.
      </p>
    );
  }

  return (
    <>
      {/* 54px a row keeps the pair of bars and the gap between groups legible
          however many promotions are running; a fixed height would squash them. */}
      <ResponsiveContainer width="100%" height={data.length * 54 + 48}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 0, left: 4 }}
          barGap={2}
          barCategoryGap="28%"
        >
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={(value: number) => moneyCompact(value)} />
          <YAxis type="category" dataKey="name" {...axisProps} width={160} interval={0} />
          <Tooltip
            cursor={{ fill: 'rgba(120,113,108,0.06)' }}
            labelFormatter={(value: string) => fullName.get(value) ?? value}
            content={<TooltipCard formatter={(value) => money(value)} />}
          />
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => <span style={{ color: CHART.axisText, fontSize: 12 }}>{value}</span>}
          />
          {/* Spend first so it reads cost-then-return, left to right in the
              legend and top-to-bottom within each group. */}
          <Bar dataKey="spend" name="Spent" fill={CHART.series2} radius={[0, 4, 4, 0]} maxBarSize={14} />
          <Bar dataKey="revenue" name="Came back" fill={CHART.series1} radius={[0, 4, 4, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-ink-subtle">
        A promotion with no blue bar is one you did not pay for. Only the eight best are charted &mdash; the table has
        them all.
      </p>
    </>
  );
}
