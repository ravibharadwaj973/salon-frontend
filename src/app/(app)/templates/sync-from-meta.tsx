'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlay';
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

  async function sync() {
    setBusy(true);
    try {
      const outcome = await apiPost<MetaSyncOutcome>('templates/sync-from-meta');
      setResult(outcome);
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

          {result.onlyOnMeta.length > 0 ? (
            <p>
              <strong className="font-semibold text-ink">On Meta but not here:</strong>{' '}
              {result.onlyOnMeta.map((row) => `${row.name} (${row.status.toLowerCase()})`).join(', ')}. Create a
              template with the same name to use it.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
