'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, UserCheck } from 'lucide-react';
import { apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import type { Customer, Lead, LeadStatus } from '@/lib/types';

const SOURCES = ['INSTAGRAM', 'WHATSAPP', 'GOOGLE', 'WEBSITE', 'REFERRAL', 'FACEBOOK', 'PHONE', 'WALK_IN', 'MANUAL'] as const;
const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'INTERESTED', 'APPOINTMENT_BOOKED', 'VISITED', 'LOST'];

export function NewLeadButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', source: 'INSTAGRAM', notes: '', followUpAt: '' });

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    setError(null);
    if (!form.name.trim() || form.phone.trim().length < 6) {
      setError('A name and phone number are needed.');
      return;
    }

    setSaving(true);
    try {
      await apiPost('leads', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        source: form.source,
        notes: form.notes.trim() || undefined,
        followUpAt: form.followUpAt || undefined,
      });
      toast.success('Lead added — the welcome journey will pick it up');
      setOpen(false);
      setForm({ name: '', phone: '', source: 'INSTAGRAM', notes: '', followUpAt: '' });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New lead
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New lead"
        description="An enquiry that has not booked yet."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              Add lead
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
            <Field label="Phone" required>
              {({ id }) => <Input id={id} value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />}
            </Field>
            <Field label="Where from?">
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
            <Field label="Follow up on">
              {({ id }) => <Input id={id} type="date" value={form.followUpAt} onChange={(e) => set('followUpAt', e.target.value)} />}
            </Field>
          </div>

          <Field label="What did they ask about?">
            {({ id }) => <Textarea id={id} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Asked about bridal packages for December" />}
          </Field>
        </div>
      </Modal>
    </>
  );
}

export function LeadActions({ lead }: { lead: Lead }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function updateStatus(status: LeadStatus) {
    setBusy(true);
    try {
      await apiPatch(`leads/${lead.id}`, { status });
      toast.success('Lead updated');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    setBusy(true);
    try {
      const customer = await apiPost<Customer>(`leads/${lead.id}/convert`, {});
      toast.success('Converted to a customer');
      router.push(`/customers/${customer.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (lead.convertedCustomerId) {
    return <span className="text-2xs text-ink-subtle">Converted</span>;
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <select
        value={lead.status}
        onChange={(event) => updateStatus(event.target.value as LeadStatus)}
        disabled={busy}
        className="h-7 rounded-md border border-stone-300 bg-white px-1.5 text-2xs text-ink-muted"
        aria-label="Change status"
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {status.replace(/_/g, ' ').toLowerCase()}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={convert}
        disabled={busy}
        title="Convert to customer"
        className="rounded-md p-1.5 text-ink-subtle hover:bg-emerald-50 hover:text-emerald-600"
      >
        <UserCheck className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
