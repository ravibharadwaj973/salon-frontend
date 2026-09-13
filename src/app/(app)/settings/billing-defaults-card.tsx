'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch, errorMessage } from '@/lib/client';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Checkbox, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';

/**
 * How bills are taxed unless the counter says otherwise. Three switches, each
 * of which changes every new bill from the moment it is saved; existing bills
 * are what they were.
 */
export function BillingDefaultsCard({
  settings,
  gstin,
  canEdit,
}: {
  settings: Record<string, unknown>;
  gstin: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    gstEnabled: settings.gstEnabled !== false,
    pricesIncludeTax: settings.pricesIncludeTax === true,
    invoiceRoundOff: settings.invoiceRoundOff !== false,
    defaultGstRate: Number(settings.defaultGstRate ?? 18),
  });

  async function save(patch: Partial<typeof form>) {
    const next = { ...form, ...patch };
    setForm(next);
    setBusy(true);
    try {
      await apiPatch('tenant', { settings: next });
      toast.success('Billing defaults saved');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      setForm(form);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Billing defaults" subtitle="How new bills are taxed unless the front desk chooses otherwise on the bill" />
      <CardBody className="space-y-4">
        {!gstin ? (
          <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            No GSTIN on file, so every bill is made without GST. Add your GSTIN above to start issuing tax invoices.
          </p>
        ) : null}

        <Checkbox
          label="Charge GST by default"
          description={gstin ? 'New bills start as tax invoices. Staff with the right permission can switch a bill to no-GST.' : 'Needs a GSTIN first.'}
          checked={form.gstEnabled && Boolean(gstin)}
          disabled={!canEdit || busy || !gstin}
          onChange={(event) => save({ gstEnabled: event.target.checked })}
        />

        <Checkbox
          label="Menu prices include GST"
          description="Off (usual): a ₹800 haircut bills at ₹944 with GST, ₹800 without. On: it is ₹800 either way, with the tax shown inside it."
          checked={form.pricesIncludeTax}
          disabled={!canEdit || busy}
          onChange={(event) => save({ pricesIncludeTax: event.target.checked })}
        />

        <Checkbox
          label="Round the total to the nearest rupee"
          description="Shown as a separate round-off line on the bill."
          checked={form.invoiceRoundOff}
          disabled={!canEdit || busy}
          onChange={(event) => save({ invoiceRoundOff: event.target.checked })}
        />

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink">GST rate</p>
            <p className="text-xs text-ink-muted">
              Applies to every service, package and membership — services carry no rate of their own. Salon services
              are 18%. Products keep the rate set on each product.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              max={28}
              step="0.5"
              value={form.defaultGstRate}
              disabled={!canEdit || busy}
              onChange={(event) => setForm((f) => ({ ...f, defaultGstRate: Number(event.target.value) }))}
              onBlur={() => form.defaultGstRate !== Number(settings.defaultGstRate ?? 18) && save({})}
              className="w-20 text-right"
              aria-label="Default GST rate"
            />
            <span className="text-xs text-ink-muted">%</span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
