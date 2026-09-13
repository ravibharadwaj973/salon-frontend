'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, errorMessage } from '@/lib/client';
import { useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';

export function JourneyToggle({ journeyId, isActive }: { journeyId: string; isActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(isActive);

  async function toggle() {
    const next = !active;
    setBusy(true);
    setActive(next);

    try {
      await apiPost(`journeys/${journeyId}/activate`, { isActive: next });
      toast.success(next ? 'Journey is now running' : 'Journey paused');
      router.refresh();
    } catch (error) {
      setActive(!next);
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      role="switch"
      aria-checked={active}
      aria-label={active ? 'Pause journey' : 'Start journey'}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60',
        active ? 'bg-emerald-500' : 'bg-stone-300',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          active ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
