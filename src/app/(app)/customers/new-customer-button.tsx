'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { ClientApiError, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { ExistingCustomerHint } from '@/components/customers/existing-customer';
import type { Customer } from '@/lib/types';

const SOURCES = ['WALK_IN', 'INSTAGRAM', 'REFERRAL', 'GOOGLE', 'WHATSAPP', 'WEBSITE', 'PHONE', 'OTHER'] as const;

export function NewCustomerButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A 409 from the API names the customer who already owns the phone number. */
  const [clash, setClash] = useState<{ customerId: string; name: string } | null>(null);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    gender: '',
    dob: '',
    source: 'WALK_IN',
    marketingConsent: true,
  });

  const set = (key: keyof typeof form, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (clash) setClash(null);
  };

  /**
   * What to look up while they type. A phone number is the surest identity,
   * so it wins once there are four digits; otherwise the email; otherwise the
   * name. The panel behaves like a search box: results as you type, click one
   * to open it.
   */
  const lookupQuery =
    form.phone.replace(/\D/g, '').length >= 4
      ? form.phone
      : form.email.trim().length >= 3
        ? form.email
        : `${form.firstName} ${form.lastName}`.trim();

  /** They already exist — there is nothing to add, so go to them. */
  function openProfile(id: string) {
    setOpen(false);
    router.push(`/customers/${id}`);
  }

  async function submit() {
    setError(null);
    if (!form.firstName.trim() || form.phone.trim().length < 6) {
      setError('A name and a valid phone number are required.');
      return;
    }

    setSaving(true);
    try {
      const customer = await apiPost<Customer>('customers', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        gender: form.gender || undefined,
        dob: form.dob || undefined,
        source: form.source,
        // Booking is consent for transactional messages; marketing is separate.
        whatsappConsent: form.marketingConsent ? 'OPTED_IN' : 'UNKNOWN',
      });

      toast.success('Customer added');
      setOpen(false);
      // Clear the cached /customers list before leaving, or coming back shows
      // the book as it was a moment ago — without the person just added.
      router.refresh();
      router.push(`/customers/${customer.id}`);
    } catch (err) {
      const details = err instanceof ClientApiError ? (err.details as { customerId?: string; name?: string } | undefined) : undefined;
      if (err instanceof ClientApiError && err.status === 409 && details?.customerId) {
        setClash({ customerId: details.customerId, name: details.name ?? 'an existing customer' });
      }
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        New customer
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New customer"
        description="Phone number is the identity — it must be unique in your salon."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              Add customer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">
              <p>{error}</p>
              {clash ? (
                <button
                  type="button"
                  onClick={() => openProfile(clash.customerId)}
                  className="mt-1 font-medium text-rose-900 underline underline-offset-2"
                >
                  Open {clash.name} instead
                </button>
              ) : null}
            </div>
          ) : null}


          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required>
              {({ id }) => <Input id={id} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />}
            </Field>
            <Field label="Last name">
              {({ id }) => <Input id={id} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />}
            </Field>
            <Field label="Phone" required>
              {({ id }) => (
                <Input id={id} value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" placeholder="98765 43210" />
              )}
            </Field>
            <Field label="Email">
              {({ id }) => <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
            </Field>
          </div>

          {/* Asked while they type — name, phone or email, whichever is in hand —
              not after the form is full. Picking a row opens that customer. */}
          <ExistingCustomerHint query={lookupQuery} onPick={(match) => openProfile(match.id)} action="Open" />

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

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

          <Checkbox
            label="They agreed to receive offers on WhatsApp"
            description="Required before any marketing message can be sent to them."
            checked={form.marketingConsent}
            onChange={(event) => set('marketingConsent', event.target.checked)}
          />
        </div>
      </Modal>
    </>
  );
}
