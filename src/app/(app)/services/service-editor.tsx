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
  /**
   * The salon's own answer, so the default option can say what following it
   * actually does. "Use the salon setting" alone makes somebody leave the
   * screen to find out what that setting is.
   */
  salonPricesIncludeTax = true,
}: {
  categories: ServiceCategory[];
  service?: Service;
  compact?: boolean;
  salonPricesIncludeTax?: boolean;
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
    /**
     * Three answers held as a string, because null is one of them and a select
     * cannot carry it. '' is "follow the salon", which is what a new service
     * should always start as.
     */
    priceIncludesTax:
      service?.priceIncludesTax === true ? 'yes' : service?.priceIncludesTax === false ? 'no' : '',
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
        // null, not undefined. Going back to "follow the salon" has to CLEAR the
        // service's own answer, and an omitted key on a PATCH leaves it standing.
        priceIncludesTax: form.priceIncludesTax === '' ? null : form.priceIncludesTax === 'yes',
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

            {/**
              * WHAT THE NUMBER ABOVE MEANS, NOT WHAT THE TAX RATE IS.
              *
              * The rate stays the salon's single rate in Settings — a service is
              * a price, not a tax position. This asks something the person typing
              * the price already knows and nothing else can tell: does ₹800 mean
              * ₹800 to the customer, or ₹800 plus tax? At 18% those are ₹800 and
              * ₹944, and getting it wrong is wrong by that much on every sale.
              *
              * Almost every service should stay on the salon's answer. This is
              * for the handful that are quoted the other way.
              */}
            <Field label="This price" hint="Whether GST is already inside the number">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.priceIncludesTax}
                  onChange={(e) => set('priceIncludesTax', e.target.value as typeof form.priceIncludesTax)}
                >
                  <option value="">
                    Same as the salon — {salonPricesIncludeTax ? 'GST already inside' : 'GST added on top'}
                  </option>
                  <option value="yes">Already includes GST</option>
                  <option value="no">GST gets added on top</option>
                </Select>
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
