'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { apiDelete, apiPut, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/display';
import { useToast } from '@/components/ui/overlay';

/**
 * The longest edge the stored logo is allowed to have.
 *
 * It is drawn at about 40 pixels high in an email and 48 in the app, so 512
 * covers every screen worth covering and a retina one twice over. Anything
 * larger is bytes nobody sees, sent down a customer's mobile connection.
 */
const MAX_EDGE = 512;

/**
 * Shrink in the BROWSER, before anything is uploaded.
 *
 * A salon owner picks the logo off their phone, where it is a 4MB photograph
 * of a signboard. Uploading that and refusing it server-side is a minute of
 * waiting followed by a telling-off, so it is resized here instead and the
 * limit is never reached. It also means a slow connection sends 30KB.
 *
 * Re-encoded as PNG so transparency survives — a logo with a white box around
 * it on a white email is worse than no logo.
 */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot resize the image. Try a smaller file.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL('image/png');
}

export function LogoCard({ logoUrl, salonName, canEdit }: { logoUrl: string | null; salonName: string; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await shrink(file);
      await apiPut('tenant/logo', { dataUrl });
      toast.success('Logo updated');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiDelete('tenant/logo');
      toast.success('Logo removed');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <p className="text-xs font-semibold text-ink">Logo</p>
      <p className="mt-1 text-2xs leading-relaxed text-ink-subtle">
        Shown at the top of your emails, on your booking page and on the feedback form — your salon&apos;s, not
        Parlon&apos;s. Customers never see Parlon.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={salonName} className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm font-semibold text-ink-subtle">{salonName.slice(0, 2).toUpperCase()}</span>
          )}
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => void choose(event.target.files?.[0])}
            />
            <Button variant="secondary" loading={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
              {logoUrl ? 'Replace' : 'Upload a logo'}
            </Button>
            {logoUrl ? (
              <Button variant="ghost" className="text-rose-700" onClick={() => void remove()} disabled={busy}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-2xs text-ink-subtle">Ask an owner to change this.</p>
        )}
      </div>

      <p className="mt-2 text-2xs text-ink-subtle">
        PNG, JPEG or WebP. Large images are shrunk to 512px here before uploading, so a photo off your phone is fine.
      </p>
    </Card>
  );
}
