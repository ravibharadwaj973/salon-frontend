'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Plus } from 'lucide-react';
import { apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/display';
import { ButtonEditor } from './button-editor';
import type { MessageTemplate, TemplateButton } from '@/lib/types';

interface Preview {
  rendered: string;
  unresolved: string[];
  variablesUsed: string[];
}

export function TemplateEditor({ template, compact }: { template?: MessageTemplate; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: template?.name ?? '',
    channel: template?.channel ?? 'WHATSAPP',
    category: template?.category ?? 'UTILITY',
    language: template?.language ?? 'en',
    providerTemplateName: template?.providerTemplateName ?? '',
    headerText: template?.headerText ?? '',
    bodyText: template?.bodyText ?? '',
    buttons: (template?.buttons ?? []) as TemplateButton[],
    approvalStatus: template?.approvalStatus ?? 'DRAFT',
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /**
   * ONE FORM, THREE CHANNELS THAT DO NOT WORK THE SAME WAY.
   *
   * This editor was built for WhatsApp and then pointed at the other two, so an
   * email template asked for a Provider template name "from WhatsApp Manager",
   * a language code that "must match WhatsApp Manager exactly" and an approval
   * status no email ever has — three fields to ignore and one, the subject
   * line, that could not be edited at all. An SMS asked for buttons.
   *
   * So each channel now shows what it has:
   *
   *   WhatsApp — Meta's name, Meta's language, Meta's verdict, buttons
   *   Email    — a subject line, and nothing to wait for
   *   SMS      — a length, because 160 characters is one message and 161 is two
   */
  const isWhatsApp = form.channel === 'WHATSAPP';
  const isEmail = form.channel === 'EMAIL';
  const isSms = form.channel === 'SMS';

  // What the recipient's phone will actually bill for. GSM-7 fits 160 in one
  // segment and 153 per segment after that; one non-GSM character (a curly
  // quote pasted from Word, an emoji, Devanagari) switches the whole message to
  // UCS-2 at 70. Worth saying before it is sent to two thousand people.
  const smsLength = form.bodyText.length;
  const unicodeSms = /[^\x00-\x7F]/.test(form.bodyText);
  const perSegment = unicodeSms ? 70 : 160;
  const smsSegments = smsLength === 0 ? 0 : Math.ceil(smsLength / (smsLength > perSegment ? (unicodeSms ? 67 : 153) : perSegment));

  async function runPreview() {
    if (!template) return;
    try {
      setPreview(await apiPost<Preview>(`templates/${template.id}/preview`, {}));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submit() {
    setError(null);
    if (!form.name.trim() || !form.bodyText.trim()) {
      setError('A name and a message body are required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        channel: form.channel,
        category: form.category,
        language: form.language,
        providerTemplateName: form.providerTemplateName.trim() || undefined,
        headerText: form.headerText.trim() || undefined,
        bodyText: form.bodyText,
        buttons: form.buttons,
        ...(template ? { approvalStatus: form.approvalStatus } : {}),
      };

      if (template) await apiPatch(`templates/${template.id}`, payload);
      else await apiPost('templates', payload);

      toast.success(template ? 'Template updated' : 'Template created');
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
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
        >
          <Pencil className="h-3 w-3" />
          Edit wording
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New template
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={template ? `Edit ${template.name}` : 'New template'}
        description="Keep it short and human. WhatsApp templates must match what the provider approved."
        footer={
          <>
            {template ? (
              <Button variant="ghost" onClick={runPreview}>
                <Eye className="h-4 w-4" />
                Preview
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {template ? 'Save changes' : 'Create template'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Internal name" required hint="lower_snake_case">
              {({ id }) => (
                <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} className="font-mono" disabled={Boolean(template)} />
              )}
            </Field>

            <Field label="Channel">
              {({ id }) => (
                <Select id={id} value={form.channel} onChange={(e) => set('channel', e.target.value as MessageTemplate['channel'])} disabled={Boolean(template)}>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="SMS">SMS</option>
                  <option value="EMAIL">Email</option>
                </Select>
              )}
            </Field>

            <Field label="Category" hint="Marketing needs opt-in">
              {({ id }) => (
                <Select id={id} value={form.category} onChange={(e) => set('category', e.target.value as MessageTemplate['category'])}>
                  <option value="UTILITY">Utility (transactional)</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="SERVICE">Service</option>
                </Select>
              )}
            </Field>

            {isWhatsApp ? (
              <Field label="Provider template name" hint="From WhatsApp Manager">
                {({ id }) => (
                  <Input id={id} value={form.providerTemplateName} onChange={(e) => set('providerTemplateName', e.target.value)} className="font-mono" />
                )}
              </Field>
            ) : null}

            {isWhatsApp ? (
              <>
              {/*
                WhatsApp treats a template's language as part of its identity: to
                Meta, "hello_world" in en and "hello_world" in en_US are two
                different templates. Sending the wrong one fails with
                "(#132001) Template name does not exist in the translation" —
                which reads like the name is wrong when the name is fine.

                This has to match the language column in WhatsApp Manager exactly.
                Meta's own sample templates are en_US, and a template written in
                Hindi is hi, not hi_IN.
              */}
              <Field label="Template language" hint="Must match WhatsApp Manager exactly">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.language}
                    onChange={(e) => set('language', e.target.value.trim())}
                    placeholder="en_US"
                    list="wa-language-codes"
                    className="font-mono"
                  />
                )}
              </Field>

              <datalist id="wa-language-codes">
                <option value="en_US">English (US) — Meta's sample templates</option>
                <option value="en">English</option>
                <option value="en_GB">English (UK)</option>
                <option value="hi">Hindi</option>
                <option value="mr">Marathi</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
                <option value="bn">Bengali</option>
                <option value="gu">Gujarati</option>
                <option value="kn">Kannada</option>
                <option value="ml">Malayalam</option>
                <option value="pa">Punjabi</option>
              </datalist>
              </>
            ) : null}
          </div>

          {/* Email's subject and WhatsApp's header are the same column and not
              the same thing, so they are not the same field. A subject is the
              whole reason an email gets opened; a WhatsApp header is an
              optional bold line Meta caps at 60 characters. */}
          {isEmail ? (
            <Field
              label="Subject line"
              required
              hint="What the customer sees in their inbox. Variables work here too."
            >
              {({ id }) => (
                <Input
                  id={id}
                  value={form.headerText}
                  onChange={(e) => set('headerText', e.target.value)}
                  placeholder="Your appointment at {{salon_name}} is confirmed"
                />
              )}
            </Field>
          ) : null}

          {isWhatsApp ? (
            <Field label="Header" hint="Optional bold line above the message. 60 characters, one variable at most.">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.headerText}
                  onChange={(e) => set('headerText', e.target.value)}
                  maxLength={60}
                />
              )}
            </Field>
          ) : null}

          <Field
            label={isEmail ? 'Email body' : 'Message'}
            required
            hint="Use {{variable}} placeholders"
          >
            {({ id }) => (
              <Textarea
                id={id}
                value={form.bodyText}
                onChange={(e) => set('bodyText', e.target.value)}
                rows={isEmail ? 10 : 5}
                className="leading-relaxed"
              />
            )}
          </Field>

          {/* Said before sending rather than discovered on the bill. */}
          {isSms ? (
            <p className={`text-2xs ${smsSegments > 1 ? 'text-amber-800' : 'text-ink-subtle'}`}>
              {smsLength} characters ·{' '}
              <strong className="font-semibold">
                {smsSegments} message{smsSegments === 1 ? '' : 's'}
              </strong>{' '}
              per recipient
              {unicodeSms
                ? ' — this message contains a non-Latin character, so the whole thing sends as Unicode at 70 characters per message instead of 160. A curly quote pasted from Word is enough to do it.'
                : smsSegments > 1
                  ? ' — over 160 characters, so every send costs twice. The variables count once they are filled in.'
                  : '. Remember the variables grow when they are filled in.'}
            </p>
          ) : null}

          {isSms ? (
            <p className="text-2xs text-ink-subtle">
              In India this wording has to be registered with DLT before it will deliver, and it has to match exactly —
              a changed word means a re-registration.
            </p>
          ) : null}

          {/* Email gets buttons too, and they are simpler there: no approval,
              no split base-plus-suffix, and a variable holding the whole
              address works. A "View invoice" button beats a bare URL in the
              wording, which half the mail clients will not even make
              clickable. */}
          {isWhatsApp || isEmail ? (
            <>
              <ButtonEditor buttons={form.buttons} onChange={(next) => set('buttons', next)} />
              {isEmail ? (
                <p className="text-2xs text-ink-subtle">
                  On email only link buttons are sent, drawn under the message with the full address printed beneath in
                  case the button is stripped. Leave the URL blank and pick a variable that already holds a whole link,
                  such as <span className="font-mono">invoice_link</span>, and that link becomes the button.
                </p>
              ) : null}
            </>
          ) : null}

          {template && isWhatsApp ? (
            <Field label="Provider approval status" hint="Set this once WhatsApp approves it">
              {({ id }) => (
                <Select id={id} value={form.approvalStatus} onChange={(e) => set('approvalStatus', e.target.value as MessageTemplate['approvalStatus'])}>
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING">Submitted for approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </Select>
              )}
            </Field>
          ) : null}

          {preview ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                How it will read
              </p>
              <p className="whitespace-pre-wrap rounded-md bg-emerald-50 p-3 text-sm leading-relaxed text-ink">
                {preview.rendered}
              </p>
              {preview.unresolved.length > 0 ? (
                <p className="mt-2 text-2xs text-amber-700">
                  Unfilled at preview time: {preview.unresolved.join(', ')} — these are supplied by the journey or
                  campaign at send time.
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1">
                {preview.variablesUsed.map((variable) => (
                  <Badge key={variable}>{`{{${variable}}}`}</Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
