'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import { apiPatch, errorMessage } from '@/lib/client';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { StaffPicker } from '@/components/staff-picker';
import { useToast } from '@/components/ui/overlay';
import { money } from '@/lib/format';
import type { InvoiceItem, Staff } from '@/lib/types';

/**
 * WHO PERFORMED THESE — KEPT OFF THE BILL.
 *
 * This used to sit inside the invoice itself, under each line. It does not any
 * more, and the reason is the only one that matters: the card above is the
 * document the customer is handed and prints as-is. A stylist's name on it is
 * the salon's internal business — who earns what — and it has no place on a
 * receipt. So the invoice carries no names at all and the attribution lives
 * here, below it, `print:hidden`, labelled as internal.
 *
 * It stays editable because the problem it fixes is real and common. The box at
 * the till is optional and gets skipped at a busy counter; the symptom is a
 * stylist's commission being short at the end of the month with nothing to say
 * which bills it was. Before this the only remedy was voiding the bill and
 * raising it again — a burnt invoice number and a gap in the series, to fix a
 * dropdown.
 *
 * What stops it being a way to move money quietly is behind it, in the API: a
 * commission already paid out cannot be moved, only staff at the branch that
 * issued the bill may be credited, the earning keeps the invoice's own date so
 * it stays in the right payroll month, and every change is audited with the
 * names and the amounts on both sides.
 */
interface StaffChange {
  line: string;
  from: { staff: { staffId: string; name: string }[]; commission: string };
  to: { staff: { staffId: string; name: string; commission: string }[]; commission: string };
}

export function PerformersPanel({
  invoiceId,
  items,
  staff,
  editable,
}: {
  invoiceId: string;
  items: InvoiceItem[];
  staff: Staff[];
  editable: boolean;
}) {
  const services = items.filter((item) => item.itemType === 'SERVICE');
  if (services.length === 0) return null;

  return (
    <Card className="mx-auto mt-5 max-w-3xl print:hidden">
      <CardHeader
        title="Who performed these"
        subtitle="Internal — this is not on the bill and never prints with it"
      />
      <CardBody className="space-y-3">
        {services.map((item) => (
          <Line key={item.id} invoiceId={invoiceId} item={item} staff={staff} editable={editable} />
        ))}

        {editable ? (
          <p className="flex items-start gap-1.5 border-t border-stone-100 pt-3 text-2xs leading-relaxed text-ink-subtle">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Two people on one service split its commission between them — the salon pays the same either way.
            Commission already paid out in a payroll cannot be moved from here.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Line({
  invoiceId,
  item,
  staff,
  editable,
}: {
  invoiceId: string;
  item: InvoiceItem;
  staff: Staff[];
  editable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const stored = (item.performers ?? []).map((row) => row.staffId);
  const initial = stored.length > 0 ? stored : item.staffId ? [item.staffId] : [];

  /**
   * What the control shows while the server catches up. Without it the names
   * snap back for as long as the refresh takes, which reads as "it did not work"
   * and invites a second click on something that moves money.
   */
  const [shown, setShown] = useState<string[]>(initial);

  /**
   * Anybody already on the line stays pickable even if they have left. The staff
   * list is filtered to active people, which is right for choosing somebody new
   * and wrong for a bill raised three months ago.
   */
  const options = [
    ...staff,
    ...(item.performers ?? [])
      .filter((row) => !staff.some((member) => member.id === row.staffId))
      .map((row) => ({ id: row.staffId, displayName: `${row.staff.displayName} (no longer here)` }) as Staff),
  ];

  async function save(next: string[]) {
    const previous = shown;
    setShown(next);
    setSaving(true);
    try {
      const { change } = await apiPatch<{ change: StaffChange | null }>(
        `invoices/${invoiceId}/items/${item.id}/staff`,
        { staffIds: next },
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

  const names = (item.performers ?? []).map((row) => row.staff.displayName);

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-stone-100 pb-3 last:border-0 last:pb-0">
      <p className="text-sm text-ink">{item.name}</p>

      {editable ? (
        <StaffPicker
          value={shown}
          staff={options}
          onChange={save}
          disabled={saving || pending}
          tone="quiet"
        />
      ) : (
        <p className="text-xs text-ink-muted">{names.length > 0 ? names.join(' · ') : 'Nobody recorded'}</p>
      )}
    </div>
  );
}

/** What actually moved, in one line. */
function describe(change: StaffChange): string {
  const was = change.from.staff.map((row) => row.name);
  const now = change.to.staff.map((row) => row.name);
  const paid = Number(change.to.commission);

  if (now.length === 0) {
    return was.length > 0
      ? `${was.join(' and ')} taken off ${change.line}${Number(change.from.commission) > 0 ? ` — ${money(change.from.commission)} of commission removed` : ''}`
      : `${change.line} left unattributed`;
  }

  const to = now.length === 1 ? now[0] : `${now.slice(0, -1).join(', ')} and ${now[now.length - 1]}`;
  const worth = paid > 0 ? ` — ${money(paid)}${now.length > 1 ? ' between them' : ''}` : ' — no commission on their arrangement';

  return was.length > 0 ? `${change.line}: ${to}${worth}` : `${change.line} credited to ${to}${worth}`;
}
