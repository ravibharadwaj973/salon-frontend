'use client';

import { useEffect, useState } from 'react';
import { Plus, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * WHO PERFORMED A SERVICE — ONE NAME, OR THREE.
 *
 * Two stylists on one bridal makeup is ordinary, and until now a bill could hold
 * one of them. The second did the work and earned nothing, because there was one
 * box to put them in.
 *
 * Shared between the till and the correction panel on a saved bill, which is the
 * whole reason it is a component rather than markup in both. They disagree about
 * what happens next — one edits a cart in memory, the other calls the API — and
 * they must not disagree about what the control looks like or what the order of
 * the names means.
 *
 * ORDER IS LOAD-BEARING. The first name is the primary performer: it is the one
 * written to invoice_items.staffId, which is what every report in the app reads,
 * and the one that takes the rounding remainder when the commission is split. So
 * the first slot is never a free-for-all — removing the first person promotes the
 * second rather than leaving a hole.
 *
 * Deliberately a native <select> per person rather than a custom menu. This is
 * used at a counter, often on a phone, often by somebody who is also talking to
 * the customer; the platform's own picker is the one their thumb already knows.
 */
export function StaffPicker({
  value,
  staff,
  onChange,
  max = 4,
  disabled = false,
  /** `bill` is the fuller treatment for the till; `quiet` recedes into a line of text. */
  tone = 'bill',
}: {
  value: string[];
  staff: { id: string; displayName: string }[];
  onChange: (next: string[]) => void;
  max?: number;
  disabled?: boolean;
  tone?: 'bill' | 'quiet';
}) {
  /**
   * An empty slot waiting to be filled, held here rather than as an empty string
   * in `value`. The parent only ever sees real names, so nothing downstream has
   * to strip blanks out before sending them — which is the kind of thing that
   * gets forgotten in one of the two callers.
   */
  const [adding, setAdding] = useState(false);

  // A line that loses its last name goes back to a single empty slot rather than
  // to nothing at all; an invisible control is one nobody can use.
  useEffect(() => {
    if (value.length === 0) setAdding(false);
  }, [value.length]);

  const slots: (string | null)[] = value.length === 0 ? [null] : adding ? [...value, null] : [...value];

  function setAt(index: number, staffId: string) {
    const next = [...value];
    if (!staffId) {
      // Blank means "take this person off". Removing the first promotes the
      // second to primary, which is what the salon means by it.
      next.splice(index, 1);
    } else if (index >= next.length) {
      next.push(staffId);
    } else {
      next[index] = staffId;
    }
    setAdding(false);
    onChange(next);
  }

  const canAdd = !disabled && !adding && value.length > 0 && value.length < max && staff.length > value.length;

  return (
    <div className={cn('flex flex-wrap items-center', tone === 'bill' ? 'gap-1.5' : 'gap-1')}>
      {slots.map((staffId, index) => {
        const empty = !staffId;
        // Nobody twice on one line: it would halve their own share and pay the
        // same total, which is not something anybody would read off a payslip.
        const taken = new Set(value.filter((_, i) => i !== index));
        const options = staff.filter((member) => !taken.has(member.id));
        const current = staff.find((member) => member.id === staffId);

        return (
          <span key={`${staffId ?? 'new'}-${index}`} className="inline-flex items-center">
            <UserRound
              className={cn(
                'mr-1 h-3 w-3 shrink-0',
                empty ? 'text-amber-600' : index === 0 ? 'text-brand-600' : 'text-ink-subtle',
              )}
            />
            <select
              value={staffId ?? ''}
              disabled={disabled}
              onChange={(event) => setAt(index, event.target.value)}
              aria-label={index === 0 ? 'Who performed this' : `Also performed by (${index + 1})`}
              className={cn(
                'h-7 rounded-md border px-1.5 text-2xs disabled:opacity-60',
                // An empty slot gets the room its label needs. Truncating the one
                // sentence that explains the consequence — to "Nobody — no
                // commi…" — defeats the point of writing it.
                empty ? 'max-w-[210px]' : 'max-w-[150px]',
                empty
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-transparent bg-transparent text-ink-muted hover:border-stone-300 hover:bg-white',
              )}
            >
              {/* The consequence, not the field. "Nobody — no commission" is
                  what the front desk needs to know; "Select staff" is not.
                  An empty slot ADDED beside existing names means something else
                  entirely — leaving it blank cancels rather than unassigning —
                  so it does not borrow that wording. */}
              <option value="">
                {empty
                  ? staff.length === 0
                    ? 'No staff to pick from'
                    : index === 0
                      ? 'Nobody — no commission'
                      : 'Who else?'
                  : index === 0 && value.length > 1
                    ? 'Remove — next person leads'
                    : 'Remove'}
              </option>
              {options.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
              {/* Somebody who has left is kept when they are already on the line.
                  A bill from three months ago is the one most likely to need
                  correcting, and dropping them would show an empty box over a
                  line that is in fact attributed. */}
              {staffId && !current ? <option value={staffId}>Someone no longer here</option> : null}
            </select>
          </span>
        );
      })}

      {adding ? (
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-2xs text-ink-subtle hover:text-ink"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      ) : null}

      {canAdd ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          title="Two people on one service split the commission between them"
          className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-stone-300 px-1.5 py-0.5 text-2xs text-ink-subtle hover:border-brand-300 hover:text-brand-700"
        >
          <Plus className="h-3 w-3" />
          Add staff
        </button>
      ) : null}

      {/* Said once, where the money changes. Somebody adding a second name is
          entitled to know it halves the first person's commission rather than
          doubling the salon's bill. */}
      {value.length > 1 ? (
        <span className="text-2xs text-ink-subtle">commission split {value.length} ways</span>
      ) : null}
    </div>
  );
}
