'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, Sparkles } from 'lucide-react';
import { apiPost } from '@/lib/client';
import { Field, Input } from '@/components/ui/form';

export interface VariableInfo {
  name: string;
  kind: 'AUTOMATIC' | 'FILL_IN' | 'BLOCKED';
  label: string;
  reason?: string;
  example?: string;
}

export interface Readiness {
  ok: boolean;
  automatic: VariableInfo[];
  fillIn: VariableInfo[];
  blocked: VariableInfo[];
  missing: VariableInfo[];
}

/**
 * THE BLANKS IN A TEMPLATE, AND WHO FILLS THEM.
 *
 * Built because of a campaign that reported success, charged nothing and sent
 * nothing: the template was `appointment_cancelled`, it needed
 * {{appointment_date}}, and a campaign has a list of people rather than an
 * appointment. Every message was skipped, and the salon found out afterwards —
 * once per recipient.
 *
 * So the blanks are now shown the moment a template is chosen, sorted into the
 * ones the app fills per customer and the ones the sender has to type. What
 * cannot be filled safely for a whole list at all — an invoice link, a feedback
 * link — is refused here rather than offered as a box, because one value typed
 * into that box goes to everybody on the list.
 */
export function TemplateFields({
  templateId,
  bodyText,
  values,
  onChange,
  onReadiness,
}: {
  templateId: string;
  bodyText: string;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onReadiness: (readiness: Readiness | null) => void;
}) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  /**
   * Classified on the SERVER, by the same function the launch check uses. A
   * second list of "which variables are automatic" kept here would drift, and
   * the screen promising a send would be the thing that was wrong.
   */
  useEffect(() => {
    if (!templateId) {
      setReadiness(null);
      onReadiness(null);
      return;
    }
    let cancelled = false;
    apiPost<Readiness>(`templates/${templateId}/campaign-readiness`, { variables: values })
      .then((result) => {
        if (cancelled) return;
        setReadiness(result);
        onReadiness(result);
      })
      .catch(() => {
        // A failed check must not wedge the form. The launch still refuses a
        // template that cannot be sent, so nothing unsafe gets through.
        if (!cancelled) {
          setReadiness(null);
          onReadiness(null);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, JSON.stringify(values)]);

  if (!readiness) return null;

  const hasBlanks = readiness.fillIn.length > 0 || readiness.blocked.length > 0;

  /** The message as the customer will read it, with what has been typed so far. */
  const preview = bodyText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    if (readiness.automatic.some((v) => v.name === key)) {
      // Shown as a placeholder rather than blank: it IS filled, just not by the
      // person reading this screen, and an empty gap here reads as a fault.
      return key === 'customer_name' || key === 'customer_full_name' ? 'Ravi' : `[${key}]`;
    }
    return values[key]?.trim() || `░░░`;
  });

  return (
    <div className="space-y-3">
      {readiness.blocked.length > 0 ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
            <Ban className="h-3.5 w-3.5" />
            This template cannot be used for a campaign
          </p>
          {readiness.blocked.map((v) => (
            <p key={v.name} className="mt-1 text-2xs leading-relaxed text-rose-700">
              {v.reason}
            </p>
          ))}
        </div>
      ) : null}

      {readiness.fillIn.length > 0 ? (
        <div className="rounded-lg border border-stone-200 p-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">Fill in before sending</p>
          <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">
            The app cannot work these out, so whatever you type goes to everyone in this campaign. Left empty, the
            message would reach customers with a gap in it — so it would not be sent at all.
          </p>

          <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
            {readiness.fillIn.map((v) => {
              const empty = !(values[v.name] ?? '').trim();
              return (
                <Field key={v.name} label={v.label} hint={empty ? 'Needed' : undefined}>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={values[v.name] ?? ''}
                      placeholder={v.example ?? ''}
                      invalid={empty}
                      onChange={(e) => onChange({ ...values, [v.name]: e.target.value })}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </div>
      ) : null}

      {readiness.automatic.length > 0 ? (
        <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-ink-subtle">
          <Sparkles className="mt-px h-3 w-3 shrink-0" />
          Filled in for each customer automatically: {readiness.automatic.map((v) => v.label).join(', ')}.
        </p>
      ) : null}

      {hasBlanks ? (
        <div className="rounded-lg bg-stone-50 p-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">How it will read</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink">{preview}</p>
          {readiness.missing.length > 0 ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              The shaded blocks are what is still missing.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
