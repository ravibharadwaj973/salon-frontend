'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Info } from 'lucide-react';
import { apiPut, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Field, FormRow, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';

export type RegistrationStatus = 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED';

export interface TaxIdentity {
  status: RegistrationStatus;
  gstin: string | null;
  legalName: string | null;
  tradeName: string | null;
  pan: string | null;
  stateCode: string | null;
}

/**
 * WHICH KIND OF BUSINESS THIS IS, WHICH DECIDES WHAT ITS BILLS ARE.
 *
 * Presented as three named situations rather than a "GST enabled" switch,
 * because a switch cannot express the middle one and the middle one is a real
 * business: a composition dealer is registered, has a GSTIN, and may not
 * collect a paisa of tax from a customer. A switch labelled "GST" forces them
 * to choose between two wrong answers.
 */
const CHOICES: { value: RegistrationStatus; title: string; body: string; bill: string }[] = [
  {
    value: 'REGULAR',
    title: 'GST registered',
    body: 'You collect GST and file returns. Your customers can claim the tax back.',
    bill: 'Bills are headed Tax Invoice and show CGST/SGST or IGST.',
  },
  {
    value: 'COMPOSITION',
    title: 'Composition scheme',
    body: 'You pay tax on turnover and are not allowed to collect it from customers.',
    bill: 'Bills are headed Bill of Supply, show no tax, and carry the declaration the scheme requires.',
  },
  {
    value: 'UNREGISTERED',
    title: 'Not registered',
    body: 'Below the threshold, or simply not registered for GST.',
    bill: 'Bills are headed Invoice and show no tax or GSTIN anywhere.',
  },
];

export function TaxIdentityCard({ identity, canEdit }: { identity: TaxIdentity; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    status: identity.status,
    gstin: identity.gstin ?? '',
    legalName: identity.legalName ?? '',
    pan: identity.pan ?? '',
    stateCode: identity.stateCode ?? '',
  });

  const chosen = CHOICES.find((c) => c.value === form.status)!;
  const needsGstin = form.status !== 'UNREGISTERED';
  const changingAwayFromTax = identity.status === 'REGULAR' && form.status !== 'REGULAR';

  async function save() {
    setBusy(true);
    try {
      await apiPut('tax-settings/identity', {
        status: form.status,
        gstin: form.gstin || undefined,
        legalName: form.legalName || undefined,
        pan: form.pan || undefined,
        stateCode: form.stateCode || undefined,
      });
      toast.success('Tax details saved');
      router.refresh();
    } catch (error) {
      // The server's message is the useful one here: it distinguishes a GSTIN
      // of the wrong shape from one whose checksum fails, and says so.
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Registration"
        subtitle="What kind of business this is, and therefore what its bills are called"
      />
      <CardBody className="space-y-4">
        <div className="space-y-2">
          {CHOICES.map((choice) => (
            <label
              key={choice.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                form.status === choice.value
                  ? 'border-brand-300 bg-brand-50/60'
                  : 'border-stone-200 hover:border-stone-300'
              } ${canEdit ? '' : 'cursor-not-allowed opacity-70'}`}
            >
              <input
                type="radio"
                name="registration"
                value={choice.value}
                checked={form.status === choice.value}
                disabled={!canEdit}
                onChange={() => setForm({ ...form, status: choice.value })}
                className="mt-0.5 h-4 w-4 border-stone-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{choice.title}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{choice.body}</span>
                <span className="mt-1 block text-2xs text-ink-subtle">{choice.bill}</span>
              </span>
            </label>
          ))}
        </div>

        {/* Said before they save, not after. Changing this changes every future
            bill, and an owner who picks the wrong line should find out here. */}
        {changingAwayFromTax ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <span>
              From now on this business will not charge GST, and new bills will be headed{' '}
              <strong className="font-semibold">{chosen.bill.includes('Bill of Supply') ? 'Bill of Supply' : 'Invoice'}</strong>.
              Bills already issued keep their own heading and tax — nothing already given to a customer changes.
            </span>
          </p>
        ) : null}

        <FormRow>
          <Field
            label="GSTIN"
            hint={needsGstin ? 'Required' : 'Not needed'}
            className={needsGstin ? '' : 'opacity-50'}
          >
            {({ id }) => (
              <Input
                id={id}
                value={form.gstin}
                disabled={!canEdit || !needsGstin}
                maxLength={15}
                placeholder="27AAPFU0939F1ZV"
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                className="font-mono"
              />
            )}
          </Field>

          <Field label="Legal name" hint="As registered">
            {({ id }) => (
              <Input
                id={id}
                value={form.legalName}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              />
            )}
          </Field>

          <Field label="PAN" hint="Optional">
            {({ id }) => (
              <Input
                id={id}
                value={form.pan}
                disabled={!canEdit}
                maxLength={10}
                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                className="font-mono"
              />
            )}
          </Field>

          <Field
            label="State code"
            hint={needsGstin ? 'Taken from the GSTIN' : 'Two digits'}
          >
            {({ id }) => (
              <Input
                id={id}
                value={needsGstin ? form.gstin.slice(0, 2) : form.stateCode}
                disabled={!canEdit || needsGstin}
                maxLength={2}
                onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                className="font-mono"
              />
            )}
          </Field>
        </FormRow>

        <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-subtle">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          The state code is the first two digits of your GSTIN, and it is what decides whether a bill shows CGST and SGST
          or IGST. That is why it follows the GSTIN rather than being typed separately — the two drifting apart would put
          the wrong tax on every out-of-state bill.
        </p>

        {canEdit ? (
          <div className="flex justify-end">
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save registration'}
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
