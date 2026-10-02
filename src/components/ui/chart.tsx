'use client';

/**
 * THE ONE PLACE THE CHART COLOURS LIVE.
 *
 * These five values were copy-pasted into four separate chart files before this
 * module existed, which is the exact failure the palette comment in each of
 * them warned about: the pair is only safe because it was *checked*, and a
 * checked pair that exists in four copies is a pair somebody will eventually
 * change in one of them. Two hues that look different to you can be the same
 * colour to a colourblind salon owner reading their own takings.
 *
 * Validated against the light chart surface, all adjacent pairs:
 *
 *   lightness band        PASS  both inside L 0.43-0.77
 *   chroma floor          PASS  both >= 0.1
 *   CVD separation        PASS  dE 26.5 protanopia, 34.4 tritanopia
 *   normal-vision floor   PASS  dE 34.8
 *   contrast vs surface   PASS  both >= 3:1
 *
 * Changing either hue means running the checker again. Adding a third means
 * running it on all three pairs -- and if a screen needs more than three, the
 * answer is small multiples or an "Other" bucket, never a generated hue.
 */
export const CHART = {
  /** The primary measure -- the one the card title is about. Brand orange. */
  series1: '#EA580C',
  /** The comparison measure. Blue. */
  series2: '#2a78d6',
  /** Recessive gridlines. Never darker than the marks. */
  grid: '#E7E5E4',
  /** Axis and legend text. A text token, never a series colour. */
  axisText: '#78716C',
} as const;

/** Spread onto XAxis/YAxis so every chart in the app has the same recessive axes. */
export const axisProps = {
  stroke: CHART.grid,
  tick: { fill: CHART.axisText, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

export interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

/**
 * The hover layer. An HTML chart IS interactive, so this ships by default
 * rather than on request -- a bar whose value you can only guess at from the
 * axis is a bar that gets misread.
 *
 * `format` is per-series rather than per-chart so a card can mix money and
 * counts in one tooltip, which the funnel charts need.
 */
export function TooltipCard({
  active,
  payload,
  label,
  formatter,
  format,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatter?: (value: number) => string;
  format?: Record<string, (value: number) => string>;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-pop">
      <p className="mb-1 text-2xs font-medium text-ink-muted">{label}</p>
      {payload.map((entry) => {
        const key = String(entry.dataKey ?? entry.name ?? '');
        const fmt = format?.[key] ?? formatter;
        return (
          <p key={key} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
            <span className="text-ink-muted">{entry.name}</span>
            <span className="tnum ml-auto font-medium text-ink">
              {fmt ? fmt(Number(entry.value)) : String(entry.value)}
            </span>
          </p>
        );
      })}
    </div>
  );
}
