'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlay';

/**
 * Tops the salon up with any starter templates it does not have.
 *
 * Templates are seeded once, at signup. A salon created before the email and
 * SMS starters existed has an empty picker on those tabs of the send screen —
 * which reads as a broken app rather than an empty cupboard — and no way out
 * but writing every message by hand.
 *
 * It never overwrites: a salon that has rewritten its confirmation message
 * keeps its own words, and only genuinely absent ones are added. Safe to press
 * twice, which is why the button says what happened rather than just closing.
 */
export function RestoreDefaults({ label = 'Add the missing starter templates' }: { label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = await apiPost<{ added: number; byChannel: Record<string, number> }>(
        'templates/restore-defaults',
      );

      if (result.added === 0) {
        toast.success('Nothing missing — you already have every starter template.');
      } else {
        const where = Object.entries(result.byChannel)
          .map(([channel, n]) => `${n} ${channel === 'WHATSAPP' ? 'WhatsApp' : channel.toLowerCase()}`)
          .join(', ');
        toast.success(`Added ${result.added} templates (${where}). Nothing you had was changed.`);
      }
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" onClick={run} loading={busy}>
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}
