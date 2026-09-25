'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Info } from 'lucide-react';
import { apiPost, apiPut, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { Field, FormRow, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { count } from '@/lib/format';

export interface SeriesFormat {
  prefix: string;
  separator: '/' | '-' | '';
  includeFinancialYear: boolean;
  padding: number;
  startFrom: number;
  reset: 'FINANCIAL_YEAR' | 'NEVER';
  nonGstPrefix: string;
  nonGstStartFrom: number;
}

export interface BranchPreview {
  branchId: string;
  branchName: string;
  prefix: string;
  numbers: string[];
  issued: number;
  nonGstPrefix: string;
  nonGstNumbers: string[];
  nonGstIssued: number;
}

interface Problem {
  field: string;
  message: string;
}

/**
 * WHAT A BILL NUMBER LOOKS LIKE.
 *
 * Built around showing the finished number rather than describing it. An owner
 * cannot tell from "padding: 5" whether the result is legal, and the rule they
 * would be breaking — sixteen characters, letters, digits, "-" and "/" only —
 * is not something anybody should be asked to hold in their head while filling
 * in a form. So the preview is live, the errors arrive before saving, and the
 * count each branch has already reached is shown next to it so nobody fears
 * that saving will renumber the bills they have already given out.
 */
export function SeriesCard({
  series,
  preview,
  canEdit,
}: {
  series: SeriesFormat;
  preview: BranchPreview[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<SeriesFormat>(series);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [sample, setSample] = useState<string[]>([]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(series), [form, series]);

  /**
   * The preview is computed on the SERVER, from the same function that builds
   * the real number. A second implementation here would eventually disagree
   * with the bills, and the screen that exists to build trust would be the
   * thing lying.
   */
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await apiPost<{ problems: Problem[]; numbers: string[] }>(
          'tax-settings/series/preview',
          form,
        );
        if (!cancelled) {
          setProblems(result.problems);
          setSample(result.numbers);
        }
      } catch {
        // A failed preview must not block the form; saving reports properly.
        if (!cancelled) setProblems([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form]);

  const problemFor = (field: string) => problems.find((p) => p.field === field)?.message ?? null;
  const lengthProblem = problems.find((p) => p.field === 'length');

  async function save() {
    setBusy(true);
    try {
      await apiPut('tax-settings/series', form);
      toast.success('Bill numbering saved');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Bill numbering" subtitle="The format every future bill number follows" />
      <CardBody className="space-y-4">
        {/* The finished article, first. Everything below is how to change it. */}
        <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-brand-700">Next bills would be</p>
          {sample.length ? (
            <p className="tnum mt-1 font-mono text-sm font-semibold text-brand-900">{sample.join('   ')}</p>
          ) : (
            <p className="mt-1 text-xs text-brand-800">Fix the problems below to see the numbers.</p>
          )}
        </div>

        {lengthProblem ? (
          <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            {lengthProblem.message}
          </p>
        ) : null}

        <FormRow>
          <Field label="Prefix" hint="Tax invoices" error={problemFor('prefix')}>
            {({ id }) => (
              <Input
                id={id}
                value={form.prefix}
                disabled={!canEdit}
                maxLength={10}
                invalid={Boolean(problemFor('prefix'))}
                onChange={(e) => setForm({ ...form, prefix: e.target.value })}
                className="font-mono"
              />
            )}
          </Field>

          <Field label="Prefix for bills without GST" hint="A separate run" error={problemFor('nonGstPrefix')}>
            {({ id }) => (
              <Input
                id={id}
                value={form.nonGstPrefix}
                disabled={!canEdit}
                maxLength={10}
                invalid={Boolean(problemFor('nonGstPrefix'))}
                onChange={(e) => setForm({ ...form, nonGstPrefix: e.target.value })}
                className="font-mono"
              />
            )}
          </Field>

          <Field label="Separator" error={problemFor('separator')}>
            {({ id }) => (
              <Select
                id={id}
                value={form.separator}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, separator: e.target.value as SeriesFormat['separator'] })}
              >
                <option value="/">Slash — INV/25-26/00001</option>
                <option value="-">Dash — INV-25-26-00001</option>
                <option value="">None — INV2526000001</option>
              </Select>
            )}
          </Field>

          <Field label="Financial year in the number">
            {({ id }) => (
              <Select
                id={id}
                value={form.includeFinancialYear ? 'yes' : 'no'}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, includeFinancialYear: e.target.value === 'yes' })}
              >
                <option value="yes">Yes — INV/25-26/00001</option>
                <option value="no">No — INV/00001</option>
              </Select>
            )}
          </Field>

          <Field label="Digits" hint="Zero-padding" error={problemFor('padding')}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={10}
                value={form.padding}
                disabled={!canEdit}
                invalid={Boolean(problemFor('padding'))}
                onChange={(e) => setForm({ ...form, padding: Number(e.target.value) })}
              />
            )}
          </Field>

          <Field label="Restart the count">
            {({ id }) => (
              <Select
                id={id}
                value={form.reset}
                disabled={!canEdit}
                onChange={(e) => setForm({ ...form, reset: e.target.value as SeriesFormat['reset'] })}
              >
                <option value="FINANCIAL_YEAR">Every April — back to 1 each financial year</option>
                <option value="NEVER">Never — one continuous count</option>
              </Select>
            )}
          </Field>

          <Field
            label="Start tax invoices at"
            hint="Only while empty"
            error={problemFor('startFrom')}
          >
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                value={form.startFrom}
                disabled={!canEdit}
                invalid={Boolean(problemFor('startFrom'))}
                onChange={(e) => setForm({ ...form, startFrom: Number(e.target.value) })}
              />
            )}
          </Field>

          <Field label="Start bills without GST at" hint="Only while empty" error={problemFor('nonGstStartFrom')}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                value={form.nonGstStartFrom}
                disabled={!canEdit}
                invalid={Boolean(problemFor('nonGstStartFrom'))}
                onChange={(e) => setForm({ ...form, nonGstStartFrom: Number(e.target.value) })}
              />
            )}
          </Field>
        </FormRow>

        <p className="flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            A bill number may be at most 16 characters and may contain only letters, numbers, &ldquo;-&rdquo; and
            &ldquo;/&rdquo;. Bills with GST and bills without it count separately, so your tax invoice numbers stay an
            unbroken run with nothing else mixed in. A starting number only applies while a series has no bills in it —
            once a bill exists, the count carries on from it, because reaching back would give two sales the same number.
          </span>
        </p>

        {/* Where each branch actually is. Without this, an owner with 400 bills
            behind them reads the preview as a threat to renumber them all. */}
        <div className="overflow-hidden rounded-lg border border-stone-200">
          <table className="w-full text-xs">
            <thead className="bg-stone-50/60 text-2xs uppercase tracking-wide text-ink-subtle">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Branch</th>
                <th className="px-3 py-2 text-left font-medium">Next tax invoice</th>
                <th className="px-3 py-2 text-left font-medium">Next bill without GST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {preview.map((row) => (
                <tr key={row.branchId}>
                  <td className="px-3 py-2 font-medium text-ink">{row.branchName}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-ink">{row.numbers[0]}</span>
                    <span className="ml-2 text-2xs text-ink-subtle">
                      {row.issued > 0 ? `${count(row.issued)} issued` : 'none yet'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-ink">{row.nonGstNumbers[0]}</span>
                    <span className="ml-2 text-2xs text-ink-subtle">
                      {row.nonGstIssued > 0 ? `${count(row.nonGstIssued)} issued` : 'none yet'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEdit ? (
          <div className="flex items-center justify-end gap-2">
            {dirty ? <span className="text-2xs text-ink-subtle">Unsaved changes</span> : null}
            <Button onClick={save} disabled={busy || problems.length > 0 || !dirty}>
              {busy ? 'Saving…' : 'Save numbering'}
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
