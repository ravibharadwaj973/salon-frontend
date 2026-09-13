'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Mail, MessageSquare, Send, Smartphone } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import type { Channel, MessageTemplate } from '@/lib/types';

export interface ShareTarget {
  customerId?: string;
  leadId?: string;
  invoiceId?: string;
  appointmentId?: string;
  /** Shown in the header so staff know who they are messaging. */
  name: string;
}

interface SharePreview {
  channel: Channel;
  to: string | null;
  toLabel: string | null;
  body: string;
  subject: string | null;
  templateName: string | null;
  unresolved: string[];
  consent: { allowed: boolean; status: string; reason: string | null };
  delivery: { live: boolean; source: string; reason: string | null };
  quota: { meter: string | null; available: number | null };
  whatsappLink: string | null;
}

const CHANNELS: { value: Channel; label: string; icon: typeof MessageSquare }[] = [
  { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageSquare },
  { value: 'SMS', label: 'SMS', icon: Smartphone },
  { value: 'EMAIL', label: 'Email', icon: Mail },
];

/**
 * Send something to one customer, from wherever they are on screen.
 *
 * Two ways out, and both matter:
 *
 *  - **Send from the salon** goes through the connected WhatsApp or SMS account:
 *    metered, logged, delivery tracked.
 *  - **Open in WhatsApp** hands the message to whatever WhatsApp the staff
 *    member is already signed into, with the text filled in. Nothing is sent by
 *    us and nothing is metered — but it works on the first day, before Meta has
 *    approved anything.
 */
export function ShareSheet({
  open,
  onClose,
  target,
  title = 'Send a message',
}: {
  open: boolean;
  onClose: () => void;
  target: ShareTarget;
  title?: string;
}) {
  const toast = useToast();

  const [channel, setChannel] = useState<Channel>('WHATSAPP');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [body, setBody] = useState('');
  const [edited, setEdited] = useState(false);
  const [preview, setPreview] = useState<SharePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Load the salon's own templates for whichever channel is selected.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    apiGet<MessageTemplate[]>('templates', { query: { channel, pageSize: 100 } })
      .then((rows) => {
        if (cancelled) return;
        setTemplates(rows ?? []);
      })
      .catch(() => setTemplates([]));

    return () => {
      cancelled = true;
    };
  }, [open, channel]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const result = await apiPost<SharePreview>('messaging/share/preview', {
        channel,
        customerId: target.customerId,
        leadId: target.leadId,
        invoiceId: target.invoiceId,
        appointmentId: target.appointmentId,
        templateId: templateId || undefined,
        body: edited ? body : undefined,
      });
      setPreview(result);
      if (!edited) setBody(result.body);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
    // toast is stable; body/edited deliberately excluded so typing doesn't refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channel, templateId, target.customerId, target.leadId, target.invoiceId, target.appointmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset when the sheet is reopened for someone else.
  useEffect(() => {
    if (!open) {
      setTemplateId('');
      setBody('');
      setEdited(false);
      setPreview(null);
    }
  }, [open]);

  async function send() {
    setSending(true);
    try {
      await apiPost('messages/send', {
        channel,
        customerId: target.customerId,
        leadId: target.leadId,
        templateId: templateId || undefined,
        body: templateId && !edited ? undefined : body,
      });
      toast.success(`Sent to ${target.name}`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  // The link has to carry whatever the staff member actually typed, not the
  // version the server rendered before they edited it.
  const waLink =
    preview?.whatsappLink && body
      ? preview.whatsappLink.replace(/text=.*$/, `text=${encodeURIComponent(body)}`)
      : preview?.whatsappLink;

  const blocked = preview ? !preview.consent.allowed : false;
  const noAddress = preview ? !preview.to : false;
  const outOfQuota = preview?.quota.available === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={preview?.toLabel ? `To ${target.name} · ${preview.toLabel}` : `To ${target.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          {channel === 'WHATSAPP' && waLink ? (
            <Button
              variant="secondary"
              onClick={() => {
                window.open(waLink, '_blank', 'noopener,noreferrer');
                onClose();
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Open in WhatsApp
            </Button>
          ) : null}
          <Button
            onClick={send}
            loading={sending}
            disabled={blocked || noAddress || outOfQuota || !body.trim() || !preview?.delivery.live}
          >
            <Send className="h-4 w-4" />
            Send from the salon
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {CHANNELS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setChannel(option.value);
                  setTemplateId('');
                  setEdited(false);
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  channel === option.value
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-stone-200 text-ink-muted hover:bg-stone-50',
                )}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>

        <Field label="Use a template" hint="Or write your own below">
          {({ id }) => (
            <Select
              id={id}
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setEdited(false);
              }}
            >
              <option value="">No template — write it myself</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.category === 'MARKETING' ? ' (marketing)' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Message" hint={loading ? 'Loading…' : 'Edit freely before sending'}>
          {({ id }) => (
            <Textarea
              id={id}
              rows={7}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setEdited(true);
              }}
              placeholder="Type your message…"
            />
          )}
        </Field>

        {preview?.unresolved.length ? (
          <Warning tone="amber">
            These details could not be filled in: {preview.unresolved.join(', ')}. The customer will see a blank where
            each one should be — type over them before sending.
          </Warning>
        ) : null}

        {blocked ? (
          <Warning tone="rose">{preview?.consent.reason}</Warning>
        ) : null}

        {noAddress ? (
          <Warning tone="rose">
            This {target.customerId ? 'customer' : 'lead'} has no{' '}
            {channel === 'EMAIL' ? 'email address' : 'phone number'} on file, so there is nowhere to send it.
          </Warning>
        ) : null}

        {outOfQuota ? (
          <Warning tone="rose">
            Your {channel.toLowerCase()} allowance is used up for this month and there are no top-up credits left.
            {channel === 'WHATSAPP' ? ' You can still send it from your own WhatsApp.' : ''}
          </Warning>
        ) : null}

        {preview && !preview.delivery.live ? (
          <Warning tone="amber">{preview.delivery.reason}</Warning>
        ) : null}

        {preview?.quota.available !== null && preview?.quota.available !== undefined && preview.quota.available > 0 ? (
          <p className="text-2xs text-ink-subtle">
            {preview.quota.available.toLocaleString('en-IN')} {channel.toLowerCase()} messages left this month.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function Warning({ tone, children }: { tone: 'amber' | 'rose'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg p-3',
        tone === 'rose' ? 'bg-rose-50' : 'bg-amber-50',
      )}
    >
      <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'rose' ? 'text-rose-600' : 'text-amber-600')} />
      <p className={cn('text-xs leading-relaxed', tone === 'rose' ? 'text-rose-900' : 'text-amber-900')}>{children}</p>
    </div>
  );
}

/** A ready-made trigger button, for pages that just want "Send message". */
export function ShareButton({
  target,
  label = 'Send message',
  variant = 'secondary',
  size = 'md',
}: {
  target: ShareTarget;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4" />
        {label}
      </Button>
      <ShareSheet open={open} onClose={() => setOpen(false)} target={target} />
    </>
  );
}
