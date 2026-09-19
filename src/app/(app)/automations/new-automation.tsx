'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import type { MessageTemplate } from '@/lib/types';

/**
 * A SALON BUILDING ITS OWN AUTOMATION.
 *
 * Until now the list was fixed at signup — "ask us if this list is empty",
 * which is a support ticket pretending to be a feature. A salon knows things
 * we do not: that their bridal customers want a call not a message, that
 * Tuesdays are dead, that colour clients need a fortnight's warning rather
 * than a week's.
 *
 * Deliberately narrow. This is not a flowchart editor with branches and
 * conditions: it is a trigger, a wait, and a message, repeated. That covers
 * almost everything a salon actually wants, and each extra box on this screen
 * is another reason for an owner to close it and never come back.
 *
 * It is created SWITCHED OFF. Somebody building their first automation should
 * be able to read it back before it starts messaging their customers.
 */

interface Trigger {
  key: string;
  label: string;
  timingLabel: string | null;
  help: string;
  needsDays: boolean;
}

const CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL'] as const;
type ChannelKey = (typeof CHANNELS)[number];
const CHANNEL_LABEL: Record<ChannelKey, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'Email' };

/** Delays a salon would actually pick, so nobody has to do mental arithmetic. */
const DELAYS = [
  { minutes: 0, label: 'Straight away' },
  { minutes: 60, label: 'After 1 hour' },
  { minutes: 120, label: 'After 2 hours' },
  { minutes: 1440, label: 'The next day' },
  { minutes: 2880, label: 'After 2 days' },
  { minutes: 10080, label: 'After a week' },
  { minutes: 20160, label: 'After 2 weeks' },
  { minutes: 43200, label: 'After a month' },
];

interface StepDraft {
  channel: ChannelKey;
  templateId: string;
  delayMinutes: number;
}

const blankStep = (): StepDraft => ({ channel: 'WHATSAPP', templateId: '', delayMinutes: 0 });

export function NewAutomation() {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [templates, setTemplates] = useState<Record<string, MessageTemplate[]>>({});

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState('');
  const [days, setDays] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([blankStep()]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    apiGet<Trigger[]>('messaging/automation-triggers')
      .then((rows) => !cancelled && setTriggers(rows ?? []))
      .catch(() => !cancelled && setTriggers([]));

    Promise.all(
      CHANNELS.map((channel) =>
        apiGet<MessageTemplate[]>('templates', { query: { channel, pageSize: 100 } })
          .then((rows) => [channel, rows ?? []] as const)
          .catch(() => [channel, [] as MessageTemplate[]] as const),
      ),
    ).then((pairs) => !cancelled && setTemplates(Object.fromEntries(pairs)));

    return () => {
      cancelled = true;
    };
  }, [open]);

  const chosen = triggers.find((t) => t.key === trigger);

  function close() {
    setOpen(false);
    setError(null);
    setName('');
    setDescription('');
    setTrigger('');
    setDays('');
    setSteps([blankStep()]);
  }

  function setStep(index: number, patch: Partial<StepDraft>) {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  async function save() {
    setError(null);

    if (!name.trim()) return setError('Give it a name you will recognise in a list.');
    if (!trigger) return setError('Pick what sets it off.');
    if (chosen?.needsDays && !days) return setError(`${chosen.timingLabel} needs a number.`);
    if (steps.some((s) => !s.templateId)) return setError('Every step needs a message to send.');

    setSaving(true);
    try {
      await apiPost('journeys', {
        name: name.trim(),
        description: description.trim() || undefined,
        trigger,
        triggerConfig: chosen?.needsDays ? { days: Number(days) } : {},
        // Off until the salon has read it back. An automation that starts
        // messaging the moment it is saved is one nobody dares to experiment
        // with.
        isActive: false,
        steps: steps.map((step) => ({
          actionType: 'SEND_MESSAGE',
          delayMinutes: step.delayMinutes,
          channel: step.channel,
          templateId: step.templateId,
        })),
      });

      toast.success(`${name.trim()} created — switch it on when you are ready`);
      close();
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
        <Wand2 className="h-4 w-4" />
        New automation
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="New automation"
        description="Something that happens, then a message. It is created switched off so you can read it back first."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Create, switched off
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <Field label="Name" required hint="What you will call it in the list">
            {({ id }) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Colour clients — 6 week reminder"
                autoFocus
              />
            )}
          </Field>

          <Field label="What sets it off" required>
            {({ id }) => (
              <Select id={id} value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                <option value="">Choose…</option>
                {triggers.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {chosen?.help ? <p className="-mt-2 text-2xs leading-relaxed text-ink-subtle">{chosen.help}</p> : null}

          {chosen?.needsDays ? (
            <Field label={chosen.timingLabel ?? 'After how many days'} required>
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="tnum w-28 text-right"
                  placeholder="45"
                />
              )}
            </Field>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-medium text-ink">Then send</p>
            <div className="space-y-2.5">
              {steps.map((step, index) => {
                const forChannel = templates[step.channel] ?? [];
                return (
                  <div key={index} className="rounded-lg border border-stone-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">
                        Message {index + 1}
                      </span>
                      {steps.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setSteps((c) => c.filter((_, i) => i !== index))}
                          className="text-ink-subtle hover:text-rose-600"
                          aria-label={`Remove message ${index + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <Select
                        value={String(step.delayMinutes)}
                        aria-label={`When to send message ${index + 1}`}
                        onChange={(e) => setStep(index, { delayMinutes: Number(e.target.value) })}
                      >
                        {DELAYS.map((d) => (
                          <option key={d.minutes} value={d.minutes}>
                            {d.label}
                          </option>
                        ))}
                      </Select>

                      {/* Changing the channel clears the template, because a
                          template belongs to exactly one channel and the API
                          refuses a mismatch. */}
                      <Select
                        value={step.channel}
                        aria-label={`Channel for message ${index + 1}`}
                        onChange={(e) =>
                          setStep(index, { channel: e.target.value as ChannelKey, templateId: '' })
                        }
                      >
                        {CHANNELS.map((c) => (
                          <option key={c} value={c}>
                            {CHANNEL_LABEL[c]}
                          </option>
                        ))}
                      </Select>

                      <Select
                        value={step.templateId}
                        aria-label={`Template for message ${index + 1}`}
                        onChange={(e) => setStep(index, { templateId: e.target.value })}
                      >
                        <option value="">
                          {forChannel.length === 0
                            ? `No ${CHANNEL_LABEL[step.channel]} templates`
                            : 'Choose a message…'}
                        </option>
                        {forChannel.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {(templates[step.channel] ?? []).length === 0 ? (
                      <p className="mt-1.5 text-2xs text-amber-700">
                        You have no {CHANNEL_LABEL[step.channel]} templates yet — add them on the Templates page
                        first.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {steps.length < 5 ? (
              <button
                type="button"
                onClick={() => setSteps((c) => [...c, blankStep()])}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Add another message
              </button>
            ) : null}

            <p className="mt-2 text-2xs leading-relaxed text-ink-subtle">
              Each message only reaches customers who can be contacted on that channel and have not opted out.
              Waits are measured from the moment the automation fires, not from the previous message.
            </p>
          </div>

          <Field label="Note to yourself" hint="Optional — why this exists, for whoever reads it in six months">
            {({ id }) => (
              <Textarea
                id={id}
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Colour fades at about six weeks; this catches them before they book elsewhere."
              />
            )}
          </Field>
        </div>
      </Modal>
    </>
  );
}
