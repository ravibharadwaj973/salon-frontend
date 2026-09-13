'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Users } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { count, fullName, money } from '@/lib/format';
import type { Customer } from '@/lib/types';

/** The fields the API's segment engine understands, in plain language. */
const FIELDS: { value: string; label: string; ops: string[]; placeholder: string }[] = [
  { value: 'noVisitDays', label: 'Days since last visit', ops: ['gte', 'lte'], placeholder: '45' },
  { value: 'totalVisits', label: 'Total visits', ops: ['gte', 'lte', 'eq'], placeholder: '2' },
  { value: 'totalSpent', label: 'Lifetime spend (₹)', ops: ['gte', 'lte'], placeholder: '10000' },
  { value: 'avgBill', label: 'Average bill (₹)', ops: ['gte', 'lte'], placeholder: '1500' },
  { value: 'tier', label: 'Tier', ops: ['eq', 'in'], placeholder: 'GOLD' },
  { value: 'gender', label: 'Gender', ops: ['eq'], placeholder: 'FEMALE' },
  { value: 'tag', label: 'Has tag', ops: ['has'], placeholder: 'bridal' },
  { value: 'hasMembership', label: 'Has a membership', ops: ['eq'], placeholder: 'true' },
  { value: 'membershipExpiringInDays', label: 'Membership expiring in days', ops: ['lte'], placeholder: '30' },
  { value: 'hasActivePackage', label: 'Has an active package', ops: ['eq'], placeholder: 'true' },
  { value: 'birthdayMonth', label: 'Birthday month (1–12)', ops: ['eq'], placeholder: '9' },
  { value: 'loyaltyPoints', label: 'Loyalty points', ops: ['gte', 'lte'], placeholder: '500' },
  { value: 'hasOutstanding', label: 'Has an unpaid bill', ops: ['eq'], placeholder: 'true' },
  { value: 'usedService', label: 'Has had service (id)', ops: ['eq'], placeholder: 'service id' },
];

const OP_LABEL: Record<string, string> = {
  gte: 'at least',
  lte: 'at most',
  eq: 'is',
  in: 'is one of',
  has: 'includes',
};

interface Condition {
  field: string;
  op: string;
  value: string;
}

interface Preview {
  count: number;
  whatsappReachable: number;
  sample: Customer[];
}

export function SegmentBuilder() {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [match, setMatch] = useState<'all' | 'any'>('all');
  const [conditions, setConditions] = useState<Condition[]>([{ field: 'noVisitDays', op: 'gte', value: '45' }]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rules = {
    match,
    conditions: conditions
      .filter((condition) => condition.value !== '')
      .map((condition) => ({
        field: condition.field,
        op: condition.op,
        value: coerce(condition.value),
      })),
  };

  function coerce(value: string): unknown {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
    if (value.includes(',')) return value.split(',').map((part) => part.trim());
    return value;
  }

  async function runPreview() {
    setBusy('preview');
    setError(null);
    try {
      setPreview(await apiPost<Preview>('segments/preview', { rules }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError('Give the segment a name.');
      return;
    }

    setBusy('save');
    try {
      await apiPost('segments', { name: name.trim(), description: description.trim() || undefined, rules });
      toast.success('Segment saved');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New segment
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Build a segment"
        description="Rules run against live data, so the audience is right on the day you send."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={runPreview} loading={busy === 'preview'}>
              <Users className="h-4 w-4" />
              Count them
            </Button>
            <Button onClick={save} loading={busy === 'save'}>
              Save segment
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              {({ id }) => (
                <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Lapsed 45+ days" autoFocus />
              )}
            </Field>
            <Field label="Description">
              {({ id }) => (
                <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Worth a win-back offer" />
              )}
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-ink">Customers matching</span>
              <Select value={match} onChange={(e) => setMatch(e.target.value as 'all' | 'any')} className="h-7 w-24 text-xs">
                <option value="all">all rules</option>
                <option value="any">any rule</option>
              </Select>
            </div>

            <div className="space-y-2">
              {conditions.map((condition, index) => {
                const field = FIELDS.find((f) => f.value === condition.field) ?? FIELDS[0]!;
                return (
                  <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 p-2">
                    <Select
                      value={condition.field}
                      onChange={(event) => {
                        const nextField = FIELDS.find((f) => f.value === event.target.value)!;
                        setConditions((current) =>
                          current.map((c, i) =>
                            i === index ? { field: nextField.value, op: nextField.ops[0]!, value: '' } : c,
                          ),
                        );
                      }}
                      className="w-52"
                    >
                      {FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </Select>

                    <Select
                      value={condition.op}
                      onChange={(event) =>
                        setConditions((current) =>
                          current.map((c, i) => (i === index ? { ...c, op: event.target.value } : c)),
                        )
                      }
                      className="w-32"
                    >
                      {field.ops.map((op) => (
                        <option key={op} value={op}>
                          {OP_LABEL[op] ?? op}
                        </option>
                      ))}
                    </Select>

                    <Input
                      value={condition.value}
                      onChange={(event) =>
                        setConditions((current) =>
                          current.map((c, i) => (i === index ? { ...c, value: event.target.value } : c)),
                        )
                      }
                      placeholder={field.placeholder}
                      className="w-32"
                    />

                    {conditions.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}
                        className="rounded p-1.5 text-ink-subtle hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Remove rule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setConditions((current) => [...current, { field: 'totalVisits', op: 'gte', value: '2' }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              <Plus className="h-3 w-3" />
              Add a rule
            </button>
          </div>

          {preview ? (
            <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4">
              <p className="text-sm font-medium text-brand-900">
                {count(preview.count)} customers match
                <span className="font-normal text-brand-700">
                  {' '}
                  · {count(preview.whatsappReachable)} can receive WhatsApp marketing
                </span>
              </p>
              {preview.count > 0 && preview.whatsappReachable < preview.count ? (
                <p className="mt-1 text-xs text-brand-700">
                  {count(preview.count - preview.whatsappReachable)} have not opted in, so marketing messages will skip
                  them.
                </p>
              ) : null}

              {preview.sample.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {preview.sample.slice(0, 5).map((customer) => (
                    <li key={customer.id} className="flex items-center justify-between text-xs text-brand-900">
                      <span>{fullName(customer)}</span>
                      <span className="tnum">
                        {customer.totalVisits} visits · {money(customer.totalSpent)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
