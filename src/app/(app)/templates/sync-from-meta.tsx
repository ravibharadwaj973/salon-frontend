'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlay';
import { ImportFromMeta } from './import-from-meta';
import type { MetaSyncOutcome } from '@/lib/types';

/**
 * Ask Meta what it decided.
 *
 * Meta is the only thing that knows a template's real status — ours is a
 * mirror. Before this, the mirror was whatever somebody typed, so a template
 * could sit marked Approved here while Meta had rejected it a week earlier and
 * a month of reminders went nowhere.
 *
 * The result is shown rather than reduced to "Synced": the interesting part is
 * usually what is NOT here — templates written in Business Manager that this
 * app has never heard of, and templates here that were never sent for review.
 */
export function SyncFromMeta() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MetaSyncOutcome | null>(null);
  const [imported, setImported] = useState(0);

  async function sync() {
    setBusy(true);
    try {
      const outcome = await apiPost<MetaSyncOutcome>('templates/sync-from-meta');
      setResult(outcome);
      setImported(0);
      if (!outcome.ok) toast.error(outcome.error ?? 'Meta did not answer');
      else if (outcome.updated.length === 0) toast.success(`Checked ${outcome.checked} templates — nothing changed`);
      else toast.success(`${outcome.updated.length} template${outcome.updated.length === 1 ? '' : 's'} updated`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" loading={busy} onClick={sync}>
        <RefreshCw className="h-4 w-4" />
        Sync with Meta
      </Button>

      {result ? (
        <div className="mt-3 w-full space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3.5 text-xs leading-relaxed text-ink-muted">
          {result.error ? (
            <p className="text-rose-700">
              <strong className="font-semibold">Meta said:</strong> {result.error}
            </p>
          ) : (
            <p>
              Checked {result.checked} template{result.checked === 1 ? '' : 's'} on the WhatsApp account
              {result.source === 'environment' ? ' (the platform account, not this salon’s)' : ''}.
            </p>
          )}

          {result.updated.length > 0 ? (
            <ul className="space-y-1">
              {result.updated.map((row) => (
                <li key={row.name}>
                  <span className="font-mono text-2xs text-ink">{row.name}</span> — {row.from.toLowerCase()} →{' '}
                  <strong className="font-semibold text-ink">{row.to.toLowerCase()}</strong>
                  {row.rejectedReason ? <span className="text-rose-700"> · {row.rejectedReason}</span> : null}
                  {row.recategorised ? (
                    <span className="block text-2xs text-amber-800">
                      Meta filed this as{' '}
                      <strong className="font-semibold">{row.recategorised.to.toLowerCase()}</strong>, not{' '}
                      {row.recategorised.from.toLowerCase()} — it judges the category by the wording, not by what was
                      submitted.
                      {row.recategorised.to === 'MARKETING'
                        ? ' Marketing templates now only go to customers who opted in to marketing.'
                        : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {result.notSubmitted.length > 0 ? (
            <p className="text-amber-800">
              <strong className="font-semibold">Never sent to Meta:</strong> {result.notSubmitted.join(', ')}. WhatsApp
              will not deliver these — open each one and press Submit to Meta.
            </p>
          ) : null}

          {result.onlyOnMeta.length === 0 && imported > 0 ? (
            <p className="text-emerald-800">
              {imported === 1 ? 'Imported 1 template' : `Imported ${imported} templates`} from Meta. Nothing else on
              the account is missing here.
            </p>
          ) : null}

          {result.onlyOnMeta.length > 0 ? (
            <div className="space-y-1.5">
              <p className="font-semibold text-ink">On Meta but not here</p>
              <p>
                Approved on your WhatsApp account and unknown to this app. Import brings the wording, language and
                field order across exactly as Meta holds them — which is safer than retyping it, because the number and
                order of values has to match Meta’s copy or every send is rejected.
              </p>
              <ul className="space-y-1.5">
                {result.onlyOnMeta.map((row) => (
                  <li key={`${row.name}:${row.language}`} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-2xs text-ink">{row.name}</span>
                    <span className="text-ink-subtle">
                      {row.language} · {row.status.toLowerCase()} · {row.parameters} value
                      {row.parameters === 1 ? '' : 's'}
                    </span>
                    <ImportFromMeta
                      template={row}
                      onImported={() => {
                        setImported((n) => n + 1);
                        setResult((current) =>
                          current
                            ? {
                                ...current,
                                onlyOnMeta: current.onlyOnMeta.filter(
                                  (other) => !(other.name === row.name && other.language === row.language),
                                ),
                              }
                            : current,
                        );
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
