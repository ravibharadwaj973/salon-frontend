'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { ROLE_LABEL } from '@/lib/permissions';
import type { BranchSummary, UserRole } from '@/lib/types';

const ROLES: UserRole[] = ['ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STYLIST', 'ACCOUNTANT'];

const ROLE_HINT: Record<string, string> = {
  ADMIN: 'Everything except transferring ownership',
  REGIONAL_MANAGER: 'Several branches, including the financials',
  MANAGER: 'One branch end to end, including discounts and voids',
  RECEPTIONIST: 'Bookings and billing, no reports or payroll',
  STYLIST: 'Their own appointments and their own performance',
  ACCOUNTANT: 'Money, expenses, payroll and reports — no customer editing',
};

export function NewUserButton({ branches }: { branches: BranchSummary[] }) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'RECEPTIONIST' as UserRole,
    branchIds: [] as string[],
    createStaffProfile: false,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function toggleBranch(branchId: string) {
    setForm((current) => ({
      ...current,
      branchIds: current.branchIds.includes(branchId)
        ? current.branchIds.filter((id) => id !== branchId)
        : [...current.branchIds, branchId],
    }));
  }

  async function submit() {
    setError(null);
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      setError('Name, email and a password of at least 8 characters are required.');
      return;
    }

    setSaving(true);
    try {
      await apiPost('users', {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        role: form.role,
        branchIds: form.branchIds,
        mustChangePassword: true,
        createStaffProfile: form.createStaffProfile,
        staffBranchId: form.branchIds[0],
      });

      toast.success('Login created — they will be asked to change the password');
      setOpen(false);
      setForm({ name: '', email: '', phone: '', password: '', role: 'RECEPTIONIST', branchIds: [], createStaffProfile: false });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" />
        Add login
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a team login"
        description="Roles decide what each person sees. You can fine-tune single permissions later."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              Create login
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              {({ id }) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />}
            </Field>
            <Field label="Email" required hint="Used to sign in">
              {({ id }) => <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
            </Field>
            <Field label="Phone">
              {({ id }) => <Input id={id} value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />}
            </Field>
            <Field label="Temporary password" required hint="At least 8 characters">
              {({ id }) => <Input id={id} type="text" value={form.password} onChange={(e) => set('password', e.target.value)} />}
            </Field>
          </div>

          <Field label="Role" required hint={ROLE_HINT[form.role]}>
            {({ id }) => (
              <Select id={id} value={form.role} onChange={(e) => set('role', e.target.value as UserRole)}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role] ?? role}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {branches.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink">Branches they can work in</p>
              <div className="flex flex-wrap gap-1.5">
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => toggleBranch(branch.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      form.branchIds.includes(branch.id)
                        ? 'border-brand-300 bg-brand-50 font-medium text-brand-700'
                        : 'border-stone-200 text-ink-muted hover:border-stone-300'
                    }`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-ink-subtle">Leave empty for access to every branch.</p>
            </div>
          ) : null}

          <Checkbox
            label="Also create a staff profile"
            description="Needed if this person will be booked on the calendar and earn commission."
            checked={form.createStaffProfile}
            onChange={(event) => set('createStaffProfile', event.target.checked)}
          />
        </div>
      </Modal>
    </>
  );
}
