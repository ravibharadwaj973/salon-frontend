import { count, percent } from '@/lib/format';

/**
 * WHERE A CAMPAIGN LOSES PEOPLE.
 *
 * The stat tiles above say what each number is. They cannot say where the
 * campaign leaks, and that is the only question worth asking of a send: 500
 * targeted and 18 bookings is a fact, but 500 → 470 → 455 → 280 → 65 → 18
 * tells the salon that the message was delivered fine and simply was not
 * interesting, which is a different problem from a broken number list.
 *
 * Design decisions, and why:
 *
 *  - ONE HUE, not seven. The job of this data is magnitude along a single
 *    ordered sequence, and bar length already carries it. Giving each stage
 *    its own colour would imply the stages are different KINDS of thing —
 *    the rainbow that makes a chart look designed and read worse.
 *  - Every bar is measured against the widest one, so the shape of the
 *    drop-off is visible at a glance rather than having to be worked out from
 *    seven numbers of different lengths.
 *  - The drop between stages is stated, because that is what somebody is
 *    actually reading for, and mental arithmetic between two bars is exactly
 *    the work a chart exists to remove.
 *  - Stages that cannot apply are left out rather than shown as zero. SMS has
 *    no read receipt; an email cannot be replied to here. A row of zeros reads
 *    as failure when it means "not measurable on this channel".
 */

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  /** Said under the label when the number needs a caveat. */
  note?: string;
  /**
   * True for a stage every later stage must pass through: targeted → sent →
   * delivered → read. False for an outcome that people reach independently.
   *
   * This distinction is the difference between a useful chart and a lying one.
   * Clicking, replying and booking are NOT sequential — a customer can reply
   * without clicking a link, and can book by phone having done neither. Shown
   * as a chain, "65 replied" against "96 clicked" reads as 68%, when the honest
   * figure is 65 of the 455 who received it: 14%. A salon that believes the
   * first number will conclude its message worked five times better than it did.
   */
  sequential?: boolean;
  /**
   * Of the people who did not reach this stage, how many are UNKNOWN rather
   * than lost.
   *
   * The distinction the chart could not make, and the one that matters most.
   * A campaign showing
   *
   *     Sent 4 · Delivered 0 · 4 did not get this far
   *
   * was asserting four failures. What had happened is that WhatsApp accepted
   * all four and never sent a status callback, so the app knows nothing about
   * them either way. Those are opposite conclusions — one says the numbers are
   * wrong, the other says the webhook is not wired up — and a salon acts very
   * differently on each.
   *
   * Zero is a measurement. This is the absence of one, and it is drawn
   * differently so the two can never be read as the same thing.
   */
  unreported?: number;
}

export function CampaignFunnel({ stages }: { stages: FunnelStage[] }) {
  const rows = stages.filter((stage) => stage.value !== null && stage.value !== undefined);
  if (rows.length === 0) return null;

  const top = Math.max(...rows.map((r) => r.value), 1);

  /**
   * Outcomes are measured against the last stage everyone had to pass through
   * — you cannot click a link in a message you never opened.
   *
   * The label names that stage rather than assuming it, because which one it
   * is depends on the channel: WhatsApp reports a read receipt, SMS reports
   * nothing past delivery. A percentage whose denominator is not stated is a
   * percentage nobody can check.
   */
  const anchor = [...rows].reverse().find((r) => r.sequential);
  const reached = anchor?.value ?? top;
  const anchorLabel = (anchor?.label ?? 'delivered').toLowerCase();

  return (
    <div className="space-y-2.5">
      {rows.map((stage, index) => {
        const previousSequential =
          stage.sequential && index > 0 ? rows[index - 1]!.value : null;

        // A sequential stage is measured against the one before it, because
        // that is the drop being asked about. An outcome is measured against
        // everyone who received the message, because that is the only honest
        // denominator for something people reach independently.
        const base = stage.sequential ? previousSequential : reached;
        const share = base && base > 0 ? (stage.value / base) * 100 : null;

        // Only a real chain can lose people. An outcome has no "did not get
        // this far" — not clicking is not a failure to arrive somewhere.
        const lost = stage.sequential && previousSequential !== null ? previousSequential - stage.value : 0;

        // Of that shortfall, the part nobody has heard anything about. Capped
        // at the shortfall so a late receipt can never make the note nonsense.
        const unknown = Math.min(stage.unreported ?? 0, Math.max(lost, 0));
        const reallyLost = Math.max(lost - unknown, 0);

        return (
          <div key={stage.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-ink">
                {stage.label}
                {stage.note ? <span className="ml-1.5 text-2xs font-normal text-ink-subtle">{stage.note}</span> : null}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="tnum text-sm font-semibold text-ink">{count(stage.value)}</span>
                {/* A rate computed over messages nobody has heard back about
                    is not a rate. "0%" next to four unacknowledged sends reads
                    as total failure, which is the opposite of "we don't know". */}
                {share !== null && unknown === 0 ? (
                  <span className="tnum text-2xs text-ink-subtle">
                    {percent(share, 0)}
                    {stage.sequential ? '' : ` of ${anchorLabel}`}
                  </span>
                ) : unknown > 0 ? (
                  <span className="text-2xs text-ink-subtle">not reported</span>
                ) : null}
              </span>
            </div>

            {/* The track is the full width, so a short bar reads as a loss
                rather than simply as a small number. Where the shortfall is
                unknown rather than lost, the unknown part is hatched: it must
                not read as an empty bar, which means zero. */}
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full bg-brand-500"
                style={{ width: `${Math.max((stage.value / top) * 100, stage.value > 0 ? 1.5 : 0)}%` }}
              />
              {unknown > 0 ? (
                <div
                  className="h-full bg-[repeating-linear-gradient(135deg,#e7e5e4_0px,#e7e5e4_3px,#f5f5f4_3px,#f5f5f4_6px)]"
                  style={{ width: `${(unknown / top) * 100}%` }}
                />
              ) : null}
            </div>

            {/* Never "did not get this far" for a message nobody has heard
                back about. That sentence is a claim, and it would be false. */}
            {unknown > 0 ? (
              <p className="mt-1 text-2xs text-ink-subtle">
                No delivery receipt yet for {count(unknown)}
                {reallyLost > 0 ? ` · ${count(reallyLost)} did not get this far` : ''}
              </p>
            ) : reallyLost > 0 ? (
              <p className="mt-1 text-2xs text-ink-subtle">{count(reallyLost)} did not get this far</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
