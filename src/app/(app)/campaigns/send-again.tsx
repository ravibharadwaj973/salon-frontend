'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Modal, useToast } from '@/components/ui/overlay';
import { ConfirmStep, type ChannelKey, type Reach } from './campaign-composer';

/**
 * SEND THIS CAMPAIGN AGAIN.
 *
 * Two things this has to get right, and the second is the one that was
 * missing.
 *
 * It COPIES rather than re-running, because of the column two places to the
 * left: ROI. A finished campaign's numbers belong to one send — what it cost,
 * who booked, what they spent inside its window. Re-running the row would
 * average two attempts a month apart into a single figure, and that figure is
 * the only reason this screen exists.
 *
 * And it SHOWS WHAT IS ABOUT TO HAPPEN FIRST, which the first version did not:
 * it duplicated silently and navigated away. A campaign is the one action in
 * this app that reaches hundreds of people at once, so it gets the same review
 * as a new one — deliberately the very same component, so the two can never
 * drift into saying different things about the same send.
 *
 * The numbers are recomputed now, not remembered. A segment is a live rule:
 * "Came once, never again" matched twenty-eight in September and may match
 * four today, and the whole point of re-sending is to reach whoever fits now.
 */
export function SendAgain({
  campaignId,
  name,
  channel,
  segmentId,
  segmentName,
  segmentSize,
  templateName,
  templateCategory,
  costPerMessage,
  attributionWindowDays,
}: {
  campaignId: string;
  name: string;
  channel: ChannelKey;
  segmentId: string | null;
  segmentName: string;
  segmentSize: number;
  templateName: string;
  templateCategory: string;
  /** Carried from the original: a copy is sent for the same reason, so it is measured the same way. */
  attributionWindowDays: number;
  costPerMessage: number;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reach, setReach] = useState<Reach | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !segmentId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiGet<Reach>(`segments/${segmentId}/reach`, { query: { category: templateCategory } })
      .then((result) => {
        if (!cancelled) setReach(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setReach(null);
          setError(errorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, segmentId, templateCategory]);

  const willSend = reach?.[channel]?.reachable ?? null;

  async function duplicate() {
    setBusy(true);
    setError(null);
    try {
      const copy = await apiPost<{ id: string; name: string }>(`campaigns/${campaignId}/duplicate`, {});
      toast.success(`${copy.name} created as a draft`);
      setOpen(false);
      // Straight to the copy: it is a DRAFT, and it still has to be launched.
      // Nothing has been sent by pressing this.
      router.push(`/campaigns/${copy.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Send "${name}" again`}
        className="inline-flex items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-2xs text-ink hover:bg-stone-50"
      >
        <Copy className="h-3 w-3" />
        Send again
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Send this campaign again"
        description="A copy is made as a draft. Nothing goes out until you launch it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={duplicate} loading={busy} disabled={loading}>
              Make a draft copy
            </Button>
          </>
        }
      >
        <ConfirmStep
          name={`${name} (copy)`}
          segmentName={segmentName}
          segmentSize={segmentSize}
          templateName={templateName}
          attributionWindowDays={attributionWindowDays}
          channel={channel}
          marketing={templateCategory === 'MARKETING'}
          reach={reach}
          loading={loading}
          sendNow={false}
          /* Not scheduled: the copy is a draft on purpose. The audience, the
             offer or the wording usually wants a look before a second send. */
          scheduledAt=""
          estimatedCost={(willSend ?? segmentSize) * costPerMessage}
          error={error}
        />

        <p className="mt-3 rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
          These numbers are worked out now, not copied from the first send. A segment is a live rule, so who it
          reaches today is not who it reached the first time — which is usually the reason for sending it again.
        </p>
      </Modal>
    </>
  );
}
