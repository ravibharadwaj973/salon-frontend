'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, UserPlus } from 'lucide-react';
import { apiDelete, apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import type { BranchSummary, Service, Staff } from '@/lib/types';

const COMMISSION_TYPES = [
  { value: 'NONE', label: 'No commission', hint: 'Salary only.' },
  { value: 'PERCENT_OF_SERVICE', label: 'Percent of service revenue', hint: 'The usual arrangement: a cut of the services they personally did.' },
  { value: 'PERCENT_OF_TOTAL', label: 'Percent of the whole bill', hint: 'Includes products and packages on bills credited to them.' },
  { value: 'FLAT_PER_SERVICE', label: 'Flat amount per service', hint: 'A fixed rupee amount for every service completed.' },
  { value: 'SLAB', label: 'Slab', hint: 'Rate rises once they cross a target. Set the slabs on their page after saving.' },
] as const;

type CommissionType = (typeof COMMISSION_TYPES)[number]['value'];

interface FormState {
  displayName: string;
  designation: string;
  phone: string;
  email: string;
  branchId: string;
  gender: '' | 'MALE' | 'FEMALE' | 'OTHER';
  joinedAt: string;
  code: string;
  specialities: string;
  isBookable: boolean;
  baseSalary: string;
  commissionType: CommissionType;
  commissionRate: string;
  serviceIds: string[];
}

const empty = (branchId: string): FormState => ({
  displayName: '',
  designation: '',
  phone: '',
  email: '',
  branchId,
  gender: '',
  joinedAt: '',
  code: '',
  specialities: '',
  isBookable: true,
  baseSalary: '',
  commissionType: 'PERCENT_OF_SERVICE',
  commissionRate: '',
  serviceIds: [],
});

/** Add a stylist. The list page's header button. */
export function AddStaffButton({ branches, services }: { branches: BranchSummary[]; services: Service[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" />
        Add staff
      </Button>
      {open ? <StaffDialog branches={branches} services={services} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Change an existing stylist. Lives on their own page. */
export function EditStaffButton({
  staff,
  branches,
  services,
}: {
  staff: Staff;
  branches: BranchSummary[];
  services: Service[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      {open ? (
        <StaffDialog staff={staff} branches={branches} services={services} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/**
 * One dialog for both, because a salon that hires someone and a salon that
 * corrects a phone number are filling in the same fields — and a separate edit
 * screen is how the two quietly drift apart.
 *
 * Pay is only sent when the viewer was allowed to see it. The API returns null
 * for salary and commission when the payroll section is hidden from them, and
 * posting a blank over that would quietly zero someone's pay.
 */
function StaffDialog({
  staff,
  branches,
  services,
  onClose,
}: {
  staff?: Staff;
  branches: BranchSummary[];
  services: Service[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = Boolean(staff);
  const canSeePay = !staff || staff.baseSalary !== null || staff.commissionRate !== null;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    staff
      ? {
          displayName: staff.displayName,
          designation: staff.designation ?? '',
          phone: staff.phone ?? '',
          email: staff.email ?? '',
          branchId: staff.branchId,
          gender: staff.gender && staff.gender !== 'UNISEX' ? staff.gender : '',
          joinedAt: staff.joinedAt ? staff.joinedAt.slice(0, 10) : '',
          code: staff.code ?? '',
          specialities: staff.specialities.join(', '),
          isBookable: staff.isBookable,
          baseSalary: staff.baseSalary !== null ? String(staff.baseSalary) : '',
          commissionType: staff.commissionType ?? 'PERCENT_OF_SERVICE',
          commissionRate: staff.commissionRate !== null ? String(staff.commissionRate) : '',
          serviceIds: staff.services?.map((row) => row.serviceId) ?? [],
        }
      : empty(branches[0]?.id ?? ''),
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function toggleService(serviceId: string) {
    setForm((current) => ({
      ...current,
      serviceIds: current.serviceIds.includes(serviceId)
        ? current.serviceIds.filter((id) => id !== serviceId)
        : [...current.serviceIds, serviceId],
    }));
  }

  async function submit() {
    setError(null);
    if (!form.displayName.trim()) {
      setError('A name is required.');
      return;
    }
    if (!form.branchId) {
      setError('Pick the branch this person works in.');
      return;
    }

    const body: Record<string, unknown> = {
      branchId: form.branchId,
      displayName: form.displayName.trim(),
      designation: form.designation.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      gender: form.gender || undefined,
      joinedAt: form.joinedAt || undefined,
      code: form.code.trim() || undefined,
      specialities: form.specialities
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      isBookable: form.isBookable,
      serviceIds: form.serviceIds,
    };

    if (canSeePay) {
      body.baseSalary = Number(form.baseSalary || 0);
      body.commissionType = form.commissionType;
      body.commissionRate = Number(form.commissionRate || 0);
    }

    setSaving(true);
    try {
      if (staff) {
        await apiPatch(`staff/${staff.id}`, body);
        toast.success(`${form.displayName.trim()} updated`);
      } else {
        await apiPost('staff', body);
        toast.success(`${form.displayName.trim()} added — they work Tue–Sun, 10:00–20:00 until you change it`);
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Someone left. Deactivates rather than deletes — their past bills,
   * commission and reviews all still point at them, and the API refuses while
   * they still have upcoming appointments so nobody is quietly unbooked.
   */
  async function markAsLeft() {
    if (!staff) return;
    setError(null);
    setSaving(true);
    try {
      await apiDelete(`staff/${staff.id}`);
      toast.success(`${staff.displayName} marked as left`);
      onClose();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const commissionHint = COMMISSION_TYPES.find((type) => type.value === form.commissionType)?.hint;
  const percentBased = form.commissionType === 'PERCENT_OF_SERVICE' || form.commissionType === 'PERCENT_OF_TOTAL';

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${staff!.displayName}` : 'Add a staff member'}
      description={
        editing
          ? 'Changes apply from now on. Past bills and commission already earned are not touched.'
          : 'They appear on the calendar as soon as you save, working Tuesday to Sunday, 10:00 to 20:00.'
      }
      footer={
        <>
          {editing && staff!.isActive ? (
            <Button variant="ghost" onClick={markAsLeft} disabled={saving} className="mr-auto text-rose-600">
              Mark as left
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            {editing ? 'Save changes' : 'Add staff member'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required hint="As customers should see it">
            {({ id }) => (
              <Input id={id} value={form.displayName} onChange={(e) => set('displayName', e.target.value)} autoFocus />
            )}
          </Field>
          <Field label="Designation" hint="Senior Stylist, Beautician…">
            {({ id }) => <Input id={id} value={form.designation} onChange={(e) => set('designation', e.target.value)} />}
          </Field>
          <Field label="Phone">
            {({ id }) => (
              <Input id={id} value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
            )}
          </Field>
          <Field label="Email">
            {({ id }) => (
              <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            )}
          </Field>
          <Field label="Branch" required>
            {({ id }) => (
              <Select id={id} value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Joined on">
            {({ id }) => (
              <Input id={id} type="date" value={form.joinedAt} onChange={(e) => set('joinedAt', e.target.value)} />
            )}
          </Field>
          <Field label="Gender" hint="Only for customers who ask for one">
            {({ id }) => (
              <Select id={id} value={form.gender} onChange={(e) => set('gender', e.target.value as FormState['gender'])}>
                <option value="">Not stated</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </Select>
            )}
          </Field>
          <Field label="Staff code" hint="Optional, must be unique">
            {({ id }) => <Input id={id} value={form.code} onChange={(e) => set('code', e.target.value)} />}
          </Field>
        </div>

        <Field label="Specialities" hint="Comma separated — shown on the booking page">
          {({ id }) => (
            <Input
              id={id}
              value={form.specialities}
              onChange={(e) => set('specialities', e.target.value)}
              placeholder="Balayage, Keratin, Bridal"
            />
          )}
        </Field>

        {canSeePay ? (
          <div className="space-y-4 rounded-xl border border-stone-200 p-3.5">
            <p className="text-xs font-medium text-ink">Pay</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monthly salary" hint="₹, before commission">
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={form.baseSalary}
                    onChange={(e) => set('baseSalary', e.target.value)}
                    placeholder="0"
                  />
                )}
              </Field>
              <Field label={percentBased ? 'Commission rate (%)' : 'Commission amount (₹)'}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    step="0.5"
                    value={form.commissionRate}
                    onChange={(e) => set('commissionRate', e.target.value)}
                    placeholder="0"
                    disabled={form.commissionType === 'NONE'}
                  />
                )}
              </Field>
            </div>
            <Field label="Commission is" hint={commissionHint}>
              {({ id }) => (
                <Select
                  id={id}
                  value={form.commissionType}
                  onChange={(e) => set('commissionType', e.target.value as CommissionType)}
                >
                  {COMMISSION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ) : null}

        {services.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink">
              What they can do{' '}
              <span className="font-normal text-ink-subtle">({form.serviceIds.length} of {services.length})</span>
            </p>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-stone-200 p-2">
              <div className="flex flex-wrap gap-1.5">
                {services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => toggleService(service.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      form.serviceIds.includes(service.id)
                        ? 'border-brand-300 bg-brand-50 font-medium text-brand-700'
                        : 'border-stone-200 text-ink-muted hover:border-stone-300'
                    }`}
                  >
                    {service.name}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1.5 text-2xs text-ink-subtle">
              Only these appear when a customer picks them online. Leave empty and they can be booked for anything.
            </p>
          </div>
        ) : null}

        <Checkbox
          label="Can be booked"
          description="Turn off for a manager or receptionist who should not appear on the calendar."
          checked={form.isBookable}
          onChange={(event) => set('isBookable', event.target.checked)}
        />
      </div>
    </Modal>
  );
}
