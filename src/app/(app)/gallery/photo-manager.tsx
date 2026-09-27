'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, EyeOff, GripVertical, ImageUp, Trash2 } from 'lucide-react';
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
  /** The service this is work for, so the website can price it. */
  serviceId: string | null;
}

export interface BookableService {
  id: string;
  name: string;
  price: string;
  categoryName: string | null;
}

export interface GalleryData {
  ready: boolean;
  cloudName: string | null;
  collections: { key: string; label: string }[];
  /** Only the services a customer can actually book online. */
  services: BookableService[];
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
  const [tab, setTab] = useState(data.collections[0]?.key ?? '');

  /**
   * The order lives in state while it is being dragged, and is saved when the
   * drag ends.
   *
   * Server state as the starting point and local state as the truth during the
   * gesture: a tile has to follow the cursor NOW, and a round trip per move
   * would make dragging feel broken. Reset from the server whenever it sends a
   * new list, so a failed save or somebody else's change is corrected rather
   * than papered over.
   */
  const [order, setOrder] = useState<GalleryPhoto[]>(data.photos);
  const serverRef = useRef(data.photos);
  if (serverRef.current !== data.photos) {
    serverRef.current = data.photos;
    setOrder(data.photos);
  }

  const showing = order.filter((photo) => photo.collection === tab);

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
            subtitle="Drag to reorder — this is the order they appear on your website."
          />
          {showing.length === 0 ? (
            <EmptyState
              icon={ImageUp}
              title="Nothing here yet"
              description="Add a photograph on the right. A collection with none in it does not appear on your website at all, so there is no half-built page to worry about."
            />
          ) : (
            <CardBody>
              <SortableGrid
                photos={showing}
                cloudName={data.cloudName!}
                collection={tab}
                onReorder={(next) =>
                  setOrder((current) => {
                    // Only this collection's rows move; the other tabs are
                    // untouched, so their order cannot be disturbed by a drag
                    // somewhere else.
                    const others = current.filter((photo) => photo.collection !== tab);
                    return [...others, ...next];
                  })
                }
              />
            </CardBody>
          )}
        </Card>

        <UploadCard collections={data.collections} collection={tab} services={data.services} />
      </div>
    </>
  );
}

/**
 * DRAG TO REORDER, AND ARROWS FOR EVERYBODY ELSE.
 *
 * Native HTML5 drag and drop rather than a library. The repo has no drag
 * dependency and this is one grid — pulling in a reordering library for it
 * would be more to keep current than it saves.
 *
 * ── The arrows are not a nicety ───────────────────────────────────────────
 *
 * Native drag and drop is a mouse gesture. It cannot be performed with a
 * keyboard, and a screen reader is told nothing useful about what is being
 * dragged where. A grid that can ONLY be reordered by dragging is a grid a
 * salon owner using a keyboard cannot reorder at all — so every tile also has
 * move-back and move-forward buttons, which are the same operation and happen
 * to be quicker for moving one tile one place.
 *
 * ── Saving ───────────────────────────────────────────────────────────────
 *
 * On drop, not on every hover. A reorder is one gesture that ends, and firing
 * a request each time a tile passes another would send a dozen for one drag.
 * The whole order goes in one call, so it cannot half-apply.
 *
 * On failure the screen is put back the way the server has it and says so. The
 * alternative — leaving the tiles where the salon dropped them after the save
 * failed — means the website disagrees with what they are looking at, which
 * they discover weeks later.
 */
function SortableGrid({
  photos,
  cloudName,
  collection,
  onReorder,
}: {
  photos: GalleryPhoto[];
  cloudName: string;
  collection: string;
  onReorder: (next: GalleryPhoto[]) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Move one photograph to another photograph's position. */
  const moved = (fromId: string, toId: string): GalleryPhoto[] | null => {
    const from = photos.findIndex((photo) => photo.id === fromId);
    const to = photos.findIndex((photo) => photo.id === toId);
    if (from === -1 || to === -1 || from === to) return null;

    const next = [...photos];
    const [lifted] = next.splice(from, 1);
    next.splice(to, 0, lifted!);
    return next;
  };

  async function save(next: GalleryPhoto[]) {
    onReorder(next);
    setSaving(true);
    try {
      await apiPost('gallery/reorder', { collection, ids: next.map((photo) => photo.id) });
      // Refresh rather than trust: the server is now the order of record, and a
      // later render should agree with it rather than with this component.
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      // Back to the order the server has. Leaving the tiles where they were
      // dropped after a failed save means the website disagrees with what the
      // salon is looking at, and they find out weeks later.
      onReorder(photos);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const nudge = (id: string, delta: number) => {
    const index = photos.findIndex((photo) => photo.id === id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= photos.length) return;
    void save(moved(id, photos[target]!.id) ?? photos);
  };

  return (
    <ul className={`grid grid-cols-2 gap-4 sm:grid-cols-3 ${saving ? 'opacity-70' : ''}`}>
      {photos.map((photo, index) => (
        <li
          key={photo.id}
          draggable
          onDragStart={(event) => {
            setDragging(photo.id);
            // Required for Firefox to start a drag at all.
            event.dataTransfer.setData('text/plain', photo.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          onDragOver={(event) => {
            // Without preventDefault the browser refuses the drop outright.
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            if (photo.id !== over) setOver(photo.id);
          }}
          onDragLeave={() => setOver((current) => (current === photo.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            const fromId = dragging ?? event.dataTransfer.getData('text/plain');
            setDragging(null);
            setOver(null);
            const next = fromId ? moved(fromId, photo.id) : null;
            if (next) void save(next);
          }}
          className={`rounded-xl transition-all ${dragging === photo.id ? 'opacity-40' : ''} ${
            over === photo.id && dragging !== photo.id ? 'ring-2 ring-brand-400 ring-offset-2' : ''
          }`}
        >
          <PhotoTile
            photo={photo}
            cloudName={cloudName}
            position={index + 1}
            total={photos.length}
            onNudge={(delta) => nudge(photo.id, delta)}
          />
        </li>
      ))}
    </ul>
  );
}

function PhotoTile({
  photo,
  cloudName,
  position,
  total,
  onNudge,
}: {
  photo: GalleryPhoto;
  cloudName: string;
  position: number;
  total: number;
  onNudge: (delta: number) => void;
}) {
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
    <div className={photo.isVisible ? '' : 'opacity-60'}>
      <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
        {/* The grip is a hint, not a handle: the whole tile is draggable, and a
            small handle is a small target on a laptop trackpad. */}
        <span
          className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md bg-white/85 px-1.5 py-0.5 text-2xs font-medium text-ink-muted backdrop-blur-sm"
          aria-hidden
        >
          <GripVertical className="h-3 w-3" />
          {position}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb(cloudName, photo.publicId)}
          alt={photo.alt}
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      </div>

      <p className="mt-1.5 line-clamp-2 text-2xs leading-snug text-ink-muted">{photo.alt}</p>
      {/* So the owner can see at a glance which photographs are priced on the
          website and which are just pictures. */}
      {photo.serviceId ? null : (
        <p className="text-2xs text-ink-subtle">No service — no price shown on your site</p>
      )}

      <div className="mt-1.5 flex items-center gap-1">
        {/* THE KEYBOARD ROUTE. Native drag and drop is mouse-only, so without
            these a salon owner on a keyboard cannot reorder at all. They are
            also faster than dragging for moving one tile one place. */}
        <Button
          size="sm"
          variant="ghost"
          disabled={position === 1}
          onClick={() => onNudge(-1)}
          title="Move earlier"
          aria-label={`Move ${photo.alt} earlier (currently ${position} of ${total})`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={position === total}
          onClick={() => onNudge(1)}
          title="Move later"
          aria-label={`Move ${photo.alt} later (currently ${position} of ${total})`}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

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
    </div>
  );
}

function UploadCard({
  collections,
  collection,
  services,
}: {
  collections: { key: string; label: string }[];
  collection: string;
  services: BookableService[];
}) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [target, setTarget] = useState(collection);
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [hovering, setHovering] = useState(false);

  const ready = Boolean(file) && alt.trim().length >= 3;

  function pick(chosen: File | undefined) {
    if (!chosen) return;

    /**
     * Refused here, before it is previewed.
     *
     * A dropped file can be anything — a PDF, a .mov, a folder. The server
     * checks the bytes and would refuse it properly, but only after the browser
     * has spent a minute base64-ing a video on salon broadband. Saying so at the
     * moment of the drop costs nothing and is the difference between "that is
     * not a photograph" and a long wait followed by an error.
     */
    if (!/^image\/(jpeg|png|webp)$/.test(chosen.type)) {
      toast.error(`${chosen.name} is not a JPEG, PNG or WebP photograph.`);
      return;
    }

    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setAlt('');
    setCaption('');
    setServiceId('');
    if (input.current) input.current.value = '';
  }

  async function upload() {
    if (!file || !ready) return;
    setBusy(true);
    try {
      const dataUrl = await shrink(file);
      await apiPost('gallery', {
        collection: target,
        dataUrl,
        alt: alt.trim(),
        caption: caption.trim() || undefined,
        serviceId: serviceId || undefined,
      });
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
        {/**
          * DROP A FILE ON IT, or click it. Both, because a salon owner at a
          * desk drags from a folder and one on a laptop in the salon clicks.
          *
          * It stays a <label> wrapping a file input, so the click path is the
          * browser's own and keeps its keyboard behaviour — a div with an
          * onClick would have needed a tabIndex, a role and a key handler to
          * get back to where a label already is.
          *
          * dragOver has to preventDefault or the browser navigates away to the
          * dropped file instead of handing it over, which loses whatever was
          * typed into the form.
          */}
        <label
          onDragOver={(event) => {
            event.preventDefault();
            if (!hovering) setHovering(true);
          }}
          onDragLeave={(event) => {
            // Only when the pointer genuinely leaves the box. Moving over a
            // child element fires dragleave, and without this the highlight
            // flickers the whole time somebody hovers.
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovering(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setHovering(false);
            /**
             * One file. The form asks for alt text per photograph and requires
             * it, so a drop of twelve would need a queue with twelve boxes to
             * fill in \u2014 worth building, and not by silently taking the first of
             * twelve and dropping eleven on the floor. So it says what it did.
             */
            const files = Array.from(event.dataTransfer.files);
            if (files.length > 1) {
              // toast() with an explicit tone: the context exposes success and
              // error as shorthands and `info` only through the base call.
              toast.toast(
                `Taking ${files[0]!.name} — add the rest one at a time, each needs its own description.`,
                'info',
              );
            }
            pick(files[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            hovering ? 'border-brand-400 bg-brand-50' : 'border-stone-300 hover:border-brand-300 hover:bg-stone-50'
          }`}
        >
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="" className="max-h-40 rounded-lg object-contain" />
          ) : (
            <>
              <ImageUp className={`h-6 w-6 ${hovering ? 'text-brand-500' : 'text-ink-subtle'}`} />
              <span className="text-sm text-ink-muted">
                {hovering ? 'Drop it here' : 'Drag a photograph here, or click to choose'}
              </span>
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

        {/**
          * THE SERVICE, AND WHY IT IS WORTH THE EXTRA SECOND.
          *
          * Naming it puts the price and a "Book this" button under the picture on
          * the website. Without it the photograph is just a picture, and somebody
          * who likes it has to go and find out what it costs — which most of them
          * will not do.
          *
          * Only online-bookable services are offered. Tagging a photograph with
          * something a customer cannot book would put a button on the site that
          * leads nowhere.
          *
          * The price is never copied onto the photograph: the website reads it
          * live, so changing a price changes it everywhere at once.
          */}
        <Field
          label="What service is this?"
          hint="Optional — but it adds the price and a Book button under the photo"
        >
          {({ id }) => (
            <Select id={id} value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
              <option value="">Not a specific service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.categoryName ? `${service.categoryName} · ` : ''}
                  {service.name} — ₹{Math.round(Number(service.price)).toLocaleString('en-IN')}
                </option>
              ))}
            </Select>
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
