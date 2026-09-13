'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Megaphone, Send } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/display';
import { count, money } from '@/lib/format';
import type { Campaign, MessageTemplate, Segment } from '@/lib/types';

export function CampaignComposer({
  segments,
  templates,
  defaultSegmentId,
}: {
  segments: Segment[];
  templates: MessageTemplate[];
  defaultSegmentId?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    segmentId: defaultSegmentId ?? segments[0]?.id ?? '',
    templateId: '',
    costPerMessage: 0.8,
    scheduledAt: '',
    sendNow: true,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const segment = segments.find((s) => s.id === form.segmentId);
  const template = templates.find((t) => t.id === form.templateId);
  const marketing = template?.category === 'MARKETING';
  const estimatedCost = (segment?.lastCount ?? 0) * form.costPerMessage;

  async function submit() {
    setError(null);
    if (!form.name.trim() || !form.segmentId || !form.templateId) {
      setError('A name, an audience and a template are all needed.');
      return;
    }

    setSaving(true);
    try {
      const campaign = await apiPost<Campaign>('campaigns', {
        name: form.name.trim(),
        channel: template?.channel ?? 'WHATSAPP',
        segmentId: form.segmentId,
        templateId: form.templateId,
        costPerMessage: form.costPerMessage,
        scheduledAt: form.sendNow ? undefined : form.scheduledAt || undefined,
      });

      await apiPost(`campaigns/${campaign.id}/launch`, {
        sendAt: form.sendNow ? undefined : form.scheduledAt || undefined,
      });

      toast.success(form.sendNow ? 'Campaign queued for sending' : 'Campaign scheduled');
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
      <Button onClick={() => setOpen(true)}>
        <Megaphone className="h-4 w-4" />
        New campaign
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New campaign"
        description="Send once to a segment. Bookings and revenue are credited back for the next 14 days."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              <Send className="h-4 w-4" />
              {form.sendNow ? 'Send now' : 'Schedule'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <Field label="Campaign name" required>
            {({ id }) => (
              <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="September win-back" autoFocus />
            )}
          </Field>

          <Field label="Audience" required hint={segment ? `${count(segment.lastCount)} customers at last count` : undefined}>
            {({ id }) => (
              <Select id={id} value={form.segmentId} onChange={(e) => set('segmentId', e.target.value)}>
                <option value="">Choose a segment…</option>
                {segments.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.lastCount})
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Message template" required>
            {({ id }) => (
              <Select id={id} value={form.templateId} onChange={(e) => set('templateId', e.target.value)}>
                <option value="">Choose a template…</option>
                {templates.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} — {option.channel.toLowerCase()} / {option.category.toLowerCase()}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {template ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Badge tone={marketing ? 'warning' : 'info'}>{template.category.toLowerCase()}</Badge>
                <Badge tone={template.approvalStatus === 'APPROVED' ? 'success' : 'neutral'}>
                  {template.approvalStatus.toLowerCase()}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink">{template.bodyText}</p>
              {marketing ? (
                <p className="mt-2 text-2xs text-amber-700">
                  Marketing template — it will only reach customers who have opted in to WhatsApp.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cost per message (₹)" hint="Used to work out ROI">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  step="0.1"
                  value={form.costPerMessage}
                  onChange={(e) => set('costPerMessage', Number(e.target.value))}
                  className="tnum text-right"
                />
              )}
            </Field>

            <Field label="When">
              {({ id }) => (
                <Select id={id} value={form.sendNow ? 'now' : 'later'} onChange={(e) => set('sendNow', e.target.value === 'now')}>
                  <option value="now">Send now</option>
                  <option value="later">Schedule</option>
                </Select>
              )}
            </Field>
          </div>

          {!form.sendNow ? (
            <Field label="Send at" required>
              {({ id }) => (
                <Input id={id} type="datetime-local" value={form.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} />
              )}
            </Field>
          ) : null}

          {segment ? (
            <p className="rounded-lg bg-stone-50 p-3 text-xs text-ink-muted">
              Roughly {count(segment.lastCount)} messages · estimated spend{' '}
              <span className="tnum font-medium text-ink">{money(estimatedCost)}</span>. Anyone who has not opted in is
              skipped, so the real number may be lower.
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
