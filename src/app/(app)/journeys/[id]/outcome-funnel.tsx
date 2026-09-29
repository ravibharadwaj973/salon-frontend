'use client';

import { count, money } from '@/lib/format';

/**
 * DID THIS AUTOMATION BRING ANYBODY BACK?
 *
 * The page could already say how many messages went out, how many were read,
 * and what they cost. None of that answers the only question a salon owner is
 * really asking — and a campaign has been able to answer it all along.
 *
 * ── Why bars and not a funnel graphic ─────────────────────────────────────
 *
 * The four numbers are nested subsets of ONE quantity: everyone reached, then
 * the ones who noticed, then the ones who booked, then the ones who came in.
 * A tapering funnel shape encodes that with area, and area is the hardest
 * thing on a page to compare accurately — a stage half as tall looks a quarter
 * as big. Bars from a common baseline encode it with length, which is the
 * comparison people read best, and the taper is still plainly visible because
 * each stage is a subset of the one above.
 *
 * Kept in FUNNEL ORDER, never sorted by size. The order is the meaning: out of
 * order these are four unrelated counts.
 *
 * ── Why revenue is not a fifth bar ────────────────────────────────────────
 *
 * It is rupees, and the others are people. Putting both on one axis needs two
 * scales, and a chart with two y-axes can be made to show any relationship the
 * author wants — including one that is not there. So revenue is a figure next
 * to the bars, sharing nothing but the card.
 *
 * ── One hue, no legend ───────────────────────────────────────────────────
 *
 * One series measuring one thing. A second colour would have to mean
 * something, and there is nothing here for it to mean; the heading names the
 * series, so a legend box would only repeat it.
 */

// The app's validated single hue — the same one the activity chart uses.
// Clears 3:1 against the card surface.
const FILL = '#2a78d6';

interface Outcomes {
  reached: number;
  engaged: number;
  booked: number;
  visited: number;
  revenue: number;
  windowDays: number;
}

export function OutcomeFunnel({ outcomes }: { outcomes: Outcomes }) {
  const stages = [
    {
      key: 'reached',
      label: 'Reached',
      value: outcomes.reached,
      note: 'Customers this automation actually messaged',
    },
    {
      key: 'engaged',
      label: 'Noticed it',
      value: outcomes.engaged,
      note: 'Opened, read or replied to any message in the sequence',
    },
    {
      key: 'booked',
      label: 'Booked',
      value: outcomes.booked,
      note: 'Made a booking within the window',
    },
    {
      key: 'visited',
      label: 'Came in',
      value: outcomes.visited,
      note: 'Paid a bill within the window',
    },
  ];

  /**
   * Every bar is measured against the top of the funnel, not against the stage
   * above it. Rescaling each stage to its predecessor makes a 2-out-of-500
   * bottom stage look like a wide bar, which is the single most flattering and
   * most dishonest thing a funnel chart can do.
   */
  const top = Math.max(outcomes.reached, 1);

  if (outcomes.reached === 0) {
    return (
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink">What came of it</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Nothing has been sent in this period, so there is nothing to attribute yet. Numbers appear once the
          automation has messaged somebody.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">What came of it</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Counted once per customer, within {outcomes.windowDays} days of their last message.
          </p>
        </div>

        {/* Rupees, deliberately away from the bars — see the note above. */}
        <div className="text-right">
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">Billed after</p>
          <p className="text-xl font-semibold tabular-nums text-ink">{money(outcomes.revenue)}</p>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {stages.map((stage) => {
          const pct = Math.round((stage.value / top) * 100);
          return (
            <li key={stage.key} title={stage.note}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium text-ink">{stage.label}</span>
                {/* Direct labels on all four: the values are the point, and
                    four numbers do not crowd anything. Text wears ink tokens,
                    never the series colour. */}
                <span className="tabular-nums text-ink-muted">
                  {count(stage.value)}
                  {stage.key !== 'reached' ? (
                    <span className="ml-1.5 text-ink-subtle">{pct}%</span>
                  ) : null}
                </span>
              </div>
              <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-100"
                role="img"
                aria-label={`${stage.label}: ${stage.value} of ${outcomes.reached} (${pct}%)`}
              >
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${Math.max(pct, stage.value > 0 ? 1.5 : 0)}%`, backgroundColor: FILL }}
                />
              </div>
              <p className="mt-1 text-2xs leading-relaxed text-ink-subtle">{stage.note}</p>
            </li>
          );
        })}
      </ul>

      {/**
        * The caveat belongs on the card, not in a doc nobody opens.
        *
        * A customer who was coming anyway still books inside the window and
        * still counts here. Saying so is what keeps the number useful: an
        * owner who believes it means "bookings this automation caused" will
        * eventually compare it with reality and stop trusting the whole page.
        */}
      <p className="mt-4 border-t border-stone-100 pt-3 text-2xs leading-relaxed text-ink-subtle">
        These are customers who came back after being messaged — not proof the message is why. Somebody already
        planning a visit is counted too.
      </p>
    </section>
  );
}
