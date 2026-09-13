'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { apiPatch, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import type { CustomerProfile, Staff } from '@/lib/types';

const SOURCES = ['WALK_IN', 'INSTAGRAM', 'REFERRAL', 'GOOGLE', 'WHATSAPP', 'WEBSITE', 'PHONE', 'OTHER'] as const;
const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'VIP'] as const;

const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

/**
 * Everything about the person that is not a transaction: who they are, how to
 * reach them, how they found the salon. Consent is deliberately not here — it
 * has its own audited endpoint, because "we ticked the box for them" is the
 * complaint that gets a WhatsApp number blocked.
 */
export function EditCustomerButton({
  customer,
  staff,
  canSetTier,
}: {
  customer: CustomerProfile;
  staff: Staff[];
  canSetTier: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    firstName: customer.firstName,
    lastName: customer.lastName ?? '',
    phone: customer.phone,
    altPhone: customer.altPhone ?? '',
    email: customer.email ?? '',
    gender: customer.gender ?? '',
    dob: day(customer.dob),
    anniversary: day(customer.anniversary),
    addressLine: customer.addressLine ?? '',
    city: customer.city ?? '',
    pincode: customer.pincode ?? '',
    source: customer.source ?? 'WALK_IN',
    sourceDetail: customer.sourceDetail ?? '',
    preferredStaffId: customer.preferredStaff?.id ?? '',
    tags: customer.tags.join(', '),
    tier: customer.tier,
    isBlacklisted: customer.isBlacklisted ?? false,
  });

  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setError(null);
    if (!form.firstName.trim() || form.phone.trim().length < 6) {
      setError('A name and a valid phone number are required.');
      return;
    }
    setSaving(true);
    try {
      await apiPatch(`customers/${customer.id}`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim(),
        altPhone: form.altPhone.trim() || undefined,
        email: form.email.trim() || undefined,
        gender: form.gender || undefined,
        dob: form.dob || undefined,
        anniversary: form.anniversary || undefined,
        addressLine: form.addressLine.trim() || undefined,
        city: form.city.trim() || undefined,
        pincode: form.pincode.trim() || undefined,
        source: form.source,
        sourceDetail: form.sourceDetail.trim() || undefined,
        preferredStaffId: form.preferredStaffId || undefined,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20),
        ...(canSetTier ? { tier: form.tier, isBlacklisted: form.isBlacklisted } : {}),
      });
      toast.success('Details saved');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit details
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit details"
        description="Who they are and how to reach them. Consent is changed from the Reachable on card."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required>
              {({ id }) => <Input id={id} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />}
            </Field>
            <Field label="Last name">
              {({ id }) => <Input id={id} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />}
            </Field>
            <Field label="Phone" required>
              {({ id }) => <Input id={id} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />}
            </Field>
            <Field label="Alternate phone">
              {({ id }) => <Input id={id} inputMode="tel" value={form.altPhone} onChange={(e) => set('altPhone', e.target.value)} />}
            </Field>
            <Field label="Email">
              {({ id }) => <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
            </Field>
            <Field label="Gender">
              {({ id }) => (
                <Select id={id} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">Not specified</option>
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                  <option value="OTHER">Other</option>
                </Select>
              )}
            </Field>
            <Field label="Birthday" hint="Drives birthday offers">
              {({ id }) => <Input id={id} type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />}
            </Field>
            <Field label="Anniversary">
              {({ id }) => <Input id={id} type="date" value={form.anniversary} onChange={(e) => set('anniversary', e.target.value)} />}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Address">
                {({ id }) => <Input id={id} value={form.addressLine} onChange={(e) => set('addressLine', e.target.value)} />}
              </Field>
            </div>
            <Field label="Pincode">
              {({ id }) => <Input id={id} inputMode="numeric" value={form.pincode} onChange={(e) => set('pincode', e.target.value)} />}
            </Field>
            <Field label="City">
              {({ id }) => <Input id={id} value={form.city} onChange={(e) => set('city', e.target.value)} />}
            </Field>
            <Field label="How did they find you?">
              {({ id }) => (
                <Select id={id} value={form.source} onChange={(e) => set('source', e.target.value)}>
                  {SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Detail" hint="e.g. which post, which friend">
              {({ id }) => <Input id={id} value={form.sourceDetail} onChange={(e) => set('sourceDetail', e.target.value)} />}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preferred stylist">
              {({ id }) => (
                <Select id={id} value={form.preferredStaffId} onChange={(e) => set('preferredStaffId', e.target.value)}>
                  <option value="">No preference</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Tags" hint="Comma-separated">
              {({ id }) => <Input id={id} value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="regular, bridal, colour" />}
            </Field>
          </div>

          {canSetTier ? (
            <div className="grid gap-4 border-t border-stone-100 pt-4 sm:grid-cols-2">
              <Field label="Tier" hint="Normally earned by spend; override here">
                {({ id }) => (
                  <Select id={id} value={form.tier} onChange={(e) => set('tier', e.target.value)}>
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier.charAt(0) + tier.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="flex items-end pb-1">
                <Checkbox
                  label="Blacklisted"
                  description="No online bookings; the front desk sees a warning."
                  checked={form.isBlacklisted}
                  onChange={(e) => set('isBlacklisted', e.target.checked)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
