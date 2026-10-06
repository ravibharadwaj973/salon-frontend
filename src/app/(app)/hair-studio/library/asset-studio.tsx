'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ImageOff, Scissors, Sparkles, Upload, Wand2 } from 'lucide-react';
import { apiGet, apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge, Spinner } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { MaskEditor } from './mask-editor';
import {
  COLOR_FAMILY_LABELS,
  DENSITY_LABELS,
  FACE_SHAPE_LABELS,
  GENDER_LABELS,
  LENGTH_LABELS,
  MAINTENANCE_LABELS,
  SKIN_TONE_LABELS,
  TEXTURE_LABELS,
  type FaceShape,
  type HairColorFamily,
  type HairDensity,
  type HairLength,
  type HairMaintenance,
  type HairTexture,
  type Hairstyle,
  type HairstyleKind,
  type KindsResponse,
  type SkinTone,
} from '../catalogue-types';

/**
 * THE ASSET PIPELINE: DRAW ONE, LOOK AT IT, PUBLISH IT.
 *
 * The middle step is the one that makes this a studio rather than a button.
 * Generation is cheap and judgement is not — an image model draws four plausible
 * heads and one of them looks like the haircut this salon actually does — so
 * nothing is ever attached automatically. A picture becomes the menu's face only
 * when somebody picks it, and the grid behind this screen is the honest view of
 * how much of the menu still has no face at all.
 *
 * Costs money, so: drawn once per style and kept, never per customer and never
 * per page view.
 */

type Status = 'PENDING' | 'SUBMITTED' | 'READY' | 'FAILED' | 'REFUSED';

interface Reference {
  id: string;
  status: Status;
  imageUrl: string | null;
  error: string | null;
  prompt: string;
  seed: number | null;
  createdAt: string;
}

interface GenerationStatus {
  configured: boolean;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number | null;
}

const WORKING: Status[] = ['PENDING', 'SUBMITTED'];
const POLL_MS = 3000;
const POLL_CEILING = 40;

const TEXTURES: HairTexture[] = ['STRAIGHT', 'WAVY', 'CURLY', 'COILY'];
const LENGTHS: HairLength[] = ['VERY_SHORT', 'SHORT', 'MEDIUM', 'LONG', 'VERY_LONG'];
const DENSITIES: HairDensity[] = ['LOW', 'MEDIUM', 'HIGH'];
const FACES: FaceShape[] = ['OVAL', 'ROUND', 'SQUARE', 'OBLONG', 'HEART', 'DIAMOND'];
const MAINTENANCES: HairMaintenance[] = ['LOW', 'MEDIUM', 'HIGH'];

type Filter = 'all' | 'nopicture' | 'inactive';

export function AssetStudio({
  styles,
  kinds,
  options,
}: {
  styles: Hairstyle[];
  kinds: HairstyleKind[];
  options: KindsResponse['options'] | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<GenerationStatus | null>(null);

  useEffect(() => {
    void apiGet<GenerationStatus>('hair-studio/generations/status').then(setStatus, () => {});
  }, []);

  const shown = useMemo(() => {
    if (filter === 'nopicture') return styles.filter((style) => !style.previewUrl);
    if (filter === 'inactive') return styles.filter((style) => !style.isActive);
    return styles;
  }, [styles, filter]);

  const missing = styles.filter((style) => !style.previewUrl).length;

  /** How many of the five tones the salon's own pictures actually cover. */
  const toneCoverage = useMemo(() => {
    const withPictures = styles.filter((style) => style.previewUrl);
    const tones = new Set(withPictures.map((style) => style.skinTone).filter(Boolean));
    return { shown: tones.size, total: withPictures.length };
  }, [styles]);
  const open = styles.find((style) => style.id === openId) ?? null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ['all', `All ${styles.length}`],
            ['nopicture', `No picture ${missing}`],
            ['inactive', 'Hidden'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={cn(
              'rounded-full border px-3 py-1 text-2xs font-medium transition-colors',
              filter === key
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-stone-200 text-ink-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}

        {/*
          THE GAP THE SKIN-TONE FIELD EXISTS TO SHOW.
          
          A salon whose entire library is shot on one complexion has told every
          other customer something it did not mean to, and the fix is not a
          disclaimer — it is being able to see the gap. This is the only screen
          that can show it, so it does.
        */}
        {toneCoverage.shown > 1 ? (
          <span className="text-2xs text-ink-subtle">
            Shown on {toneCoverage.shown} of 5 skin tones
          </span>
        ) : toneCoverage.total > 2 ? (
          <span className="text-2xs text-amber-700">
            Every picture is on one skin tone — worth adding a few others
          </span>
        ) : null}

        {status ? (
          <span className="ml-auto text-2xs text-ink-subtle">
            {status.configured
              ? `${status.usedToday} of ${status.dailyLimit} pictures today`
              : 'Picture generation is not switched on for this server'}
          </span>
        ) : null}
      </div>

      {/*
        A GRID OF FACES, AND THE GAPS ARE THE POINT.

        An empty tile is not a missing nicety, it is a style a customer scrolling
        the look-book will skim past. Showing them as obvious holes rather than as
        a tidy list of names is what gets the menu finished.
      */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => setOpenId(style.id)}
            className={cn(
              'group overflow-hidden rounded-xl border bg-white text-left transition-shadow hover:shadow-pop',
              style.isActive ? 'border-stone-200' : 'border-dashed border-stone-300 opacity-70',
            )}
          >
            <div className="relative aspect-square bg-stone-100">
              {style.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={style.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-ink-subtle">
                  <ImageOff className="h-5 w-5" aria-hidden />
                  <span className="text-2xs">No picture yet</span>
                </div>
              )}
              {!style.isActive ? (
                <span className="absolute left-2 top-2 rounded-full bg-stone-900/70 px-2 py-0.5 text-2xs text-white">
                  Hidden
                </span>
              ) : null}
            </div>
            <div className="p-2.5">
              <p className="truncate text-xs font-medium text-ink">{style.name}</p>
              <p className="mt-0.5 truncate text-2xs text-ink-subtle">{subtitle(style)}</p>
            </div>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-xs text-ink-muted">
          {filter === 'nopicture' ? 'Every style has a picture.' : 'Nothing here.'}
        </p>
      ) : null}

      {open ? (
        <StyleDrawer
          key={open.id}
          style={open}
          kind={kinds.find((item) => item.key === open.kind) ?? null}
          generationReady={status?.configured ?? false}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
          toast={toast}
        />
      ) : null}
    </>
  );
}

/** One style: what it is, and what it looks like. */
function StyleDrawer({
  style,
  kind,
  generationReady,
  onClose,
  onChanged,
  toast,
}: {
  style: Hairstyle;
  kind: HairstyleKind | null;
  generationReady: boolean;
  onClose: () => void;
  onChanged: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [name, setName] = useState(style.name);
  const [category, setCategory] = useState(style.category ?? '');
  const [description, setDescription] = useState(style.description ?? '');
  const [maintenance, setMaintenance] = useState<HairMaintenance>(style.maintenance);
  const [isActive, setIsActive] = useState(style.isActive);
  const [supportedTextures, setSupportedTextures] = useState<HairTexture[]>(style.supportedTextures);
  const [supportedLengths, setSupportedLengths] = useState<HairLength[]>(style.supportedLengths);
  const [supportedDensities, setSupportedDensities] = useState<HairDensity[]>(style.supportedDensities);
  const [recommendedFaceShapes, setRecommendedFaceShapes] = useState<FaceShape[]>(style.recommendedFaceShapes);
  const [supportsBangs, setSupportsBangs] = useState(style.supportsBangs);
  const [supportsLayers, setSupportsLayers] = useState(style.supportsLayers);
  const [supportsParting, setSupportsParting] = useState(style.supportsParting);
  const [supportsFade, setSupportsFade] = useState(style.supportsFade);
  const [saving, setSaving] = useState(false);

  const [references, setReferences] = useState<Reference[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [polls, setPolls] = useState(0);
  const [maskOpen, setMaskOpen] = useState(false);
  const [colorFamily, setColorFamily] = useState<HairColorFamily | ''>(style.colorFamily ?? '');
  const [skinTone, setSkinTone] = useState<SkinTone | ''>(style.skinTone ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // What to draw. Defaults chosen by the server when these are left alone.
  const [texture, setTexture] = useState<HairTexture | ''>('');
  const [length, setLength] = useState<HairLength | ''>('');
  const [face, setFace] = useState<FaceShape | ''>('');

  const load = useCallback(async () => {
    try {
      setReferences(await apiGet<Reference[]>(`hair-studio/hairstyles/${style.id}/references`));
    } catch {
      // A reference list that cannot load must not block editing the metadata,
      // which is the half of this screen that works with no image model at all.
    }
  }, [style.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const working = references.find((item) => WORKING.includes(item.status)) ?? null;

  /** Polls only while something is actually in flight. See photo-preview.tsx. */
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (!working || polls >= POLL_CEILING) return;

    timer.current = setInterval(() => {
      void (async () => {
        setPolls((count) => count + 1);
        try {
          const fresh = await apiGet<Reference>(`hair-studio/generations/${working.id}`);
          setReferences((list) => list.map((item) => (item.id === fresh.id ? fresh : item)));
        } catch {
          /* one bad second, not a failed picture */
        }
      })();
    }, POLL_MS);

    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [working, polls]);

  async function save() {
    if (!name.trim()) {
      toast.error('A style needs a name.');
      return;
    }
    setSaving(true);
    try {
      await apiPatch(`hair-studio/hairstyles/${style.id}`, {
        name: name.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
        maintenance,
        isActive,
        colorFamily: colorFamily || null,
        skinTone: skinTone || null,
        supportedTextures,
        supportedLengths,
        supportedDensities,
        recommendedFaceShapes,
        supportsBangs,
        supportsLayers,
        supportsParting,
        supportsFade,
      });
      toast.success('Saved');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function draw() {
    setDrawing(true);
    try {
      const row = await apiPost<Reference>(`hair-studio/hairstyles/${style.id}/references`, {
        texture: texture || null,
        length: length || null,
        faceShape: face || null,
      });
      setReferences((list) => [row, ...list]);
      setPolls(0);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDrawing(false);
    }
  }

  /**
   * UPLOAD A PHOTOGRAPH THE SALON TOOK ITSELF.
   *
   * On reflection this is the MAIN path and the generated reference is the
   * fallback. A salon's own work is better than anything an image model draws —
   * it is this salon's cutting, on this salon's customers, under this salon's
   * lights — and everything downstream is identical, because the shader does not
   * know where the pixels came from. It also means a salon with no image-model
   * key at all gets the whole studio.
   */
  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error(`That photo is about ${Math.round(file.size / 1024 / 1024)}MB. The limit is 10MB.`);
      return;
    }
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!dataUrl) {
      toast.error('That photo could not be read.');
      return;
    }

    setUploading(true);
    try {
      /*
       * Consent is asked for here, in the same breath as the upload, because this
       * is the only moment anybody can honestly answer it. A generated portrait
       * is of nobody; this is very likely a real customer, going into a look-book
       * other customers scroll through. The API refuses without it independently.
       */
      await apiPost(`hair-studio/hairstyles/${style.id}/photo`, { photo: dataUrl, consent: true });
      toast.success('Photo uploaded — cut the hair out of it next');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function publish(generationId: string | null) {
    try {
      await apiPost(`hair-studio/hairstyles/${style.id}/preview`, { generationId });
      toast.success(generationId ? 'That is the menu picture now' : 'Picture removed');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={style.name}
      description={kind ? `Drawn by the ${kind.label.toLowerCase()} generator` : undefined}
      size="xl"
      footer={
        <>
          <Link
            href={`/hair-studio?style=${style.id}`}
            className="mr-auto text-2xs text-ink-subtle underline-offset-2 hover:underline"
          >
            Open this style in the 3D studio
          </Link>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_1.2fr]">
        {/* ------------------------------------------------- the metadata -- */}
        <div className="space-y-3">
          <Field label="Name" required hint="What a customer sees on the look-book">
            {({ id }) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} />}
          </Field>
          <Field label="Category" hint="How the look-book groups it — Short, Long, Men's">
            {({ id }) => <Input id={id} value={category} onChange={(event) => setCategory(event.target.value)} />}
          </Field>
          <Field label="Description" hint="One line. The advisor does not read it; customers do.">
            {({ id }) => (
              <Textarea id={id} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
            )}
          </Field>
          <Field label="Upkeep" hint="The single most useful filter, and the one nobody records">
            {({ id }) => (
              <Select
                id={id}
                value={maintenance}
                onChange={(event) => setMaintenance(event.target.value as HairMaintenance)}
              >
                {MAINTENANCES.map((value) => (
                  <option key={value} value={value}>
                    {MAINTENANCE_LABELS[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            {/*
              WHAT THE PICTURE SHOWS, which is a different question from what the
              cut is — and the two axes a customer actually browses by.
              
              `colorFamily` is NOT what the hair can be recoloured to: that is
              every colour, for free, in the studio. It is what this photograph
              happens to show, which is what somebody scrolling is looking at.
            */}
            <Field label="Colour in the photo" hint="How the look-book groups it">
              {({ id }) => (
                <Select
                  id={id}
                  value={colorFamily}
                  onChange={(event) => setColorFamily(event.target.value as HairColorFamily | '')}
                >
                  <option value="">Not set</option>
                  {(Object.keys(COLOR_FAMILY_LABELS) as HairColorFamily[]).map((value) => (
                    <option key={value} value={value}>
                      {COLOR_FAMILY_LABELS[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Skin tone shown" hint="So you can see which are missing">
              {({ id }) => (
                <Select id={id} value={skinTone} onChange={(event) => setSkinTone(event.target.value as SkinTone | '')}>
                  <option value="">Not set</option>
                  {(Object.keys(SKIN_TONE_LABELS) as SkinTone[]).map((value) => (
                    <option key={value} value={value}>
                      {SKIN_TONE_LABELS[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            Offered — shown in the studio, the advisor and the look-book
          </label>

          {/*
            WHAT THE GENERATOR WILL AND WILL NOT DO, shown read-only.

            These are the generator's own limits rather than the salon's
            preferences, and they are worth seeing here because they explain the
            configurator: a style with no fade has no fade slider, and somebody
            looking for the missing control should be able to find out why without
            asking.
          */}
          {/*
            NOT GATED ON THE KIND REGISTRY, though it was at first.
            
            These five lines are read off the STYLE's own row. Hiding them when
            `/hair-studio/kinds` fails to load — which it can, and which only
            supplies the drawer's subtitle — meant the one explanation of why a
            style has no fade slider disappeared for a reason nothing on screen
            could account for.
          */}
          <div className="space-y-2.5 rounded-lg bg-stone-50 p-3">
            <div>
              <p className="text-2xs font-medium text-ink-muted">What this salon offers it as</p>
              {/*
                EDITABLE, AND ONLY DOWNWARDS.
                
                The chips offered are the GENERATOR'S range; a salon narrows
                within it — "we only do this bob at medium" — and the API refuses
                anything wider, because the thing on the other end cannot do what
                the generator cannot do. Showing the full range greyed would be
                more honest still, but a salon never needs the options it cannot
                have, and the API's refusal is the real guard either way.
                
                Nothing ticked means ALL of them, which is the reading every
                other part of this codebase takes: a salon that has not thought
                about it has not thereby refused everything.
              */}
            </div>

            <Pills
              label="Textures"
              all={kind?.textures ?? TEXTURES}
              labels={TEXTURE_LABELS}
              value={supportedTextures}
              onChange={setSupportedTextures}
            />
            <Pills
              label="Lengths"
              all={kind?.lengths ?? LENGTHS}
              labels={LENGTH_LABELS}
              value={supportedLengths}
              onChange={setSupportedLengths}
            />
            <Pills
              label="Densities"
              all={kind?.densities ?? DENSITIES}
              labels={DENSITY_LABELS}
              value={supportedDensities}
              onChange={setSupportedDensities}
            />
            <Pills
              label="Suits"
              all={kind?.faceShapes ?? FACES}
              labels={FACE_SHAPE_LABELS}
              value={recommendedFaceShapes}
              onChange={setRecommendedFaceShapes}
            />

            <p className="text-2xs text-ink-subtle">
              Nothing ticked means all of them. You can narrow what the generator allows, never widen it.
            </p>

            <div className="border-t border-stone-200 pt-2">
              <p className="mb-1 text-2xs font-medium text-ink-muted">Takes</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['bangs', supportsBangs, setSupportsBangs, kind ? kind.supportsBangs : true],
                    ['layers', supportsLayers, setSupportsLayers, kind ? kind.supportsLayers : true],
                    ['a parting', supportsParting, setSupportsParting, kind ? kind.supportsParting : true],
                    ['a fade', supportsFade, setSupportsFade, kind ? kind.supportsFade : true],
                  ] as const
                ).map(([label, on, toggle, allowed]) => (
                  <label
                    key={label}
                    className={cn(
                      'flex items-center gap-1.5 text-2xs',
                      allowed ? 'cursor-pointer text-ink-muted' : 'cursor-not-allowed text-ink-subtle/60',
                    )}
                    title={allowed ? undefined : 'This kind of cut cannot take it'}
                  >
                    <input
                      type="checkbox"
                      checked={on && allowed}
                      disabled={!allowed}
                      onChange={(event) => toggle(event.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------- the pictures -- */}
        <div className="space-y-3">
          {/*
            A MINIMUM HEIGHT, because an image that has not arrived is not an
            image that is absent.
            
            Without it the panel is sized by the <img>, so a picture still
            downloading on a salon's connection — or one that fails — collapses
            this box to nothing and everything below it jumps up the screen. The
            empty state had a height and the filled one did not, which is exactly
            backwards.
          */}
          <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
            {style.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={style.previewUrl} alt="" className="mx-auto max-h-64 w-auto" />
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 text-ink-subtle">
                <ImageOff className="h-5 w-5" aria-hidden />
                <span className="text-2xs">No picture on the menu yet</span>
              </div>
            )}
          </div>

          {/*
            THE STEP THAT PAYS FOR ITSELF.
            
            Sits directly under the published picture because it is about THAT
            picture, and it is offered the moment one exists — a photograph with
            no cut-out is a style the studio can show but not recolour, which is
            half a feature.
          */}
          {/*
            THE PHOTOGRAPH, FROM WHICHEVER SOURCE — and uploading comes first.
            
            A salon's own work beats anything generated, and this path needs no
            image model, no key and no budget. The generated reference below is
            the fallback for a style nobody has photographed yet.
          */}
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = '';
              }}
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>
              <Upload className="h-3.5 w-3.5" />
              {style.previewUrl ? 'Replace the photo' : 'Upload a photo'}
            </Button>
            {style.previewUrl && style.photoIsUploaded ? (
              <Badge tone="neutral">Your own photo</Badge>
            ) : style.previewUrl ? (
              <Badge tone="info">Generated</Badge>
            ) : null}
          </div>

          <p className="text-2xs leading-relaxed text-ink-subtle">
            Uploading one of your own cuts costs nothing and usually looks better than anything generated. Whoever is in
            the photograph needs to be happy for the salon to show it.
          </p>

          {style.previewUrl ? (
            <button
              type="button"
              onClick={() => setMaskOpen(true)}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                style.maskUrl
                  ? 'border-stone-300 text-ink-muted hover:text-ink'
                  : 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100',
              )}
            >
              <Scissors className="h-3.5 w-3.5" aria-hidden />
              {style.maskUrl ? 'Re-cut the hair' : 'Cut out the hair'}
            </button>
          ) : null}

          {style.previewUrl && !style.maskUrl ? (
            <p className="rounded-lg bg-amber-50 p-2.5 text-2xs leading-relaxed text-amber-900">
              Until the hair is cut out of this picture, the studio can show this style but cannot recolour it. It takes
              about twenty seconds, once — and then every colour, highlight and painted section is instant and costs
              nothing.
            </p>
          ) : null}

          {!generationReady ? (
            <p className="rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
              Picture generation is not switched on for this server. Everything else here works — the 3D studio draws
              every style itself, in the browser, for free.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Pick label="Texture" value={texture} onChange={setTexture} options={style.supportedTextures.length ? style.supportedTextures : TEXTURES} labels={TEXTURE_LABELS} />
                <Pick label="Length" value={length} onChange={setLength} options={style.supportedLengths.length ? style.supportedLengths : LENGTHS} labels={LENGTH_LABELS} />
                <Pick label="Face" value={face} onChange={setFace} options={style.recommendedFaceShapes.length ? style.recommendedFaceShapes : FACES} labels={FACE_SHAPE_LABELS} />
              </div>

              <Button size="sm" onClick={draw} loading={drawing} disabled={!!working}>
                <Wand2 className="h-3.5 w-3.5" />
                {references.length ? 'Draw another' : 'Draw a reference picture'}
              </Button>

              {working ? (
                <div className="flex items-center gap-2 rounded-lg bg-stone-50 p-3 text-2xs text-ink-muted">
                  <Spinner className="h-3.5 w-3.5" />
                  {polls >= POLL_CEILING
                    ? 'Still drawing. It carries on on the server — close this and come back.'
                    : 'Drawing — usually under a minute. It finishes on the server either way.'}
                </div>
              ) : null}

              {/*
                EVERY ATTEMPT, NOT JUST THE LAST.

                The point of the screen: a model draws four plausible heads and
                one of them is the haircut this salon does. Keeping the rejects
                visible is what lets somebody compare rather than regenerate until
                something looks acceptable in isolation.
              */}
              {references.length ? (
                <div className="grid grid-cols-4 gap-2">
                  {references.map((reference) => {
                    const isMenu = !!reference.imageUrl && reference.imageUrl === style.previewUrl;
                    return (
                      <div key={reference.id} className="space-y-1">
                        <div
                          className={cn(
                            'relative aspect-square overflow-hidden rounded-lg border bg-stone-100',
                            isMenu ? 'border-brand-500 ring-1 ring-brand-300' : 'border-stone-200',
                          )}
                        >
                          {reference.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={reference.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            /*
                              THE REASON, NOT JUST THE WORD.
                              
                              This said "failed" and nothing else, and the first
                              person to hit it had two failures and no idea why —
                              a wrong model slug, a key the server does not have
                              and a provider having a bad minute all looked
                              identical. The row has carried the provider's own
                              message all along; it simply was not shown.
                            */
                            <span
                              title={reference.error ?? undefined}
                              className="flex h-full items-center justify-center px-1 text-center text-2xs text-ink-subtle"
                            >
                              {reference.status === 'REFUSED'
                                ? 'refused'
                                : reference.status === 'FAILED'
                                  ? 'failed'
                                  : '…'}
                            </span>
                          )}
                          {isMenu ? (
                            <span className="absolute right-1 top-1 rounded-full bg-brand-600 p-0.5 text-white">
                              <Check className="h-3 w-3" aria-hidden />
                            </span>
                          ) : null}
                        </div>
                        {reference.status === 'READY' ? (
                          <button
                            type="button"
                            onClick={() => publish(isMenu ? null : reference.id)}
                            className="w-full text-2xs text-ink-subtle underline-offset-2 hover:underline"
                          >
                            {isMenu ? 'Remove' : 'Use this'}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/*
                Said in full under the strip, because a tooltip on a 64-pixel
                square is not where anybody looks for a reason — and the reason is
                usually a setting the owner can change.
              */}
              {references[0] && (references[0].status === 'FAILED' || references[0].status === 'REFUSED') ? (
                <div className="rounded-lg bg-rose-50 p-2.5 text-2xs leading-relaxed text-rose-800">
                  <p className="font-medium">
                    {references[0].status === 'REFUSED'
                      ? 'The image provider would not draw this one.'
                      : 'That picture could not be drawn.'}
                  </p>
                  {references[0].error ? <p className="mt-1">{references[0].error}</p> : null}
                  <p className="mt-1 text-rose-700">
                    {references[0].status === 'REFUSED'
                      ? 'That is its own safety filter rather than anything you did — a different colour or a less extreme description usually goes through.'
                      : 'If every attempt fails the same way it is a setting rather than a bad minute: check BFL_API_KEY and BFL_MODEL on the server. The studio itself is unaffected.'}
                  </p>
                </div>
              ) : null}

              {references[0]?.prompt ? (
                <details className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                  <summary className="cursor-pointer text-2xs font-medium text-ink-muted">What we asked for</summary>
                  <p className="mt-2 text-2xs leading-relaxed text-ink-subtle">{references[0].prompt}</p>
                </details>
              ) : null}

              <p className="text-2xs leading-relaxed text-ink-subtle">
                <Badge tone="neutral">Drawn once</Badge>{' '}
                This is the only thing here that costs a generation. Once the picture exists and the hair is cut out of
                it, every colour, highlight and painted section in the studio is a shader — instant, and free however
                many a customer tries.
              </p>
            </>
          )}
        </div>
      </div>

      {maskOpen && style.previewUrl ? (
        <MaskEditor
          open
          onClose={() => setMaskOpen(false)}
          catalogId={style.id}
          photoUrl={style.previewUrl}
          existingMaskUrl={style.maskUrl}
          onSaved={onChanged}
        />
      ) : null}
    </Modal>
  );
}

/**
 * "Women · Women's haircut" is what the obvious version printed.
 *
 * The starter catalogue's categories are already "Women's haircut" and "Men's
 * haircut", so joining the gender label to the category repeated the same word
 * twice on every tile. A salon that renames its categories to Short and Long
 * still needs the gender though, so the rule is: show the category, and add the
 * gender only when the category does not already say it.
 */
function subtitle(style: Hairstyle): string {
  const gender = GENDER_LABELS[style.gender];
  const category = style.category?.trim();
  if (!category) return gender;
  return category.toLowerCase().includes(gender.toLowerCase()) ? category : `${category} · ${gender}`;
}

/**
 * A row of toggles for one of the supported-* arrays.
 *
 * Chips rather than a multi-select, because the whole list is four to six items
 * and a salon reads them as a sentence — "we do this straight or wavy" — not as
 * a form control to open.
 */
function Pills<T extends string>({
  label,
  all,
  labels,
  value,
  onChange,
}: {
  label: string;
  all: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="w-16 shrink-0 text-2xs text-ink-subtle">{label}</span>
      {all.map((option) => {
        const on = value.length === 0 || value.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(
                // An empty list means "all", so the first click has to start
                // from the full set and remove one — otherwise unticking the
                // first option would read as selecting nothing and mean the
                // opposite of what was clicked.
                on
                  ? (value.length === 0 ? [...all] : value).filter((item) => item !== option)
                  : [...value, option],
              )
            }
            className={cn(
              'rounded-full border px-2 py-0.5 text-2xs transition-colors',
              on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-stone-200 text-ink-subtle hover:text-ink',
            )}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

function Pick<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T | '';
  options: T[];
  labels: Record<T, string>;
  onChange: (value: T | '') => void;
}) {
  return (
    <Field label={label}>
      {({ id }) => (
        <Select id={id} value={value} onChange={(event) => onChange(event.target.value as T | '')}>
          {/* The server picks the middle of the style's range when this is left
              alone, which is the option that looks like the style people have in
              mind when they say its name. */}
          <option value="">Default</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {labels[option]}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
