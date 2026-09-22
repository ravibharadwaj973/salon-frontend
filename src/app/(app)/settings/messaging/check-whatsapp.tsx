'use client';

import { useState } from 'react';
import { CheckCircle2, Stethoscope, XCircle } from 'lucide-react';
import { apiGet, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlay';

/**
 * Take Meta's one unhelpful sentence apart.
 *
 * Error 100/33 — "does not exist, cannot be loaded due to missing permissions,
 * or does not support this operation" — covers a wrong id, an unassigned asset,
 * a missing scope and a System User in the wrong Business Portfolio, and Meta
 * will not say which, because confirming an object to a token that cannot see
 * it would let anyone enumerate ids.
 *
 * Four read-only questions, asked separately. Which ones fail names the cause,
 * and the verdict says what to change. Nothing here sends or alters anything.
 */
interface Probe {
  step: string;
  what: string;
  ok: boolean;
  detail: string;
}

interface AccessReport {
  configured: boolean;
  source: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  probes: Probe[];
  verdict: string;
}

export function CheckWhatsApp() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AccessReport | null>(null);

  async function check() {
    setBusy(true);
    try {
      setReport(await apiGet<AccessReport>('templates/meta-access'));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const allOk = report?.probes.length ? report.probes.every((p) => p.ok) : false;

  return (
    <div className="sm:col-span-2">
      <Button variant="secondary" size="sm" loading={busy} onClick={check}>
        <Stethoscope className="h-4 w-4" />
        Check WhatsApp connection
      </Button>

      {report ? (
        <div className="mt-3 space-y-2.5 rounded-lg border border-stone-200 bg-stone-50 p-3.5 text-2xs leading-relaxed">
          <ul className="space-y-2">
            {report.probes.map((probe) => (
              <li key={probe.step} className="flex items-start gap-2">
                {probe.ok ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                )}
                <div>
                  <p className="font-medium text-ink">{probe.what}</p>
                  <p className={probe.ok ? 'text-ink-muted' : 'text-rose-800'}>{probe.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          <p
            className={`rounded-md p-2.5 ${
              allOk ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
            }`}
          >
            <strong className="font-semibold">What to do: </strong>
            {report.verdict}
          </p>

          {report.configured ? (
            <p className="text-ink-subtle">
              Checked against {report.source === 'tenant' ? 'this salon’s own' : 'the platform’s'} credentials · account{' '}
              <span className="font-mono">{report.wabaId}</span>
              {report.phoneNumberId ? (
                <>
                  {' '}
                  · number <span className="font-mono">{report.phoneNumberId}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
