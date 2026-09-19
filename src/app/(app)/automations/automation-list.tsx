'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Info, Settings2 } from 'lucide-react';
import { apiGet, apiPatch, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, EmptyState } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import type { Automation, MessageTemplate } from '@/lib/types';

const CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL'] as const;
type ChannelKey = (typeof CHANNELS)[number];
const CHANNEL_LABEL: Record<ChannelKey, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'Email' };

/** Minutes are how the system stores a delay; nobody thinks in 1,440 of them. */
function humanDelay(minutes: number): string {
  if (minutes === 0) return 'straight away';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} later`;
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'} later`;
  }
  const days = Math.round(minutes / (60 * 24));
  return `${days} day${days === 1 ? '' : 's'} later`;
}

export function AutomationList({ automations }: { automations: Automation[] }) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState<Automation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    days: '',
    sendAfterHour: '',
    sendBeforeHour: '',
    stepDelays: {} as Record<string, string>,
    /** Which channel each step sends on — the salon's choice, per step. */
    stepChannels: {} as Record<string, string>,
    stepTemplates: {} as Record<string, string>,
  });

  /**
   * The salon's own templates, by channel, so the picker only offers messages
   * that can actually be sent on the channel chosen. A WhatsApp template on an
   * email step is rejected by the API; better not to offer it at all.
   */
  const [templates, setTemplates] = useState<Record<string, MessageTemplate[]>>({});

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;

    Promise.all(
      CHANNELS.map((channel) =>
        apiGet<MessageTemplate[]>('templates', { query: { channel, pageSize: 100 } })
          .then((rows) => [channel, rows ?? []] as const)
          .catch(() => [channel, [] as MessageTemplate[]] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setTemplates(Object.fromEntries(pairs));
    });

    return () => {
      cancelled = true;
    };
  }, [editing]);

  function open(automation: Automation) {
    setEditing(automation);
    setForm({
      days: automation.days === null ? '' : String(automation.days),
      sendAfterHour: automation.sendAfterHour === null ? '' : String(automation.sendAfterHour),
      sendBeforeHour: automation.sendBeforeHour === null ? '' : String(automation.sendBeforeHour),
      stepDelays: Object.fromEntries(automation.steps.map((s) => [s.id, String(s.delayMinutes)])),
      stepChannels: Object.fromEntries(automation.steps.map((s) => [s.id, s.channel ?? ''])),
      stepTemplates: Object.fromEntries(automation.steps.map((s) => [s.id, s.template?.id ?? ''])),
    });
  }

  async function toggle(automation: Automation) {
    setBusy(automation.id);
    try {
      await apiPatch(`messaging/automations/${automation.id}`, { isActive: !automation.isActive });
      toast.success(automation.isActive ? `${automation.name} switched off` : `${automation.name} is now running`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await apiPatch(`messaging/automations/${editing.id}`, {
        ...(form.days !== '' ? { days: Number(form.days) } : {}),
        ...(form.sendAfterHour !== '' ? { sendAfterHour: Number(form.sendAfterHour) } : {}),
        ...(form.sendBeforeHour !== '' ? { sendBeforeHour: Number(form.sendBeforeHour) } : {}),
        stepDelays: Object.fromEntries(
          Object.entries(form.stepDelays).map(([id, value]) => [id, Number(value || 0)]),
        ),
        // Only steps that actually have a channel set are sent, so a step that
        // does something other than send a message is left alone.
        stepChannels: Object.fromEntries(
          Object.entries(form.stepChannels).filter(([, value]) => value !== ''),
        ),
        stepTemplates: Object.fromEntries(
          Object.entries(form.stepTemplates).map(([id, value]) => [id, value === '' ? null : value]),
        ),
      });
      toast.success('Automation updated');
      setEditing(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  if (automations.length === 0) {
    return (
      <EmptyState
        title="No automations yet"
        description="Your salon starts with a few ready-made ones. Build your own with New automation above — a trigger, a wait, and a message."
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {automations.map((automation) => (
          <Card key={automation.id}>
            <CardBody className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink">{automation.name}</h3>
                  {automation.isActive ? (
                    <Badge tone="success">Running</Badge>
                  ) : (
                    <Badge tone="neutral">Off</Badge>
                  )}
                </div>

                <p className="mt-0.5 text-xs text-ink-muted">
                  {automation.triggerLabel}
                  {automation.days !== null ? ` · ${automation.days} days` : ''}
                  {automation.runs > 0 ? ` · sent ${automation.runs.toLocaleString('en-IN')} times` : ''}
                </p>

                {automation.steps.length ? (
                  <ol className="mt-2.5 space-y-1">
                    {automation.steps.map((step) => (
                      <li key={step.id} className="flex items-center gap-2 text-2xs text-ink-subtle">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span className="tnum">{humanDelay(step.delayMinutes)}</span>
                        <span className="text-ink-muted">
                          {step.template ? step.template.name : step.actionType.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}

                {automation.help ? (
                  <p className="mt-2 flex items-start gap-1.5 text-2xs text-ink-subtle">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    {automation.help}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => open(automation)}>
                  <Settings2 className="h-4 w-4" />
                  Settings
                </Button>
                <Button
                  variant={automation.isActive ? 'ghost' : 'primary'}
                  size="sm"
                  loading={busy === automation.id}
                  onClick={() => toggle(automation)}
                >
                  {automation.isActive ? 'Switch off' : 'Switch on'}
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? editing.name : ''}
        description={editing?.help || undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy !== null}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy !== null}>
              Save changes
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            {editing.timingLabel ? (
              <Field label={editing.timingLabel} required>
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={form.days}
                    onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                    className="tnum text-right"
                  />
                )}
              </Field>
            ) : (
              <p className="rounded-lg bg-stone-50 p-3 text-xs text-ink-muted">
                This one fires as soon as the event happens, so there is no waiting period to set — only the delays
                between its steps below.
              </p>
            )}

            {editing.steps.length > 1 || editing.steps.some((s) => s.delayMinutes > 0) ? (
              <div>
                <p className="mb-2 text-xs font-medium text-ink">Each step</p>
                <div className="space-y-3">
                  {editing.steps.map((step, index) => {
                    const channel = form.stepChannels[step.id] ?? '';
                    const sendsMessage = step.actionType === 'SEND_MESSAGE';
                    const forChannel = templates[channel] ?? [];

                    return (
                      <div key={step.id} className="rounded-lg border border-stone-200 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-2xs text-ink-subtle">{index + 1}.</span>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                            {step.actionType.replace(/_/g, ' ').toLowerCase()}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={form.stepDelays[step.id] ?? '0'}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, stepDelays: { ...f.stepDelays, [step.id]: e.target.value } }))
                            }
                            className="tnum w-20 text-right"
                            aria-label={`Delay for step ${index + 1}`}
                          />
                          <span className="text-2xs text-ink-subtle">min</span>
                        </div>

                        {sendsMessage ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {/* The salon's choice. WhatsApp is what gets read
                                in India, but a corporate book may want email
                                and a salon without a WhatsApp number needs
                                SMS. Changing it clears the template, because
                                templates belong to one channel. */}
                            <Select
                              value={channel}
                              aria-label={`Channel for step ${index + 1}`}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  stepChannels: { ...f.stepChannels, [step.id]: e.target.value },
                                  stepTemplates: { ...f.stepTemplates, [step.id]: '' },
                                }))
                              }
                            >
                              <option value="">Pick a channel…</option>
                              {CHANNELS.map((c) => (
                                <option key={c} value={c}>
                                  {CHANNEL_LABEL[c]}
                                </option>
                              ))}
                            </Select>

                            <Select
                              value={form.stepTemplates[step.id] ?? ''}
                              aria-label={`Template for step ${index + 1}`}
                              disabled={!channel}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  stepTemplates: { ...f.stepTemplates, [step.id]: e.target.value },
                                }))
                              }
                            >
                              <option value="">
                                {!channel
                                  ? 'Pick a channel first'
                                  : forChannel.length === 0
                                    ? `No ${CHANNEL_LABEL[channel as ChannelKey]} templates yet`
                                    : 'No template — free text'}
                              </option>
                              {forChannel.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-2xs text-ink-subtle">
                  Delays are in minutes — 60 is an hour, 1440 a day, 10080 a week. A step only reaches customers
                  who can be contacted on its channel and have not opted out.
                </p>
              </div>
            ) : null}

            <div className="border-t border-stone-100 pt-4">
              <p className="mb-2 text-xs font-medium text-ink">Only send between</p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={form.sendAfterHour}
                  onChange={(e) => setForm((f) => ({ ...f, sendAfterHour: e.target.value }))}
                  placeholder="9"
                  className="tnum w-20 text-right"
                  aria-label="Send after hour"
                />
                <span className="text-xs text-ink-muted">and</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={form.sendBeforeHour}
                  onChange={(e) => setForm((f) => ({ ...f, sendBeforeHour: e.target.value }))}
                  placeholder="20"
                  className="tnum w-20 text-right"
                  aria-label="Send before hour"
                />
                <span className="text-xs text-ink-muted">o&apos;clock</span>
              </div>
              <p className="mt-1.5 text-2xs text-ink-subtle">
                Leave blank to send at any time. A reminder that arrives at 6am annoys the customer and gets your
                number blocked.
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
