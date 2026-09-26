'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Eye, EyeOff, ImageUp, Trash2 } from 'lucide-react';
import { apiDelete, apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';

export interface GalleryPhoto {
  id: string;
  collection: string;
  publicId: string;
  width: number;
  height: number;
  alt: string;
  caption: string | null;
  isVisible: boolean;
}

export interface GalleryData {
  ready: boolean;
  cloudName: string | null;
  collections: { key: string; label: string }[];
  photos: GalleryPhoto[];
}

/**
 * The longest edge a gallery photograph is stored at.
 *
 * 2000 rather than the logo's 512: this is work somebody may look at closely,
 * and Cloudinary serves a smaller version to each screen anyway. But bounded,
 * because a modern phone produces a 12-megapixel 8MB file and none of those
 * extra pixels reach a customer.
 */
const MAX_EDGE = 2000;

/**
 * Shrink and re-encode in the BROWSER, before anything is uploaded.
 *
 * A salon owner picks a photograph off their phone, where it is 8MB. Uploading
 * that and refusing it server-side is two minutes of waiting on salon broadband
 * followed by a telling-off. Resized here, it is a few hundred KB and the limit
 * is never reached.
 *
 * JPEG at 0.85 rather than PNG, which is the opposite of the logo uploader's
 * choice and for the opposite reason: a photograph has no transparency to
 * preserve and PNG would make it four times larger.
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

  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Cloudinary delivery, matching what the website asks for. */
function thumb(cloudName: string, publicId: string): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,dpr_auto,w_400,c_fill,g_auto/${publicId}`;
}

export function PhotoManager({ data }: { data: GalleryData }) {
  const [tab, setTab] = useState(data.collections[0]?.key ?? 'colour');
  const showing = data.photos.filter((photo) => photo.collection === tab);

  if (!data.ready) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Photograph hosting is not set up on this server.</p>
              <p className="mt-1">
                Cloudinary needs three values in the server&rsquo;s environment:{' '}
                <span className="font-mono text-xs">CLOUDINARY_CLOUD_NAME</span>,{' '}
                <span className="font-mono text-xs">CLOUDINARY_API_KEY</span> and{' '}
                <span className="font-mono text-xs">CLOUDINARY_API_SECRET</span>. All three — a cloud name on its own
                can build an image address but cannot put anything at the other end of one.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-4 flex w-fit flex-wrap gap-1 border-b border-stone-200">
        {data.collections.map((collection) => {
          const count = data.photos.filter((photo) => photo.collection === collection.key).length;
          return (
            <button
              key={collection.key}
              type="button"
              onClick={() => setTab(collection.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === collection.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {collection.label}
              {count > 0 ? <span className="tnum ml-1.5 text-2xs text-ink-subtle">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            title={data.collections.find((c) => c.key === tab)?.label ?? 'Photographs'}
            subtitle="Newest first. This is the order they appear on your website."
          />
          {showing.length === 0 ? (
            <EmptyState
              icon={ImageUp}
              title="Nothing here yet"
              description="Add a photograph on the right. A collection with none in it does not appear on your website at all, so there is no half-built page to worry about."
            />
          ) : (
            <CardBody>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {showing.map((photo) => (
                  <PhotoTile key={photo.id} photo={photo} cloudName={data.cloudName!} />
                ))}
              </ul>
            </CardBody>
          )}
        </Card>

        <UploadCard collections={data.collections} collection={tab} />
      </div>
    </>
  );
}

function PhotoTile({ photo, cloudName }: { photo: GalleryPhoto; cloudName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await apiPatch(`gallery/${photo.id}`, { isVisible: !photo.isVisible });
      toast.success(photo.isVisible ? 'Hidden from your website' : 'Showing on your website');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiDelete(`gallery/${photo.id}`);
      toast.success('Photograph deleted');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={photo.isVisible ? '' : 'opacity-60'}>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(cloudName, photo.publicId)}
          alt={photo.alt}
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      </div>

      <p className="mt-1.5 line-clamp-2 text-2xs leading-snug text-ink-muted">{photo.alt}</p>

      <div className="mt-1.5 flex items-center gap-1">
        <Button size="sm" variant="ghost" loading={busy} onClick={() => void toggle()} title={photo.isVisible ? 'Hide from your website' : 'Show on your website'}>
          {photo.isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>

        {/* Two taps, because this one cannot be undone: the file is removed
            from Cloudinary as well as from the gallery. The usual reason for
            pressing it is that the customer in the picture asked — which is
            also the reason it must genuinely delete rather than hide. */}
        {confirming ? (
          <Button size="sm" variant="danger" loading={busy} onClick={() => void remove()}>
            Delete for good
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}

function UploadCard({
  collections,
  collection,
}: {
  collections: { key: string; label: string }[];
  collection: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [target, setTarget] = useState(collection);
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = Boolean(file) && alt.trim().length >= 3;

  function pick(chosen: File | undefined) {
    if (!chosen) return;
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setAlt('');
    setCaption('');
    if (input.current) input.current.value = '';
  }

  async function upload() {
    if (!file || !ready) return;
    setBusy(true);
    try {
      const dataUrl = await shrink(file);
      await apiPost('gallery', { collection: target, dataUrl, alt: alt.trim(), caption: caption.trim() || undefined });
      toast.success('Added to your website');
      reset();
      router.refresh();
    } catch (error) {
      // The file and the typed alt text stay put. Losing a sentence somebody
      // just composed to a failed upload is how the field ends up empty.
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader title="Add a photograph" subtitle="It is on your website within the hour." />
      <CardBody className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 px-4 py-8 text-center hover:border-brand-300 hover:bg-stone-50">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="" className="max-h-40 rounded-lg object-contain" />
          ) : (
            <>
              <ImageUp className="h-6 w-6 text-ink-subtle" />
              <span className="text-sm text-ink-muted">Choose a photograph</span>
              <span className="text-2xs text-ink-subtle">JPEG, PNG or WebP</span>
            </>
          )}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => pick(event.target.files?.[0])}
          />
        </label>

        <Field label="Collection">
          {({ id }) => (
            <Select id={id} value={target} onChange={(event) => setTarget(event.target.value)}>
              {collections.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* Required, and the card says why rather than just marking it with an
            asterisk. Asked at upload because this is the only moment anybody
            knows what is in the picture — a week later nobody can write it and
            the field stays empty forever. */}
        <Field
          label="What is in the picture?"
          hint="Read aloud to customers using a screen reader, and shown if the photo fails to load"
        >
          {({ id }) => (
            <Input
              id={id}
              value={alt}
              maxLength={300}
              placeholder="Balayage on dark hair, shoulder length"
              onChange={(event) => setAlt(event.target.value)}
            />
          )}
        </Field>

        <Field label="Caption" hint="Optional. Shown under the photo on your site.">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={caption}
              maxLength={300}
              placeholder="Four hours, two sittings — worth it."
              onChange={(event) => setCaption(event.target.value)}
            />
          )}
        </Field>

        <div className="flex items-center gap-2">
          <Button disabled={!ready} loading={busy} onClick={() => void upload()} className="flex-1">
            Add to my website
          </Button>
          {file ? (
            <Button variant="ghost" onClick={reset} disabled={busy}>
              Clear
            </Button>
          ) : null}
        </div>

        <p className="text-2xs leading-relaxed text-ink-subtle">
          Only your own work. A stock photograph under &ldquo;our colour work&rdquo; is something a customer finds out
          about in the chair. Ask before publishing anybody&rsquo;s face, and keep the answer.
        </p>
      </CardBody>
    </Card>
  );
}
