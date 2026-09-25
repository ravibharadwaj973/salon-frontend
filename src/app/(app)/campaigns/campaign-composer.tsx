'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Megaphone, Send } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/display';
import { count, money } from '@/lib/format';
import { TemplateFields, type Readiness } from './template-fields';
import { ObjectivePicker, type Attribution } from './objective-picker';
import type { Campaign, MessageTemplate, Segment } from '@/lib/types';

export type ChannelKey = 'WHATSAPP' | 'SMS' | 'EMAIL';
export type Reach = Record<
  ChannelKey,
  { reachable: number; noAddress: number; noConsent: number; undeliverable: number }
>;

export const CHANNEL_WORD: Record<string, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'email' };

/**
 * A campaign goes to thousands of real people and cannot be recalled.
 *
 * So the form does not send. It hands over to a confirmation step that states
 * the four things somebody would want to know before agreeing — who, on what
 * channel, how many of them can actually be reached, and what it costs — and
 * that step is the only place the send button exists.
 *
 * The numbers there are fetched fresh from the server rather than taken from
 * the segment's stored size, because those are different numbers: a segment of
 * 2,400 is around 2,380 on WhatsApp and often under 900 on email, since most
 * walk-ins leave a phone number and no address. A confirmation that overstates
 * the audience is worse than none, because it teaches people to click through.
 */
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
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reach, setReach] = useState<Reach | null>(null);
  const [reachLoading, setReachLoading] = useState(false);

  /**
   * The campaign, once created, so a failed launch can be retried without
   * creating a second one. Pressing send twice after a network error used to
   * leave a duplicate draft behind every time.
   */
  const [createdId, setCreatedId] = useState<string | null>(null);

  /**
   * Values the sender types for the blanks a campaign cannot fill by itself.
   * Kept out of `form` because changing a template must clear them: values
   * typed for one template mean nothing in another, and carrying them over
   * would silently satisfy the readiness check with the wrong text.
   */
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  /**
   * How this campaign will be judged. Separate from `form` because the
   * objective pre-fills the window, so the three move together.
   */
  const [attribution, setAttribution] = useState<Attribution>({
    objective: 'OTHER',
    attributionWindowDays: 14,
    conversionEvents: ['BOOKING', 'VISIT', 'REVENUE'],
  });

  const [form, setForm] = useState({
    name: '',
    segmentId: defaultSegmentId ?? segments[0]?.id ?? '',
    templateId: '',
    costPerMessage: 0.8,
    scheduledAt: '',
    sendNow: true,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    // Any edit invalidates a campaign already created from an earlier attempt.
    setCreatedId(null);
    // A different template has different blanks, so whatever was typed for the
    // old one is discarded rather than quietly reused.
    if (key === 'templateId') {
      setVariables({});
      setReadiness(null);
    }
  };

  const segment = segments.find((s) => s.id === form.segmentId);
  const template = templates.find((t) => t.id === form.templateId);
  const marketing = template?.category === 'MARKETING';
  const channel = (template?.channel ?? 'WHATSAPP') as ChannelKey;

  // How many will actually be sent — not the segment's size.
  const willSend = reach?.[channel]?.reachable ?? null;
  const estimatedCost = (willSend ?? segment?.lastCount ?? 0) * form.costPerMessage;

  // Asked on the confirmation step, for the exact segment and category chosen.
  useEffect(() => {
    if (!confirming || !form.segmentId || !template) return;
    let cancelled = false;
    setReachLoading(true);
    apiGet<Reach>(`segments/${form.segmentId}/reach`, { query: { category: template.category } })
      .then((result) => {
        if (!cancelled) setReach(result);
      })
      .catch(() => {
        // A failed count must not block the send; it falls back to the
        // segment's stored size and says so rather than inventing a figure.
        if (!cancelled) setReach(null);
      })
      .finally(() => {
        if (!cancelled) setReachLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [confirming, form.segmentId, template]);

  function review() {
    setError(null);
    if (!form.name.trim() || !form.segmentId || !form.templateId) {
      setError('A name, an audience and a template are all needed.');
      return;
    }
    if (!form.sendNow && !form.scheduledAt) {
      setError('Pick a date and time, or switch back to sending now.');
      return;
    }
    /**
     * Stopped here rather than at the send. A campaign whose template cannot be
     * filled used to be accepted, scheduled, and then skipped once per
     * recipient — reported as a success that charged nothing and delivered
     * nothing.
     */
    if (readiness && readiness.blocked.length > 0) {
      setError(readiness.blocked[0]!.reason ?? 'This template cannot be used for a campaign.');
      return;
    }
    if (readiness && readiness.missing.length > 0) {
      const names = readiness.missing.map((v) => v.label);
      const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
      setError(
        `Fill in ${list} first. Left empty, every customer would read a blank where the value should be, so nothing would be sent.`,
      );
      return;
    }
    setConfirming(true);
  }

  function close() {
    setOpen(false);
    setConfirming(false);
    setReach(null);
    setCreatedId(null);
    setVariables({});
    setReadiness(null);
  }

  async function send() {
    setError(null);
    setSaving(true);
    try {
      const id =
        createdId ??
        (
          await apiPost<Campaign>('campaigns', {
            name: form.name.trim(),
            channel,
            segmentId: form.segmentId,
            templateId: form.templateId,
            variables,
            objective: attribution.objective,
            attributionWindowDays: attribution.attributionWindowDays,
            conversionEvents: attribution.conversionEvents,
            costPerMessage: form.costPerMessage,
            scheduledAt: form.sendNow ? undefined : form.scheduledAt || undefined,
          })
        ).id;

      // Remember it before launching: if the launch fails, a retry launches
      // this campaign rather than creating another one.
      setCreatedId(id);

      await apiPost(`campaigns/${id}/launch`, {
        sendAt: form.sendNow ? undefined : form.scheduledAt || undefined,
      });

      toast.success(
        form.sendNow
          ? `Sending to ${willSend === null ? 'the segment' : count(willSend)} on ${CHANNEL_WORD[channel]} — see Messages`
          : 'Campaign scheduled',
      );
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
        <Megaphone className="h-4 w-4" />
        New campaign
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={confirming ? 'Send this campaign?' : 'New campaign'}
        description={
          confirming
            ? 'Once it goes out it cannot be recalled. Check the numbers below.'
            : 'Send once to a segment. Bookings and revenue are credited back for the next 14 days.'
        }
        footer={
          confirming ? (
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={saving}>
                Back
              </Button>
              <Button onClick={send} loading={saving} disabled={reachLoading || willSend === 0}>
                <Send className="h-4 w-4" />
                {form.sendNow
                  ? willSend === null
                    ? 'Send now'
                    : `Send to ${count(willSend)}`
                  : 'Schedule it'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button onClick={review}>Review</Button>
            </>
          )
        }
      >
        {confirming ? (
          <ConfirmStep
            name={form.name.trim()}
            segmentName={segment?.name ?? 'the segment'}
            segmentSize={segment?.lastCount ?? 0}
            templateName={template?.name ?? ''}
            channel={channel}
            marketing={marketing}
            reach={reach}
            loading={reachLoading}
            sendNow={form.sendNow}
            scheduledAt={form.scheduledAt}
            estimatedCost={estimatedCost}
            attributionWindowDays={attribution.attributionWindowDays}
            error={error}
          />
        ) : (
          <div className="space-y-4">
            {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

            <Field label="Campaign name" required>
              {({ id }) => (
                <Input
                  id={id}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="September win-back"
                  autoFocus
                />
              )}
            </Field>

            <Field
              label="Audience"
              required
              hint={segment ? `${count(segment.lastCount)} customers at last count` : undefined}
            >
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
                  // Names the template's own channel. It used to say WhatsApp
                  // whatever the template was, which was wrong two times in
                  // three and taught people to ignore it.
                  <p className="mt-2 text-2xs text-amber-700">
                    Marketing template — it will only reach customers who have opted in to{' '}
                    {CHANNEL_WORD[template.channel] ?? template.channel.toLowerCase()}.
                  </p>
                ) : null}
              </div>
            ) : null}

            {template ? (
              <TemplateFields
                templateId={template.id}
                bodyText={template.bodyText}
                values={variables}
                onChange={setVariables}
                onReadiness={setReadiness}
              />
            ) : null}

            <ObjectivePicker value={attribution} onChange={setAttribution} />

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
                  <Select
                    id={id}
                    value={form.sendNow ? 'now' : 'later'}
                    onChange={(e) => set('sendNow', e.target.value === 'now')}
                  >
                    <option value="now">Send now</option>
                    <option value="later">Schedule</option>
                  </Select>
                )}
              </Field>
            </div>

            {!form.sendNow ? (
              <Field label="Send at" required>
                {({ id }) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => set('scheduledAt', e.target.value)}
                  />
                )}
              </Field>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
}

/** The last screen before thousands of messages leave the building. */
export function ConfirmStep({
  name,
  segmentName,
  segmentSize,
  templateName,
  channel,
  marketing,
  reach,
  loading,
  sendNow,
  scheduledAt,
  estimatedCost,
  attributionWindowDays,
  error,
}: {
  name: string;
  segmentName: string;
  segmentSize: number;
  templateName: string;
  channel: ChannelKey;
  marketing: boolean;
  reach: Reach | null;
  loading: boolean;
  sendNow: boolean;
  scheduledAt: string;
  estimatedCost: number;
  attributionWindowDays: number;
  error: string | null;
}) {
  const row = reach?.[channel];
  const word = CHANNEL_WORD[channel] ?? channel.toLowerCase();

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

      <dl className="divide-y divide-stone-200 rounded-lg border border-stone-200 text-sm">
        {[
          ['Campaign', name],
          ['Audience', segmentName],
          ['Template', templateName],
          ['Channel', word],
          // No time at all means a draft: Send again makes one, and a draft
          // has not been scheduled by anybody yet.
          ['When', sendNow ? 'Now' : scheduledAt ? scheduledAt.replace('T', ' at ') : 'Saved as a draft — not sent yet'],
          ['Measured for', `${attributionWindowDays} days after each delivery`],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-3 py-2">
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="text-right text-xs font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {loading ? (
        <p className="rounded-lg bg-stone-50 p-3 text-xs text-ink-muted">Working out who this reaches…</p>
      ) : row ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3">
          <p className="text-sm font-semibold text-brand-900">
            {count(row.reachable)} {row.reachable === 1 ? 'message' : 'messages'} will be sent on {word}
          </p>

          {/* The gap between the segment and the send, itemised. Somebody who
              expected 2,400 and is getting 900 should find out here, with the
              reason, not afterwards from the message log. */}
          {row.noAddress > 0 || row.noConsent > 0 || (row.undeliverable ?? 0) > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-brand-800">
              {row.noAddress > 0 ? (
                <li>
                  {count(row.noAddress)} of the {count(segmentSize)} have no{' '}
                  {channel === 'EMAIL' ? 'email address' : 'phone number'} on file and will be skipped.
                </li>
              ) : null}
              {(row.undeliverable ?? 0) > 0 ? (
                <li>
                  {count(row.undeliverable)} {row.undeliverable === 1 ? 'has' : 'have'}{' '}
                  {channel === 'EMAIL' ? 'an email address' : 'a number'} that came back undeliverable, so they will
                  be skipped — you will not be charged for them. Fixing the{' '}
                  {channel === 'EMAIL' ? 'address' : 'number'} on their profile puts them back in.
                </li>
              ) : null}
              {row.noConsent > 0 ? (
                <li>
                  {count(row.noConsent)} have not opted in to {word}
                  {marketing ? ' marketing' : ''}, so they will be skipped too.
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-brand-800">Everyone in this segment can be reached on {word}.</p>
          )}

          <p className="mt-2 text-xs text-brand-800">
            Estimated spend <span className="tnum font-medium text-brand-900">{money(estimatedCost)}</span>.
          </p>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Could not work out how many this reaches. The segment held {count(segmentSize)} at last count; the real
          number sent may be lower.
        </p>
      )}

      {row?.reachable === 0 ? (
        <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
          Nobody in this segment can be reached on {word}, so there is nothing to send. Try another channel, or
          {(row?.undeliverable ?? 0) > 0
            ? ' correct the addresses that came back undeliverable'
            : channel === 'EMAIL'
              ? ' collect email addresses'
              : ' collect consent'}{' '}
          first.
        </p>
      ) : null}
    </div>
  );
}
