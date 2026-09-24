'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Mail, MessageSquare, Send, Smartphone } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
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
  delivery: { live: boolean; source: string; reason: string | null; simulated?: boolean };
  quota: { meter: string | null; available: number | null };
  whatsappLink: string | null;
  /** Links that resolved for this customer, invoice or appointment. */
  quickLinks: { label: string; url: string }[];
}

const CHANNELS: { value: Channel; label: string; icon: typeof MessageSquare }[] = [
  { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageSquare },
  { value: 'SMS', label: 'SMS', icon: Smartphone },
  { value: 'EMAIL', label: 'Email', icon: Mail },
];

/** {{customer_name}} → "Customer name", for a label somebody can read. */
function humanise(name: string): string {
  const words = name.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const isDateVariable = (name: string) => /date|day|expiry|anniversary|birthday/.test(name);
const isTimeVariable = (name: string) => /time/.test(name);

/** A placeholder imported from Meta that nobody has matched to a field yet. */
const isUnmapped = (name: string) => /^unmapped_\d+$/.test(name);

function today(): string {
  return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function now(): string {
  return new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

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
  /**
   * Values typed in for placeholders nothing could fill.
   *
   * Held in a ref as well as state because `load` is a useCallback that must
   * not re-create on every keystroke — the preview is re-rendered by the
   * SERVER, so the values have to travel with the request rather than being
   * substituted here. Two renderers would drift, and the one the customer gets
   * is the server's.
   */
  const [vars, setVars] = useState<Record<string, string>>({});
  const varsRef = useRef(vars);
  varsRef.current = vars;
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
        variables: varsRef.current,
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

  /**
   * Re-render after they stop typing.
   *
   * A request per keystroke would be both wasteful and jumpy; waiting for a
   * pause means the preview they read is the message that will be sent.
   */
  const varsKey = JSON.stringify(vars);
  useEffect(() => {
    if (!open || varsKey === '{}') return;
    const timer = setTimeout(() => void load(), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varsKey]);

  // A different template has different blanks; keeping the old answers would
  // quietly put last template's date into this one.
  useEffect(() => setVars({}), [templateId]);

  // Reset when the sheet is reopened for someone else.
  useEffect(() => {
    if (!open) {
      setTemplateId('');
      setBody('');
      setEdited(false);
      setPreview(null);
      setVars({});
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
        variables: vars,
      });
      // Not "Sent". /messages/send queues the message; the worker hands it to
      // WhatsApp a moment later, and the provider can still refuse it. Saying
      // "sent" here is how a message that never arrived came to look exactly
      // like one that did.
      toast.success(`Queued for ${target.name} — see Messages for delivery`);
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
            disabled={
              blocked ||
              noAddress ||
              outOfQuota ||
              !body.trim() ||
              !preview?.delivery.live ||
              // A blank is not a cosmetic problem on a template: Meta counts
              // parameters and rejects the send outright. Two of these went out
              // as failures before the gaps were visible at all.
              Boolean(preview?.unresolved.length)
            }
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

        {/* The one thing that cannot be typed by hand.
            An invoice address ends in a 24-character token nobody can read off
            a screen, and "write it myself" is the first option in the picker
            above -- so the links that resolved for THIS customer are one press
            away. A link that did not resolve is not offered at all, rather
            than offered and broken. */}
        {preview?.quickLinks?.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-2xs text-ink-subtle">Add a link:</span>
            {preview.quickLinks.map((link) => (
              <button
                key={link.url}
                type="button"
                title={link.url}
                className="rounded-md border border-stone-200 px-2 py-1 text-2xs text-ink hover:border-stone-300 hover:bg-stone-50"
                onClick={() => {
                  setBody((current) => `${current.replace(/\s+$/, '')}\n\n${link.label}: ${link.url}`.trim());
                  setEdited(true);
                }}
              >
                + {link.label}
              </button>
            ))}
          </div>
        ) : null}

        {preview?.unresolved.length ? (
          <div className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
            <div className="flex items-start gap-2 text-xs leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {templateId ? (
                  <>
                    WhatsApp rejects a template with an empty value —{' '}
                    <span className="font-mono text-2xs">#131008 Required parameter is missing</span> — so these have
                    to be filled in before this can send.
                  </>
                ) : (
                  <>The customer would see a blank where each of these should be.</>
                )}
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {preview.unresolved.map((name) => (
                <Field
                  key={name}
                  label={isUnmapped(name) ? `Unmatched placeholder (${name})` : humanise(name)}
                  hint={
                    isUnmapped(name)
                      ? 'Imported from Meta and never matched to a field — fix it on the template to stop being asked every time'
                      : undefined
                  }
                >
                  {({ id }) => (
                    <div className="flex items-center gap-1.5">
                      <Input
                        id={id}
                        value={vars[name] ?? ''}
                        onChange={(e) => setVars((v) => ({ ...v, [name]: e.target.value }))}
                        placeholder={isDateVariable(name) ? today() : isTimeVariable(name) ? now() : ''}
                      />
                      {/* Offered, never applied on its own. Filling a
                          cancellation notice with today's date when the
                          appointment was next Tuesday tells the customer
                          something false, and nothing on screen would say so. */}
                      {isDateVariable(name) || isTimeVariable(name) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setVars((v) => ({ ...v, [name]: isTimeVariable(name) ? now() : today() }))
                          }
                        >
                          {isTimeVariable(name) ? 'Now' : 'Today'}
                        </Button>
                      ) : null}
                    </div>
                  )}
                </Field>
              ))}
            </div>
          </div>
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

        {/* Shown when the channel is not connected AND when it is simulated:
            a simulated send is "live" as far as the queue is concerned, which
            is exactly why the person pressing the button has to be told. */}
        {preview && (!preview.delivery.live || preview.delivery.simulated) ? (
          <Warning tone="amber">{preview.delivery.reason}</Warning>
        ) : null}

        {/* The remaining allowance used to be printed here on every send.
            Nobody sending one message to one customer is deciding anything
            with it, and a number that large reads as a target. When it matters
            -- when it runs out -- the warning above says so. The full meter
            lives on the billing screen, where somebody is actually looking at
            usage. */}
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
