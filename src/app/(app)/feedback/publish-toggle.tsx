'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlay';

/**
 * Put one person's words on the salon's own website, or take them down.
 *
 * A deliberate act with a button, rather than a setting that publishes
 * everything of four stars and above. The salon is putting a stranger's
 * sentence on its own page under its own name — including the sentence about
 * the stylist by name, and the one with a phone number in it. That is a person's
 * judgement every time, and it is quick.
 */
export function PublishToggle({ feedbackId, isPublic }: { feedbackId: string; isPublic: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(isPublic);

  async function toggle() {
    setBusy(true);
    try {
      await apiPost(`feedback/${feedbackId}/publish`, { isPublic: !live });
      setLive(!live);
      toast.success(live ? 'Taken off your website' : 'Now showing on your website');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant={live ? 'secondary' : 'ghost'}
      loading={busy}
      onClick={() => void toggle()}
      title={live ? 'Showing on your website — click to take it down' : 'Show this on your website'}
    >
      {live ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      <span className="ml-1.5">{live ? 'On your site' : 'Publish'}</span>
    </Button>
  );
}
