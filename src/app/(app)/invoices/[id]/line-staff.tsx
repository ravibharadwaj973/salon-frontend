'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { apiPatch, errorMessage } from '@/lib/client';
import { useToast } from '@/components/ui/overlay';
import { money } from '@/lib/format';
import type { Staff } from '@/lib/types';

/**
 * WHO PERFORMED THIS — CHANGEABLE AFTER THE BILL IS SAVED.
 *
 * The box on the till screen is optional and gets skipped at a busy counter, so
 * the state this is mostly here to fix is not a wrong name but no name: nobody
 * attached, no commission recorded, and nobody notices until a stylist's total
 * is short at the end of the month. Before this, the only remedy was to void the
 * bill and raise it again — a new invoice number and a gap in the series, to fix
 * a dropdown.
 *
 * So the empty state is loud and the filled one is quiet. An unattributed
 * service shows an amber prompt, because that is the case that silently costs
 * somebody money; a line that already names somebody looks like the text around
 * it until you go near it.
 *
 * The toast names the amount, always. Picking a name here moves real money
 * between two people's payslips, and a confirm dialog on every correction would
 * train people to dismiss it — saying what moved, after it moved, is both
 * honest and reversible.
 */
interface StaffChange {
  line: string;
  from: { staffId: string | null; name: string | null; commission: string };
  to: { staffId: string | null; name: string | null; commission: string };
}

export function LineStaff({
  invoiceId,
  itemId,
  current,
  staff,
  editable,
}: {
  invoiceId: string;
  itemId: string;
  current: { id: string; displayName: string } | null;
  staff: Staff[];
  editable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  /**
   * What the control shows while the server catches up. Without it the select
   * snaps back to the old name for as long as the refresh takes, which reads as
   * "it did not work" and invites a second click.
   */
  const [shown, setShown] = useState(current?.id ?? '');

  /**
   * The person already on the line stays in the list even if they have left the
   * salon. The staff list is filtered to active people — correctly, for picking
   * somebody new — but a bill from three months ago may well name somebody who
   * has since gone, and dropping them from the options would make the select
   * display an empty box over a line that is actually attributed.
   */
  const options = current && !staff.some((member) => member.id === current.id)
    ? [...staff, { id: current.id, displayName: `${current.displayName} (no longer here)` } as Staff]
    : staff;

  if (!editable) {
    return current ? <p className="mt-0.5 text-2xs text-ink-subtle">{current.displayName}</p> : null;
  }

  async function save(staffId: string) {
    const previous = shown;
    setShown(staffId);
    setSaving(true);
    try {
      const { change } = await apiPatch<{ change: StaffChange | null }>(
        `invoices/${invoiceId}/items/${itemId}/staff`,
        { staffId: staffId || null },
      );
      if (change) toast.success(describe(change));
      startTransition(() => router.refresh());
    } catch (error) {
      setShown(previous);
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || pending;

  return (
    <div className="mt-1">
      {/* The printed bill gets the name as plain text — a dropdown prints as a
          box with a chevron in it. */}
      <span className="hidden text-2xs text-ink-subtle print:inline">{current?.displayName ?? ''}</span>

      <label className="inline-flex items-center gap-1 print:hidden">
        <span className="sr-only">Who performed {current ? 'this' : 'this service'}?</span>
        <UserRound className={`h-3 w-3 shrink-0 ${shown ? 'text-ink-subtle' : 'text-amber-600'}`} />
        <select
          value={shown}
          disabled={busy || options.length === 0}
          onChange={(event) => save(event.target.value)}
          className={`h-6 max-w-[180px] rounded-md border px-1.5 text-2xs disabled:opacity-60 ${
            shown
              ? 'border-transparent bg-transparent text-ink-muted hover:border-stone-300 hover:bg-white'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          {/* Naming the consequence rather than the field. "Nobody — no
              commission" is the thing the front desk needs to know; "Select
              staff" is not. */}
          <option value="">{options.length === 0 ? 'No staff to pick from' : 'Nobody — no commission'}</option>
          {options.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** What actually moved, in one line. */
function describe(change: StaffChange): string {
  const earned = Number(change.to.commission);
  const lost = Number(change.from.commission);
  const name = change.to.name;
  const was = change.from.name;

  if (!name) {
    return was
      ? `${was} taken off ${change.line}${lost > 0 ? ` — ${money(lost)} of commission removed` : ''}`
      : `${change.line} left unattributed`;
  }
  if (was) {
    return earned > 0 || lost > 0
      ? `${change.line} moved from ${was} to ${name} — ${money(lost)} off ${was}, ${money(earned)} to ${name}`
      : `${change.line} moved from ${was} to ${name}`;
  }
  return earned > 0
    ? `${change.line} credited to ${name} — ${money(earned)} commission`
    : `${change.line} credited to ${name} — no commission on their arrangement`;
}
