'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Plus } from 'lucide-react';
import { apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/display';
import type { MessageTemplate } from '@/lib/types';

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
    bodyText: template?.bodyText ?? '',
    approvalStatus: template?.approvalStatus ?? 'DRAFT',
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

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
        bodyText: form.bodyText,
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

            <Field label="Provider template name" hint="From WhatsApp Manager">
              {({ id }) => (
                <Input id={id} value={form.providerTemplateName} onChange={(e) => set('providerTemplateName', e.target.value)} className="font-mono" />
              )}
            </Field>

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
          </div>

          <Field label="Message" required hint="Use {{variable}} placeholders">
            {({ id }) => (
              <Textarea id={id} value={form.bodyText} onChange={(e) => set('bodyText', e.target.value)} rows={5} className="leading-relaxed" />
            )}
          </Field>

          {template ? (
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
