'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import type { Service, ServiceCategory } from '@/lib/types';

export function ServiceEditor({
  categories,
  service,
  compact,
}: {
  categories: ServiceCategory[];
  service?: Service;
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: service?.name ?? '',
    categoryId: service?.categoryId ?? '',
    gender: service?.gender ?? 'UNISEX',
    durationMin: service?.durationMin ?? 30,
    bufferMin: service?.bufferMin ?? 5,
    price: Number(service?.price ?? 0),
    memberPrice: service?.memberPrice ? Number(service.memberPrice) : 0,
    commissionRate: Number(service?.commissionRate ?? 0),
    onlineBookable: service?.onlineBookable ?? true,
    isActive: service?.isActive ?? true,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setError(null);
    if (!form.name.trim() || form.price < 0) {
      setError('A name and a price are required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        categoryId: form.categoryId || undefined,
        gender: form.gender,
        durationMin: form.durationMin,
        bufferMin: form.bufferMin,
        price: form.price,
        memberPrice: form.memberPrice > 0 ? form.memberPrice : undefined,
        commissionType: form.commissionRate > 0 ? 'PERCENT_OF_SERVICE' : 'NONE',
        commissionRate: form.commissionRate,
        onlineBookable: form.onlineBookable,
        ...(service ? { isActive: form.isActive } : {}),
      };

      if (service) await apiPatch(`services/${service.id}`, payload);
      else await apiPost('services', payload);

      toast.success(service ? 'Service updated' : 'Service added');
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
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-ink-subtle hover:bg-stone-100 hover:text-ink"
          aria-label={`Edit ${service?.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New service
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={service ? `Edit ${service.name}` : 'New service'}
        description="Duration drives the calendar; commission drives staff payouts."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {service ? 'Save changes' : 'Add service'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <Field label="Name" required>
            {({ id }) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              {({ id }) => (
                <Select id={id} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">Uncategorised</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="For">
              {({ id }) => (
                <Select id={id} value={form.gender} onChange={(e) => set('gender', e.target.value as Service['gender'])}>
                  <option value="UNISEX">Everyone</option>
                  <option value="FEMALE">Women</option>
                  <option value="MALE">Men</option>
                </Select>
              )}
            </Field>

            <Field label="Duration (minutes)" required>
              {({ id }) => (
                <Input id={id} type="number" value={form.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} className="tnum" />
              )}
            </Field>

            <Field label="Buffer after (minutes)" hint="Clean-up time">
              {({ id }) => (
                <Input id={id} type="number" value={form.bufferMin} onChange={(e) => set('bufferMin', Number(e.target.value))} className="tnum" />
              )}
            </Field>

            <Field label="Price (₹)" required hint="What you charge — GST is decided on the bill">
              {({ id }) => (
                <Input id={id} type="number" value={form.price} onChange={(e) => set('price', Number(e.target.value))} className="tnum text-right" />
              )}
            </Field>

            <Field label="Member price (₹)" hint="Blank uses the plan discount">
              {({ id }) => (
                <Input id={id} type="number" value={form.memberPrice || ''} onChange={(e) => set('memberPrice', Number(e.target.value))} className="tnum text-right" />
              )}
            </Field>

            <Field label="Staff commission (%)">
              {({ id }) => (
                <Input id={id} type="number" value={form.commissionRate} onChange={(e) => set('commissionRate', Number(e.target.value))} className="tnum text-right" />
              )}
            </Field>
          </div>

          <Checkbox
            label="Customers can book this online"
            description="Appears on your public booking page and QR code."
            checked={form.onlineBookable}
            onChange={(event) => set('onlineBookable', event.target.checked)}
          />

          {service ? (
            <Checkbox
              label="Active"
              description="Inactive services disappear from the menu but stay on old invoices."
              checked={form.isActive}
              onChange={(event) => set('isActive', event.target.checked)}
            />
          ) : null}
        </div>
      </Modal>
    </>
  );
}
