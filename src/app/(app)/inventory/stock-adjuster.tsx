'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import type { Product } from '@/lib/types';

/**
 * Manual stock corrections and wastage. Purchases come in through a PO and
 * consumption is deducted by billing — this is for the gap between the two.
 */
export function StockAdjuster({ products }: { products: Product[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    productId: products[0]?.id ?? '',
    kind: 'ADJUSTMENT' as 'ADJUSTMENT' | 'WASTAGE' | 'OPENING',
    quantity: 0,
    notes: '',
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setError(null);
    if (!form.productId || form.quantity === 0) {
      setError('Pick a product and a non-zero quantity.');
      return;
    }
    if (form.kind === 'WASTAGE' && !form.notes.trim()) {
      setError('Wastage needs a reason — it goes into the consumption report.');
      return;
    }

    setSaving(true);
    try {
      if (form.kind === 'WASTAGE') {
        await apiPost('inventory/stock/wastage', {
          productId: form.productId,
          quantity: Math.abs(form.quantity),
          reason: form.notes.trim(),
        });
      } else {
        await apiPost('inventory/stock/adjust', {
          productId: form.productId,
          quantity: form.quantity,
          type: form.kind,
          notes: form.notes.trim() || undefined,
        });
      }

      toast.success('Stock updated');
      setOpen(false);
      setForm((current) => ({ ...current, quantity: 0, notes: '' }));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" />
        Adjust stock
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Adjust stock"
        description="Every change is written to the stock ledger, so the numbers always reconcile."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              Save adjustment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <Field label="Product" required>
            {({ id }) => (
              <Select id={id} value={form.productId} onChange={(e) => set('productId', e.target.value)}>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                    {product.shade ? ` (${product.shade})` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="What kind of change?">
            {({ id }) => (
              <Select id={id} value={form.kind} onChange={(e) => set('kind', e.target.value as typeof form.kind)}>
                <option value="ADJUSTMENT">Correction after a stock count</option>
                <option value="OPENING">Opening stock</option>
                <option value="WASTAGE">Wastage / spillage</option>
              </Select>
            )}
          </Field>

          <Field
            label="Quantity"
            required
            hint={form.kind === 'WASTAGE' ? 'How much was lost' : 'Negative removes stock'}
          >
            {({ id }) => (
              <Input
                id={id}
                type="number"
                value={form.quantity || ''}
                onChange={(e) => set('quantity', Number(e.target.value))}
                className="tnum text-right"
              />
            )}
          </Field>

          <Field label="Reason" required={form.kind === 'WASTAGE'}>
            {({ id }) => (
              <Input
                id={id}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder={form.kind === 'WASTAGE' ? 'Tube split during colour mix' : 'Counted on 30 Sep'}
              />
            )}
          </Field>
        </div>
      </Modal>
    </>
  );
}
