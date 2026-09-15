'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { apiPatch, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';

interface BranchCapacity {
  id: string;
  name: string;
  city: string | null;
  maxConcurrentBookings: number | null;
}

/**
 * HOW MANY PEOPLE THE SHOP TAKES AT ONCE.
 *
 * Left alone, the diary works this out from the rota: a time is offered while
 * any stylist who can do the work is free. That is right for a salon where
 * every stylist has their own chair, and wrong for one with six stylists and
 * three chairs — or one that wants to keep a place back for whoever walks in
 * off the street on a Saturday.
 *
 * So the number here is a ceiling, not a replacement. A booking still needs a
 * stylist. And it holds only for the internet: the front desk can always
 * squeeze someone in, because the person standing in the room knows things this
 * number does not.
 */
export function BookingCapacityCard({ branches, canEdit }: { branches: BranchCapacity[]; canEdit: boolean }) {
  return (
    <Card>
      <CardHeader
        title="How many at once"
        subtitle="The most appointments online booking will place in one time slot"
      />
      <CardBody className="space-y-4">
        {!canEdit ? (
          <p className="rounded-lg bg-stone-50 p-2.5 text-xs text-ink-muted">
            Only the owner, or someone who can manage branches, can change this.
          </p>
        ) : null}

        {branches.map((branch) => (
          <CapacityRow key={branch.id} branch={branch} canEdit={canEdit} />
        ))}

        <div className="rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
          <p className="mb-1 font-medium text-ink">Leave it empty unless you need it</p>
          Empty means the diary decides from your rota — it offers a time while anyone who can do the work is free.
          Set a number when you have fewer chairs than stylists, or when you want to keep a place free for walk-ins.
          Either way your front desk can still book over it.
        </div>
      </CardBody>
    </Card>
  );
}

function CapacityRow({ branch, canEdit }: { branch: BranchCapacity; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();

  const initial = branch.maxConcurrentBookings === null ? '' : String(branch.maxConcurrentBookings);
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);

  const dirty = value.trim() !== saved;

  async function submit() {
    const trimmed = value.trim();
    // An empty box is not zero — zero would mean "take no bookings at all".
    // It means "no ceiling", which the API reads as null.
    const next = trimmed === '' ? null : Number(trimmed);

    if (next !== null && (!Number.isInteger(next) || next < 1)) {
      toast.error('Enter a whole number of appointments, or leave it empty for no limit.');
      return;
    }

    setBusy(true);
    try {
      await apiPatch(`branches/${branch.id}`, { maxConcurrentBookings: next });
      setSaved(trimmed);
      toast.success(
        next === null ? `${branch.name} is back to following the rota` : `${branch.name}: up to ${next} at once`,
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{branch.name}</p>
        {branch.city ? <p className="text-2xs text-ink-subtle">{branch.city}</p> : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Users className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
          <Input
            type="number"
            min={1}
            max={50}
            inputMode="numeric"
            value={value}
            disabled={!canEdit}
            onChange={(event) => setValue(event.target.value)}
            placeholder="No limit"
            className="tnum w-32 pl-8 text-right"
          />
        </div>
        {dirty ? (
          <Button size="sm" onClick={submit} loading={busy}>
            Save
          </Button>
        ) : null}
      </div>
    </div>
  );
}
