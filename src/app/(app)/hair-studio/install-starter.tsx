'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlay';

/**
 * Fill an empty catalogue in one tap.
 *
 * Nobody types thirty hairstyles into a form before they have seen the product
 * work once, so without this the studio is a screen a salon opens, finds empty,
 * and never comes back to. The API skips names that already exist, so pressing
 * it twice is harmless and a style the salon has renamed keeps its name.
 */
export function InstallStarter({ label = 'Add the standard menu' }: { label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function install() {
    setBusy(true);
    try {
      const result = await apiPost<{ created: number; skipped: number }>('hair-studio/hairstyles/install-starter', {});
      toast.success(
        result.created === 0
          ? 'Everything in the standard menu is already here'
          : `Added ${result.created} ${result.created === 1 ? 'style' : 'styles'}`,
      );
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" onClick={install} loading={busy}>
      <Sparkles className="h-4 w-4" />
      {label}
    </Button>
  );
}
