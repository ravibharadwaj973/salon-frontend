'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Loader2 } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { useToast } from '@/components/ui/overlay';

/**
 * SEND THIS CAMPAIGN AGAIN.
 *
 * It copies rather than re-running, and the reason is the column two places
 * to the left: ROI. A finished campaign's numbers belong to ONE send — what
 * it cost, who booked, what they spent inside its window. Re-running the same
 * row would average two attempts a month apart into a single figure, and that
 * figure is the only reason this screen exists.
 *
 * The copy is a draft. The audience, the offer or the wording almost always
 * wants a look before a second send, and a one-click button that quietly
 * messages a few hundred people is the wrong thing to build.
 */
export function SendAgain({ campaignId, name }: { campaignId: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      title={`Make a new campaign from "${name}"`}
      onClick={async () => {
        setBusy(true);
        try {
          const copy = await apiPost<{ id: string; name: string }>(`campaigns/${campaignId}/duplicate`, {});
          toast.success(`${copy.name} created as a draft`);
          // Straight to the copy: it is a draft, and the next thing anybody
          // does is check the audience before sending it.
          router.push(`/campaigns/${copy.id}`);
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-2xs text-ink hover:bg-stone-50 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
      Send again
    </button>
  );
}
