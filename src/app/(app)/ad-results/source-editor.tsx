'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, FormRow, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { today } from '@/lib/format';
import { CHANNELS, CHANNEL_LABELS, KINDS, KIND_LABELS, type Source } from './types';

/**
 * A code is permanent. The backend refuses to change one, because the code is
 * printed on flyers and sitting in Instagram bios: editing it would break every
 * link already in the world and silently orphan the clicks already recorded
 * against it. So it is editable only while creating, and said out loud there.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

interface FormState {
  name: string;
  code: string;
  channel: string;
  kind: string;
  spend: string;
  dailyBudget: string;
  startedOn: string;
  endedOn: string;
  notes: string;
  isActive: boolean;
}

function initialState(source?: Source): FormState {
  return {
    name: source?.name ?? '',
    code: source?.code ?? '',
    channel: source?.channel ?? 'INSTAGRAM',
    kind: source?.kind ?? 'BOOSTED_POST',
    spend: source ? String(Number(source.spend)) : '',
    dailyBudget: source?.dailyBudget != null ? String(Number(source.dailyBudget)) : '',
    startedOn: source?.startedOn?.slice(0, 10) ?? today(),
    endedOn: source?.endedOn?.slice(0, 10) ?? '',
    notes: source?.notes ?? '',
    isActive: source?.isActive ?? true,
  };
}

export function SourceEditor({
  source,
  trigger,
}: {
  /** Omitted to create; supplied to edit that promotion. */
  source?: Source;
  /** Rendered in place of the default button, for the per-row edit control. */
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => initialState(source));
  /** Once the salon types a code, their spelling wins over the derived one. */
  const [codeTouched, setCodeTouched] = useState(Boolean(source));

  const editing = Boolean(source);

  function show() {
    setForm(initialState(source));
    setCodeTouched(Boolean(source));
    setError(null);
    setOpen(true);
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function setName(value: string) {
    setForm((current) => ({
      ...current,
      name: value,
      code: codeTouched ? current.code : slugify(value),
    }));
  }

  async function submit() {
    setError(null);
    const name = form.name.trim();
    const code = form.code.trim();

    if (!name) {
      setError('Give it a name you will recognise in a month.');
      return;
    }
    if (!editing && !code) {
      setError('A code is needed to build the tracking link.');
      return;
    }

    const spend = form.spend.trim() === '' ? 0 : Number(form.spend);
    const dailyBudget = form.dailyBudget.trim() === '' ? null : Number(form.dailyBudget);
    if (Number.isNaN(spend) || spend < 0 || (dailyBudget !== null && (Number.isNaN(dailyBudget) || dailyBudget < 0))) {
      setError('Amounts have to be numbers, and cannot be negative.');
      return;
    }

    const body = {
      name,
      channel: form.channel,
      kind: form.kind,
      spend,
      dailyBudget,
      startedOn: form.startedOn || null,
      endedOn: form.endedOn || null,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    try {
      if (editing && source) {
        // No `code` in the payload: the backend rejects a change, and sending
        // the unchanged value would turn a harmless save into a 400.
        await apiPatch(`marketing-sources/${source.id}`, { ...body, isActive: form.isActive });
        toast.success('Promotion updated');
      } else {
        await apiPost('marketing-sources', { ...body, code });
        toast.success('Promotion added');
      }
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
      {trigger ? (
        trigger(show)
      ) : (
        <Button onClick={show}>
          <Plus className="h-4 w-4" />
          Add promotion
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit promotion' : 'Add a promotion'}
        description={
          editing
            ? 'Keep the amount spent up to date — every figure on this screen is divided by it.'
            : 'Anything you put money or effort behind: a boosted reel, a paid story, a flyer with a QR code.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {editing ? 'Save' : 'Add promotion'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

          <Field label="Name" required hint="What you will call it when you look back">
            {({ id }) => (
              <Input
                id={id}
                value={form.name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Diwali reel"
                autoFocus
              />
            )}
          </Field>

          {editing ? (
            <Field label="Code" hint="Permanent — the link is already out there">
              {({ id }) => <Input id={id} value={form.code} disabled />}
            </Field>
          ) : (
            <Field
              label="Code"
              required
              hint="Goes in the link. Short, and it cannot be changed later."
              error={form.code && form.code !== slugify(form.code) ? 'Letters, numbers and hyphens only.' : null}
            >
              {({ id }) => (
                <Input
                  id={id}
                  value={form.code}
                  onChange={(event) => {
                    setCodeTouched(true);
                    set('code', event.target.value);
                  }}
                  placeholder="diwali-reel"
                />
              )}
            </Field>
          )}

          <FormRow>
            <Field label="Where">
              {({ id }) => (
                <Select id={id} value={form.channel} onChange={(event) => set('channel', event.target.value)}>
                  {CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {CHANNEL_LABELS[channel]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="What kind">
              {({ id }) => (
                <Select id={id} value={form.kind} onChange={(event) => set('kind', event.target.value)}>
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Spent so far" hint="Total, in rupees">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  step="1"
                  inputMode="decimal"
                  value={form.spend}
                  onChange={(event) => set('spend', event.target.value)}
                  placeholder="0"
                />
              )}
            </Field>
            <Field label="Daily budget" hint="Optional — what you set in Instagram">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  step="1"
                  inputMode="decimal"
                  value={form.dailyBudget}
                  onChange={(event) => set('dailyBudget', event.target.value)}
                  placeholder="—"
                />
              )}
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Started">
              {({ id }) => (
                <Input id={id} type="date" value={form.startedOn} onChange={(event) => set('startedOn', event.target.value)} />
              )}
            </Field>
            <Field label="Ended" hint="Leave empty while it is running">
              {({ id }) => (
                <Input id={id} type="date" value={form.endedOn} onChange={(event) => set('endedOn', event.target.value)} />
              )}
            </Field>
          </FormRow>

          <Field label="Notes">
            {({ id }) => (
              <Textarea
                id={id}
                value={form.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder="Which post, which audience, anything you want to remember"
              />
            )}
          </Field>

          {editing ? (
            <Checkbox
              label="Still running"
              description="Switch this off when you stop paying. Nothing is deleted and the numbers stay."
              checked={form.isActive}
              onChange={(event) => set('isActive', event.target.checked)}
            />
          ) : null}
        </div>
      </Modal>
    </>
  );
}
