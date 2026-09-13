'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { dayjs } from '@/lib/format';

const MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'] as const;

export function ExpenseEditor({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    categoryId: categories[0]?.id ?? '',
    expenseDate: dayjs().format('YYYY-MM-DD'),
    amount: 0,
    paymentMode: 'CASH' as (typeof MODES)[number],
    vendor: '',
    reference: '',
    notes: '',
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setError(null);
    if (!form.categoryId || form.amount <= 0) {
      setError('Pick a category and enter an amount.');
      return;
    }

    setSaving(true);
    try {
      await apiPost('expenses', {
        categoryId: form.categoryId,
        expenseDate: form.expenseDate,
        amount: form.amount,
        paymentMode: form.paymentMode,
        vendor: form.vendor.trim() || undefined,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success('Expense recorded');
      setOpen(false);
      setForm((current) => ({ ...current, amount: 0, vendor: '', reference: '', notes: '' }));
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
        Record expense
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record an expense"
        description="Expenses are what turn revenue into profit — the P&L only works if these are kept up."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              Record expense
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" required>
              {({ id }) => (
                <Select id={id} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Date" required>
              {({ id }) => <Input id={id} type="date" value={form.expenseDate} onChange={(e) => set('expenseDate', e.target.value)} />}
            </Field>

            <Field label="Amount (₹)" required>
              {({ id }) => (
                <Input id={id} type="number" value={form.amount || ''} onChange={(e) => set('amount', Number(e.target.value))} className="tnum text-right" autoFocus />
              )}
            </Field>

            <Field label="Paid by">
              {({ id }) => (
                <Select id={id} value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value as (typeof MODES)[number])}>
                  {MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Vendor">
              {({ id }) => <Input id={id} value={form.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="Landlord, supplier, agency…" />}
            </Field>

            <Field label="Reference" hint="Bill or cheque number">
              {({ id }) => <Input id={id} value={form.reference} onChange={(e) => set('reference', e.target.value)} />}
            </Field>
          </div>

          <Field label="Notes">
            {({ id }) => <Textarea id={id} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />}
          </Field>
        </div>
      </Modal>
    </>
  );
}
