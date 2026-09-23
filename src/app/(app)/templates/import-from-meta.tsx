'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Modal, useToast } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/display';
import type { MetaOnlyTemplate, MetaImportOutcome } from '@/lib/types';

/**
 * Bring a template Meta already holds into the app.
 *
 * Shown before it happens, because the import is lossy in a way that is
 * invisible afterwards. Meta stores `Hi {{1}}, your appointment on {{2}}` and
 * records nothing about what those positions meant; the only evidence is the
 * example the template was submitted with. Shapes that cannot be mistaken — a
 * date, a time, a URL, a sum, a sample this app itself supplied — are matched.
 * Everything else arrives as {{unmapped_N}}, which nothing fills and which the
 * send guard refuses.
 *
 * So the dialog shows the exact wording that will be created, unmapped
 * placeholders included. Somebody agreeing to import a message with a hole in
 * it should be able to see the hole first.
 */
const UNMAPPED = /\{\{unmapped_\d+\}\}/g;

function Body({ text }: { text: string }) {
  const parts = text.split(UNMAPPED);
  const holes = text.match(UNMAPPED) ?? [];

  return (
    <p className="whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-ink">
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {holes[index] ? (
            <mark className="rounded bg-amber-200 px-1 font-mono text-2xs text-amber-900">{holes[index]}</mark>
          ) : null}
        </span>
      ))}
    </p>
  );
}

export function ImportFromMeta({
  template,
  onImported,
}: {
  template: MetaOnlyTemplate;
  /**
   * Take this row off the list.
   *
   * router.refresh() re-renders the page, but the sync result lives in client
   * state and nothing re-runs the sync — so without this the template stays
   * listed as "on Meta but not here" after being imported, and the obvious
   * thing to do about that is press Import again.
   */
  onImported?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const holes = (template.body.match(UNMAPPED) ?? []).length;

  async function run() {
    setBusy(true);
    try {
      const result = await apiPost<MetaImportOutcome>('templates/import-from-meta', {
        name: template.name,
        language: template.language,
      });
      if (result.ok) {
        toast.success(result.message);
        onImported?.();
      } else {
        toast.error(result.message);
        // "already exists here" is not a failure to retry either: the row is
        // present locally, so it does not belong on this list any more.
        if (result.templateId) onImported?.();
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" />
        Import
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Import “${template.name}” from Meta`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={run}>
              Import this template
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs leading-relaxed text-ink-muted">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="info">{template.language}</Badge>
            <Badge tone={template.category === 'MARKETING' ? 'warning' : 'info'}>
              {template.category.toLowerCase()}
            </Badge>
            <Badge tone={template.status.toUpperCase() === 'APPROVED' ? 'success' : 'neutral'}>
              {template.status.toLowerCase()}
            </Badge>
            <Badge>
              {template.parameters} value{template.parameters === 1 ? '' : 's'} per message
            </Badge>
          </div>

          <p>This is the wording Meta approved, and it is what customers will receive:</p>
          <Body text={template.body} />

          {holes > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">
                  {holes === 1 ? 'One placeholder could not be matched' : `${holes} placeholders could not be matched`}
                </p>
                <p>
                  Meta does not record what its numbered placeholders mean, and the example beside{' '}
                  {holes === 1 ? 'this one' : 'these'} was not a shape that could be identified with certainty. The
                  template will be created, but it cannot send until you open it and replace{' '}
                  {holes === 1 ? 'the highlighted gap' : 'the highlighted gaps'} with a real field such as{' '}
                  <span className="font-mono">{'{{customer_name}}'}</span>.
                </p>
                <p className="opacity-80">
                  Guessing was deliberately avoided here: a wrong guess does not look wrong, it sends one customer
                  another customer’s details.
                </p>
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
              Every placeholder was matched to a customer field. This will be ready to use once imported.
            </p>
          )}

          <p className="text-2xs text-ink-subtle">
            The language is imported as <span className="font-mono">{template.language}</span> because WhatsApp treats
            language as part of a template’s identity — sending it under any other code is rejected.
          </p>
        </div>
      </Modal>
    </>
  );
}
