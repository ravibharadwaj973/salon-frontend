'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Clock, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { useDebounced } from '@/lib/use-debounced';
import { ConditionValue, type FieldDefinition } from './condition-value';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { count, fullName, money } from '@/lib/format';
import type { Customer } from '@/lib/types';

const OP_LABEL: Record<string, string> = {
  gte: 'at least',
  lte: 'at most',
  gt: 'more than',
  lt: 'less than',
  eq: 'is',
  neq: 'is not',
  in: 'is one of',
  nin: 'is not',
  has: 'includes',
  contains: 'contains',
};

interface Preset {
  key: string;
  name: string;
  why: string;
  rules: { match: 'all' | 'any'; conditions: { field: string; op: string; value: unknown }[] };
}

interface Catalogue {
  fields: FieldDefinition[];
  groups: string[];
  presets: Preset[];
}

interface Condition {
  field: string;
  op: string;
  value: string;
}

interface Preview {
  count: number;
  approximate: boolean;
  whatsappReachable: number;
  emailReachable: number;
  sample: Customer[];
}

export function SegmentBuilder({ branches = [] }: { branches?: { id: string; name: string }[] }) {
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

  /** What can be segmented on, straight from the engine that runs the rules. */
  const { data: catalogue } = useQuery({
    queryKey: ['segment-fields'],
    queryFn: () => apiGet<Catalogue>('segments/fields'),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const fields = useMemo(() => catalogue?.fields ?? [], [catalogue]);
  const fieldFor = (key: string) => fields.find((f) => f.key === key);

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

  /**
   * The count updates as the rules are built, rather than behind a button.
   * Seeing "0 customers match" the moment a rule is too narrow is the whole
   * value of a builder — finding out after saving and sending is not.
   */
  const rulesKey = JSON.stringify(rules);
  const settled = useDebounced(rulesKey, 400);

  useEffect(() => {
    if (!open) return;
    const parsed = JSON.parse(settled) as typeof rules;
    if (parsed.conditions.length === 0) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setBusy('preview');
    apiPost<Preview>('segments/preview', { rules: parsed })
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });

    return () => {
      cancelled = true;
    };
  }, [settled, open]);

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
            <span className="mr-auto flex items-center gap-1.5 text-xs text-ink-muted">
              {busy === 'preview' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  counting…
                </>
              ) : preview ? (
                <>
                  <span className="tnum font-medium text-ink">{count(preview.count)}</span> match
                </>
              ) : null}
            </span>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy === 'save'}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy === 'save'} disabled={preview?.count === 0}>
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

          {catalogue?.presets?.length ? (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                Start from a ready-made list
              </p>
              <div className="flex flex-wrap gap-1.5">
                {catalogue.presets.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    title={preset.why}
                    onClick={() => {
                      setMatch(preset.rules.match);
                      setConditions(
                        preset.rules.conditions.map((condition) => ({
                          field: condition.field,
                          op: condition.op,
                          value: String(condition.value),
                        })),
                      );
                      if (!name.trim()) setName(preset.name);
                      if (!description.trim()) setDescription(preset.why);
                    }}
                    className="rounded-full border border-stone-200 px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-ink-subtle">
                Each one is a starting point — change the numbers to suit your salon.
              </p>
            </div>
          ) : null}

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
                const field = fieldFor(condition.field);
                if (!field) return null;
                return (
                  <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 p-2">
                    <Select
                      value={condition.field}
                      onChange={(event) => {
                        const next = fieldFor(event.target.value);
                        if (!next) return;
                        // A new field means a new kind of value, so the old one
                        // is cleared rather than carried into a control that
                        // cannot hold it.
                        setConditions((current) =>
                          current.map((c, i) => (i === index ? { field: next.key, op: next.ops[0]!, value: '' } : c)),
                        );
                      }}
                      className="w-52"
                    >
                      {(catalogue?.groups ?? []).map((group) => (
                        <optgroup key={group} label={group}>
                          {fields
                            .filter((f) => f.group === group)
                            .map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                        </optgroup>
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

                    <div className="w-44">
                      <ConditionValue
                        field={field}
                        value={condition.value}
                        branches={branches}
                        onChange={(next) =>
                          setConditions((current) =>
                            current.map((c, i) => (i === index ? { ...c, value: next } : c)),
                          )
                        }
                      />
                    </div>

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

                    {field.help ? (
                      <p className="w-full text-2xs leading-relaxed text-ink-subtle">{field.help}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setConditions((current) => [...current, { field: 'totalVisits', op: 'gte', value: '' }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              <Plus className="h-3 w-3" />
              Add a rule
            </button>
          </div>

          {preview ? (
            <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4">
              <p className="text-sm font-medium text-brand-900">
                {preview.approximate ? 'More than ' : ''}
                {count(preview.count)} customer{preview.count === 1 ? '' : 's'} match
              </p>

              {/* Reachability, because the audience you can message is the one
                  that actually matters when the campaign goes out. */}
              <p className="mt-1 text-xs text-brand-700">
                {count(preview.whatsappReachable)} on WhatsApp · {count(preview.emailReachable)} on email
              </p>

              {preview.count > 0 && preview.whatsappReachable < preview.count ? (
                <p className="mt-1 text-xs text-brand-700">
                  {count(preview.count - preview.whatsappReachable)} have not opted in to WhatsApp marketing, so a
                  WhatsApp campaign will skip them.
                </p>
              ) : null}

              {preview.count === 0 ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-brand-700">
                  <Clock className="h-3.5 w-3.5" />
                  Nobody matches yet. Try loosening a number, or switch to matching{' '}
                  <span className="font-medium">any rule</span>.
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
