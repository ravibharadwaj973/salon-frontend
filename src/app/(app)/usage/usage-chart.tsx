'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { count } from '@/lib/format';
import type { MonthUsage } from '@/lib/types';

/**
 * MESSAGES SENT EACH MONTH, SPLIT BY CHANNEL.
 *
 * ── Why stacked, and why three series rather than five ──────────────────
 *
 * Two questions are being asked at once: how much did we send in total, and
 * what was it made of. A stacked column answers both — the column height is the
 * month, the segments are the split — where grouped columns answer the second
 * well and the first not at all.
 *
 * The app meters WhatsApp as three separate things (utility, marketing,
 * authentication) because they cost differently, and all five are in the table
 * below. The chart shows three: WhatsApp, SMS, Email. Five series is at the
 * point where a reader starts checking the legend instead of reading the chart,
 * and "which channel" is the question somebody actually brings to this picture.
 * The cost split is a numbers question, and numbers belong in the table.
 *
 * ── What is NOT on this chart ───────────────────────────────────────────
 *
 * Money. It would need a second y-axis, and a chart with two scales lets you
 * draw any relationship you like between them by choosing where the axes start
 * — the single most misleading thing a chart can do. Spend is a column in the
 * table and a figure above it, on its own terms.
 */

/**
 * The house series order, extended by one.
 *
 * Orange and blue are already slots one and two in the reports charts, so the
 * salon sees the same two colours meaning "first measure, second measure"
 * wherever they look. Aqua is the third slot from the validated categorical
 * palette. Checked together for colour-blind separation: the worst adjacent
 * pair is aqua against blue at ΔE 23 under protanopia, comfortably clear.
 *
 * Aqua sits slightly under 3:1 against white, which is why this chart is never
 * the only way to read the number — there is a legend, and the table below
 * carries every figure exactly.
 */
const SERIES = [
  { key: 'whatsapp', label: 'WhatsApp', color: '#EA580C' },
  { key: 'sms', label: 'SMS', color: '#2a78d6' },
  { key: 'email', label: 'Email', color: '#1baf7a' },
] as const;

const GRID = '#E7E5E4';
const AXIS_TEXT = '#78716C';

interface Row {
  month: string;
  whatsapp: number;
  sms: number;
  email: number;
  total: number;
}

function toRows(history: MonthUsage[]): Row[] {
  // Oldest first: the API returns newest first because that is what a table
  // wants, and time on an axis runs left to right.
  return [...history].reverse().map((month) => {
    const at = (meter: string) => month.meters.find((m) => m.meter === meter)?.used ?? 0;
    const whatsapp = at('WA_UTILITY') + at('WA_MARKETING') + at('WA_AUTHENTICATION');
    const sms = at('SMS');
    const email = at('EMAIL');
    return {
      // "Sep" plus a two-digit year only in January, so a twelve-month run does
      // not repeat the year on every tick.
      month: month.label.startsWith('January')
        ? `${month.label.slice(0, 3)} ’${month.label.slice(-2)}`
        : month.label.slice(0, 3),
      whatsapp,
      sms,
      email,
      total: whatsapp + sms + email,
    };
  });
}

export function UsageChart({ history }: { history: MonthUsage[] }) {
  const rows = toRows(history);
  const anything = rows.some((row) => row.total > 0);

  if (!anything) {
    return (
      <p className="px-5 py-10 text-center text-xs text-ink-subtle">
        No messages have been sent yet. This fills in as you start using WhatsApp, SMS or email.
      </p>
    );
  }

  return (
    <div className="px-2 py-4">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {/**
            * Horizontal rules only, solid, one shade off the card.
            *
            * Solid rather than the dashed grid the reports charts use: dashing
            * adds noise and, worse, carries a meaning — a dashed line on a chart
            * reads as a projection or a threshold, and this is neither.
            */}
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={{ stroke: GRID }}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            tickFormatter={(value: number) => count(value)}
          />
          <Tooltip
            cursor={{ fill: 'rgba(28,25,23,0.04)' }}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #E7E5E4',
              fontSize: 12,
              boxShadow: '0 8px 24px -12px rgba(28,25,23,0.2)',
            }}
            formatter={(value: number, name: string) => [count(value), name]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            /**
             * The label is ink; the dot beside it carries the identity.
             *
             * Recharts colours legend text with the series colour by default,
             * which puts three differently-coloured words under the chart and
             * makes one of them — the lightest — harder to read than the other
             * two. Colour belongs on the mark. Text is text.
             */
            formatter={(value: string) => <span style={{ color: AXIS_TEXT }}>{value}</span>}
          />
          {SERIES.map((series, index) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              stackId="messages"
              fill={series.color}
              maxBarSize={28}
              /**
               * A hairline of the card's own white between segments, so two
               * adjacent fills read as two things rather than one gradient. The
               * rounded top goes on the last series only — it is the top of the
               * stack, and rounding every segment would put a curve in the
               * middle of a column.
               */
              stroke="#ffffff"
              strokeWidth={2}
              radius={index === SERIES.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
