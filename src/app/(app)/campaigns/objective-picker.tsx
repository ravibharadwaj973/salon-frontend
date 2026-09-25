'use client';

import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { apiGet } from '@/lib/client';
import { Field, Select } from '@/components/ui/form';

export interface ObjectiveInfo {
  objective: string;
  label: string;
  description: string;
  suggestedWindowDays: number;
  rationale: string;
  suggestedEvents: string[];
}

export interface Attribution {
  objective: string;
  attributionWindowDays: number;
  conversionEvents: string[];
}

/**
 * WHAT THIS CAMPAIGN IS FOR, AND HOW LONG IT GETS CREDIT.
 *
 * The window is the whole argument. Too short and a campaign that worked looks
 * like it failed; too long and every visit a customer was going to make anyway
 * is credited to whatever message happened to land first. And the right length
 * follows from the objective rather than from the salon: somebody nudged about
 * tomorrow either comes tomorrow or does not, while somebody being won back
 * after eight months may take a month to act.
 *
 * So the objective fills the window, and the reason is shown next to it — the
 * number is a judgement the owner can argue with rather than a default nobody
 * questioned. Picking an objective never overrides a window already typed by
 * hand; it only pre-fills.
 */
export function ObjectivePicker({
  value,
  onChange,
}: {
  value: Attribution;
  onChange: (value: Attribution) => void;
}) {
  const [objectives, setObjectives] = useState<ObjectiveInfo[]>([]);
  const [windows, setWindows] = useState<number[]>([]);
  // Once the owner sets a window themselves, changing objective must not
  // silently overwrite it.
  const [windowTouched, setWindowTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ objectives: ObjectiveInfo[]; windowChoices: number[] }>('campaigns/objectives')
      .then((result) => {
        if (cancelled) return;
        setObjectives(result.objectives);
        setWindows(result.windowChoices);
      })
      .catch(() => {
        // The campaign is still sendable with the default window; only the
        // suggestions are lost.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = objectives.find((o) => o.objective === value.objective);

  function pickObjective(objective: string) {
    const info = objectives.find((o) => o.objective === objective);
    onChange({
      objective,
      attributionWindowDays:
        windowTouched || !info ? value.attributionWindowDays : info.suggestedWindowDays,
      conversionEvents: info && !windowTouched ? info.suggestedEvents : value.conversionEvents,
    });
  }

  const EVENTS: { key: string; label: string; help: string }[] = [
    { key: 'BOOKING', label: 'Booking', help: 'They made an appointment' },
    { key: 'VISIT', label: 'Visit', help: 'They actually came in' },
    { key: 'REVENUE', label: 'Revenue', help: 'What they spent' },
  ];

  function toggleEvent(key: string) {
    const has = value.conversionEvents.includes(key);
    const next = has ? value.conversionEvents.filter((e) => e !== key) : [...value.conversionEvents, key];
    // At least one, or the campaign is being measured on nothing at all.
    if (next.length === 0) return;
    onChange({ ...value, conversionEvents: next });
  }

  return (
    <div className="rounded-lg border border-stone-200 p-3">
      <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-ink-subtle">
        <Target className="h-3.5 w-3.5" />
        How this will be measured
      </p>

      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
        <Field label="What is this campaign for?">
          {({ id }) => (
            <Select id={id} value={value.objective} onChange={(e) => pickObjective(e.target.value)}>
              {objectives.length === 0 ? <option value={value.objective}>Loading…</option> : null}
              {objectives.map((o) => (
                <option key={o.objective} value={o.objective}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Count bookings and visits for" hint="after each delivery">
          {({ id }) => (
            <Select
              id={id}
              value={String(value.attributionWindowDays)}
              onChange={(e) => {
                setWindowTouched(true);
                onChange({ ...value, attributionWindowDays: Number(e.target.value) });
              }}
            >
              {(windows.includes(value.attributionWindowDays)
                ? windows
                : [...windows, value.attributionWindowDays].sort((a, b) => a - b)
              ).map((days) => (
                <option key={days} value={days}>
                  {days} {days === 1 ? 'day' : 'days'}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {chosen ? (
        <p className="mt-2 text-2xs leading-relaxed text-ink-muted">
          {chosen.description} {chosen.rationale}
        </p>
      ) : null}

      <fieldset className="mt-3">
        <legend className="text-2xs font-medium text-ink">Counts as working</legend>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {EVENTS.map((event) => (
            <label key={event.key} className="flex cursor-pointer items-start gap-1.5">
              <input
                type="checkbox"
                checked={value.conversionEvents.includes(event.key)}
                onChange={() => toggleEvent(event.key)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                <span className="block text-xs text-ink">{event.label}</span>
                <span className="block text-2xs text-ink-subtle">{event.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Said before the send, not discovered afterwards from a flattering
          total. A customer who comes every month will be credited to whichever
          campaign last landed in their window. */}
      <p className="mt-3 border-t border-stone-100 pt-2 text-2xs leading-relaxed text-ink-subtle">
        A longer window credits more visits, including ones that were going to happen anyway. After the window closes
        this campaign is also scored against the people who never opened it — if both groups came in at the same rate,
        the campaign did not cause the difference.
      </p>
    </div>
  );
}
