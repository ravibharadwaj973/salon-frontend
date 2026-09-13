'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Download, Lightbulb, Mail, MessageSquare, Search, Smartphone } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, EmptyState } from '@/components/ui/display';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import type { Channel, LibraryBrowse, LibraryTemplate } from '@/lib/types';

const CHANNEL_ICON: Record<string, typeof MessageSquare> = {
  WHATSAPP: MessageSquare,
  SMS: Smartphone,
  EMAIL: Mail,
};

/**
 * Marketing costs roughly 7.5× utility on WhatsApp, and the difference decides
 * whether a salon's messaging is profitable. It is shown on every card rather
 * than hidden in documentation nobody opens.
 */
function CategoryBadge({ category }: { category: string }) {
  if (category === 'MARKETING') {
    return <Badge tone="warning">Marketing · needs opt-in</Badge>;
  }
  if (category === 'AUTHENTICATION') return <Badge tone="neutral">Verification</Badge>;
  return <Badge tone="success">Utility · low cost</Badge>;
}

export function LibraryBrowser({
  library,
  active,
}: {
  library: LibraryBrowse;
  active: { occasion: string; channel: string; q: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const [q, setQ] = useState(active.q);
  const [preview, setPreview] = useState<LibraryTemplate | null>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  function apply(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`/templates/library?${next.toString()}`);
  }

  function open(template: LibraryTemplate) {
    setPreview(template);
    setName(template.title);
    setBody(template.bodyText);
  }

  async function install() {
    if (!preview) return;
    setBusy(true);
    try {
      await apiPost(`messaging/library/${preview.key}/install`, { name, bodyText: body });
      toast.success(`"${name}" added to your templates`);
      setPreview(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function installGroup(occasion: string, label: string) {
    setBusy(true);
    try {
      const result = await apiPost<{ installed: string[]; skipped: string[] }>(
        `messaging/library/occasions/${occasion}/install`,
      );
      toast.success(
        result.installed.length
          ? `Added ${result.installed.length} ${label.toLowerCase()} templates`
          : `You already have all the ${label.toLowerCase()} templates`,
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const currentOccasion = library.occasions.find((o) => o.key === active.occasion);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-[200px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q });
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages" className="pl-8" />
        </form>

        {(['WHATSAPP', 'SMS', 'EMAIL'] as Channel[]).map((channel) => (
          <button
            key={channel}
            type="button"
            onClick={() => apply({ channel: active.channel === channel ? '' : channel })}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              active.channel === channel
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-stone-200 text-ink-muted hover:bg-stone-50',
            )}
          >
            {channel === 'WHATSAPP' ? 'WhatsApp' : channel === 'SMS' ? 'SMS' : 'Email'}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
        <nav className="lg:sticky lg:top-4 lg:self-start">
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => apply({ occasion: '' })}
                className={cn(
                  'w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  !active.occasion ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-muted hover:bg-stone-100',
                )}
              >
                Everything
                <span className="ml-1.5 text-2xs text-ink-subtle">{library.total}</span>
              </button>
            </li>
            {library.occasions.map((occasion) => (
              <li key={occasion.key}>
                <button
                  type="button"
                  onClick={() => apply({ occasion: occasion.key })}
                  className={cn(
                    'w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    active.occasion === occasion.key
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-ink-muted hover:bg-stone-100',
                  )}
                >
                  {occasion.label}
                  <span className="ml-1.5 text-2xs text-ink-subtle">{occasion.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          {currentOccasion ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
              <div>
                <p className="text-sm font-medium text-ink">{currentOccasion.label}</p>
                <p className="text-xs text-ink-muted">{currentOccasion.description}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={() => installGroup(currentOccasion.key, currentOccasion.label)}
              >
                <Download className="h-4 w-4" />
                Add all {currentOccasion.count}
              </Button>
            </div>
          ) : null}

          {library.items.length === 0 ? (
            <EmptyState title="Nothing matches" description="Try a different search or clear the filters." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {library.items.map((template) => {
                const Icon = CHANNEL_ICON[template.channel] ?? MessageSquare;
                return (
                  <Card key={template.key} className="flex flex-col">
                    <CardBody className="flex flex-1 flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-ink-subtle" />
                          <h3 className="text-sm font-semibold text-ink">{template.title}</h3>
                        </div>
                        {template.installed ? (
                          <span className="flex shrink-0 items-center gap-1 text-2xs font-medium text-emerald-700">
                            <Check className="h-3.5 w-3.5" />
                            Added
                          </span>
                        ) : null}
                      </div>

                      <p className="text-xs text-ink-muted">{template.purpose}</p>

                      <p className="flex-1 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
                        {template.bodyText.length > 180
                          ? `${template.bodyText.slice(0, 180)}…`
                          : template.bodyText}
                      </p>

                      <div className="flex items-center justify-between gap-2">
                        <CategoryBadge category={template.category} />
                        <Button size="sm" variant={template.installed ? 'ghost' : 'secondary'} onClick={() => open(template)}>
                          {template.installed ? 'Add another' : 'Use this'}
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.title ?? ''}
        description={preview?.purpose}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={install} loading={busy}>
              Add to my templates
            </Button>
          </>
        }
      >
        {preview ? (
          <div className="space-y-4">
            {preview.tip ? (
              <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs leading-relaxed text-amber-900">{preview.tip}</p>
              </div>
            ) : null}

            <Field label="Name" hint="What you will call it in your template list">
              {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>

            <Field
              label="Message"
              hint="Change the wording freely — it becomes yours"
            >
              {({ id }) => <Textarea id={id} rows={9} value={body} onChange={(e) => setBody(e.target.value)} />}
            </Field>

            {preview.variables.length ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-ink">Filled in automatically</p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.variables.map((variable) => (
                    <code key={variable} className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-2xs text-ink-muted">
                      {`{{${variable}}}`}
                    </code>
                  ))}
                </div>
                <p className="mt-1.5 text-2xs text-ink-subtle">
                  Keep these as they are — each one is replaced with the customer&apos;s real details when the message
                  is sent.
                </p>
              </div>
            ) : null}

            {preview.channel === 'WHATSAPP' ? (
              <p className="rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
                WhatsApp requires Meta to approve a template before it can be sent to customers. This will be saved as
                a draft — submit it for approval from your template list once the wording is final.
              </p>
            ) : null}

            {preview.channel === 'SMS' ? (
              <p className="rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
                SMS in India needs this exact wording registered on the DLT portal before it will be delivered. Keep it
                under 160 characters — emoji and Hindi text cut the limit to 70 and triple the cost.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
