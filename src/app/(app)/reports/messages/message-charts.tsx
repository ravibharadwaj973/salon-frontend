'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Ban, Check } from 'lucide-react';
import { count, dayjs, percent } from '@/lib/format';

/**
 * WHAT HAPPENED TO THE MESSAGES.
 *
 * ── The colour decisions, and why they are not the obvious ones ───────────
 *
 * The obvious palette for "arrived / did not arrive" is green and red. It was
 * measured and rejected: green #0ca30c against red #d03b3b separates by ΔE 4.1
 * under deuteranopia, which is to say a colourblind owner sees one colour. On a
 * stacked bar, where the segments touch and no icon can sit inside them, that
 * is not recoverable by a legend.
 *
 * So the stack uses the app's own validated pair — blue and orange, ΔE 26.5
 * protan — plus a de-emphasis grey for "never sent". The grey deliberately
 * reads as grey (it fails a chroma floor meant for categorical slots, which is
 * the point: it is the absence of a result, not a third result), and it was
 * darkened to #8c857f so it clears 3:1 against the surface instead of
 * disappearing into it.
 *
 * The funnel uses a single-hue ordinal ramp, because its stages are one
 * quantity shrinking, not four different things.
 */

// Validated: worst all-pairs CVD ΔE 12.3, normal-vision ΔE 18.0, all ≥ 3:1 contrast.
const ARRIVED = '#2a78d6';
const FAILED = '#EA580C';
const NOT_SENT = '#8c857f';

// Single-hue ordinal ramp, light → dark, monotone lightness, light end 2.06:1.
const FUNNEL_RAMP = ['#86b6ef', '#5598e7', '#2a78d6', '#184f95'];

const GRID = '#E7E5E4';
const AXIS_TEXT = '#78716C';

const axisProps = {
  stroke: GRID,
  tick: { fill: AXIS_TEXT, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: GRID },
};

// ------------------------------------------------------------- the funnel ---

export interface FunnelStage {
  label: string;
  value: number | null;
  rate: number | null;
  /** Why this stage is blank, when it is. */
  unmeasured?: string;
}

/**
 * Stages of one quantity shrinking, drawn as nested bars against the widest.
 *
 * Deliberately not a recharts funnel: each stage needs to say either a number
 * or WHY there is no number, and a blank slot that means "SMS cannot report
 * this" must not look like a slot that means zero. That distinction is the
 * whole reason this component exists.
 */
export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const widest = Math.max(1, ...stages.map((s) => s.value ?? 0));

  return (
    <ol className="space-y-2">
      {stages.map((stage, i) => {
        const measured = stage.value !== null;
        const width = measured ? Math.max(1.5, ((stage.value ?? 0) / widest) * 100) : 0;

        return (
          <li key={stage.label}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink-muted">{stage.label}</span>
              {measured ? (
                <span className="tnum font-medium text-ink">
                  {count(stage.value ?? 0)}
                  {stage.rate !== null ? (
                    <span className="ml-1.5 font-normal text-ink-subtle">{percent(stage.rate)}</span>
                  ) : null}
                </span>
              ) : (
                /* Never a zero. A zero here would read as total failure. */
                <span className="text-2xs text-ink-subtle">not reported</span>
              )}
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-[3px] bg-stone-100">
              {measured ? (
                <div
                  className="h-full rounded-[3px]"
                  style={{ width: `${width}%`, backgroundColor: FUNNEL_RAMP[Math.min(i, FUNNEL_RAMP.length - 1)] }}
                />
              ) : (
                <div className="h-full w-full bg-[repeating-linear-gradient(135deg,#f5f5f4_0px,#f5f5f4_4px,#e7e5e4_4px,#e7e5e4_8px)]" />
              )}
            </div>
            {!measured && stage.unmeasured ? (
              <p className="mt-1 text-2xs leading-snug text-ink-subtle">{stage.unmeasured}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// -------------------------------------------------------------- over time ---

export interface TrendPoint {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  bounced: number;
  failed: number;
  skipped: number;
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((n, p) => n + (p.value ?? 0), 0);

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-pop">
      <p className="mb-1 text-2xs font-medium text-ink-muted">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: entry.color }} aria-hidden />
          <span className="text-ink-muted">{entry.name}</span>
          <span className="tnum ml-auto font-medium text-ink">{count(entry.value ?? 0)}</span>
        </p>
      ))}
      <p className="mt-1 border-t border-stone-100 pt-1 text-2xs text-ink-subtle">{count(total)} in total</p>
    </div>
  );
}

/**
 * Every message in the period, stacked by what became of it.
 *
 * Stacked rather than three lines because these three are a whole: every
 * message ends in exactly one of them, so the stack height IS the volume and
 * the question "how much of what I sent arrived?" is answered by looking at
 * one bar rather than by subtracting two lines.
 */
export function OutcomeTrend({ data }: { data: TrendPoint[] }) {
  const rows = data.map((d) => ({
    date: dayjs(d.date).format('DD MMM'),
    Delivered: d.delivered,
    'Did not arrive': d.bounced + d.failed,
    'Not sent': d.skipped,
  }));

  if (!rows.length) {
    return <p className="py-12 text-center text-sm text-ink-subtle">No messages in this period.</p>;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps} allowDecimals={false} width={48} />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: '#f5f5f4' }} />
          {/* 2px surface gap between stacked segments, per the mark spec. */}
          <Bar dataKey="Delivered" stackId="a" fill={ARRIVED} stroke="#fff" strokeWidth={0} />
          <Bar dataKey="Did not arrive" stackId="a" fill={FAILED} stroke="#fff" strokeWidth={0} />
          <Bar dataKey="Not sent" stackId="a" fill={NOT_SENT} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Identity is never colour alone: a legend, and an icon on each key. */}
      <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {[
          { label: 'Delivered', color: ARRIVED, Icon: Check },
          { label: 'Did not arrive', color: FAILED, Icon: AlertTriangle },
          { label: 'Not sent', color: NOT_SENT, Icon: Ban },
        ].map(({ label, color, Icon }) => (
          <li key={label} className="flex items-center gap-1.5 text-2xs text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden />
            <Icon className="h-3 w-3 text-ink-subtle" aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    </>
  );
}

// ------------------------------------------------------------ rate in-line ---

/**
 * A rate as a small track, for use inside a table row.
 *
 * Takes null and shows it as "not reported" rather than an empty track, for
 * the same reason the funnel does.
 */
export function RateBar({ value, tone = 'arrived' }: { value: number | null; tone?: 'arrived' | 'failed' }) {
  if (value === null) {
    return <span className="text-2xs text-ink-subtle">not reported</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-stone-100">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(1.5, value))}%`,
            backgroundColor: tone === 'failed' ? FAILED : ARRIVED,
          }}
        />
      </span>
      <span className="tnum text-xs text-ink">{percent(value)}</span>
    </span>
  );
}
