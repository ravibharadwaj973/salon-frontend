'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import type { MessageTemplate, MetaSubmitOutcome } from '@/lib/types';

/**
 * Send one template to Meta for review, and show exactly what came back.
 *
 * Confirmed first, because submitting is not undoable in the way that counts:
 * the name is consumed, a template cannot be renamed afterwards, and deleting
 * one to correct a name restarts review from zero.
 *
 * Three outcomes, kept distinct because they need different actions:
 *
 *   problems — we refused; Meta never saw it, and nothing was consumed
 *   error    — Meta refused; their sentence is shown verbatim
 *   ok       — accepted, with Meta's id and status
 *
 * Meta's own wording is never paraphrased. "Submission failed" tells a salon
 * nothing; "the template name already exists" tells them what to change.
 */
export function SubmitToMeta({ template }: { template: MessageTemplate }) {
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MetaSubmitOutcome | null>(null);

  if (template.channel !== 'WHATSAPP') return null;

  // Already on Meta. Status comes from Sync from here on; Meta refuses a second
  // submission under the same name anyway.
  const alreadySubmitted = Boolean(template.providerTemplateId);

  async function submit() {
    setAsking(false);
    setBusy(true);
    try {
      const outcome = await apiPost<MetaSubmitOutcome>(`templates/${template.id}/submit-to-meta`);
      setResult(outcome);
      if (outcome.unsaved) {
        // The one case where succeeding is worse than failing: Meta has it and
        // we do not know we have it. Never shown as a success.
        toast.error('Meta accepted it, but it could not be recorded here — read the note below');
        router.refresh();
      } else if (outcome.ok) {
        toast.success(
          outcome.adopted
            ? 'Already on your WhatsApp account — linked to the existing one'
            : `Meta accepted it — status ${outcome.meta?.status ?? 'PENDING'}`,
        );
        router.refresh();
      } else {
        toast.error(outcome.problems?.length ? 'Fix the problems listed before submitting' : 'Meta refused it');
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!alreadySubmitted ? (
        <Button variant="secondary" size="sm" loading={busy} onClick={() => setAsking(true)}>
          <Upload className="h-4 w-4" />
          Submit to Meta
        </Button>
      ) : null}

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={submit}
        title="Send this template to Meta for review?"
        message={
          `It will appear on your WhatsApp account as "${template.providerTemplateName || template.name}" and go into review. ` +
          'A template cannot be renamed once submitted — to change the name you would have to delete it and start review again.'
        }
        confirmLabel="Submit for review"
      />

      {result ? (
        <div className="mt-2.5 space-y-2 text-2xs leading-relaxed">
          {result.problems?.length ? (
            <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Not sent — Meta would refuse this
              </p>
              <ul className="list-disc space-y-1 pl-4">
                {result.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
              <p className="opacity-80">Nothing was submitted, so the name is still free.</p>
            </div>
          ) : null}

          {result.meta?.message ? (
            <div className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">
              <p className="font-semibold">Meta refused it</p>
              <p className="font-mono">{result.meta.message}</p>
              {/* Some of Meta's refusals have a better answer than "try again".
                  A name that already exists is one of them: the template is
                  there, it just needs adopting. */}
              {result.meta.hint ? (
                <p className="rounded-md bg-white/60 p-2 font-medium not-italic">{result.meta.hint}</p>
              ) : null}
              {result.meta.code ? (
                <p className="opacity-70">
                  code {result.meta.code}
                  {result.meta.subcode ? ` · subcode ${result.meta.subcode}` : ''}
                  {result.meta.code === 200 || result.meta.code === 10
                    ? ' — this usually means the access token is missing the whatsapp_business_management permission.'
                    : ''}
                </p>
              ) : null}
            </div>
          ) : null}

          {result.unsaved ? (
            <div className="space-y-1 rounded-lg border-2 border-rose-300 bg-rose-50 p-3 text-rose-900">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Accepted by Meta, but not recorded here
              </p>
              <p>{result.unsaved}</p>
            </div>
          ) : result.ok ? (
            <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              <p className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {result.adopted
                  ? `Already on your WhatsApp account — linked to it (${result.meta?.status ?? 'unknown status'})`
                  : `Meta accepted it — ${result.meta?.status ?? 'PENDING'}`}
              </p>
              <p className="font-mono opacity-80">id {result.meta?.id}</p>
              <p className="opacity-80">
                {result.adopted
                  ? 'Meta already held this name, so nothing new was created. Its status here now comes from Meta.'
                  : 'It is now in review on your WhatsApp account. Press Sync with Meta to pick up the verdict.'}
              </p>
            </div>
          ) : null}

          {result.sent ? (
            <details className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-ink-muted">
              <summary className="cursor-pointer font-semibold text-ink">What was sent to Meta</summary>
              <dl className="mt-2 space-y-1">
                <div>
                  <dt className="inline font-medium text-ink">name </dt>
                  <dd className="inline font-mono">{result.sent.name}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-ink">category </dt>
                  <dd className="inline font-mono">{result.sent.category}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-ink">language </dt>
                  <dd className="inline font-mono">{result.sent.language}</dd>
                </div>
              </dl>
              {/* The numbered form, which is what Meta reviewed — not the
                  named one the salon wrote. Worth seeing side by side when a
                  rejection mentions a placeholder. */}
              <p className="mt-2 whitespace-pre-wrap font-mono text-ink">{result.sent.body}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
