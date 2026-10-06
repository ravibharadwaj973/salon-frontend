'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Camera, Images, Save, Wand2 } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { money } from '@/lib/format';
import type { HairDensity, HairLength, HairTexture, Hairstyle } from './catalogue-types';
import { PhotoControls } from './photo/controls';
import type { PhotoDesign } from './photo/renderer';
import { Advisor } from './advisor';
import { LookBook } from './look-book';
import { PhotoPreview } from './photo-preview';

/**
 * THE HAIR STUDIO.
 *
 * ── What changed, and why it was the right call ───────────────────────────
 *
 * This screen used to draw a mannequin — a few thousand procedural hair ribbons
 * on a styling head, in three dimensions, with a camera you could orbit. It was
 * careful work and it answered a real question: what SHAPE am I asking for. But
 * it answered it with a plastic head, and nobody has ever left a salon holding a
 * picture of a mannequin. The question customers actually ask is what it will
 * look like, and a mannequin cannot answer that at any level of polish.
 *
 * So the thing on screen is a photograph now, and everything below is about
 * making that affordable.
 *
 * ── The rule the whole architecture rests on ──────────────────────────────
 *
 * THE IMAGE MODEL IS CALLED ONCE PER STYLE. Never per colour, never per
 * highlight, never per slider.
 *
 *   5 cuts × 8 colours × 5 highlight styles × 4 intensities = 800 combinations.
 *
 * At roughly a penny each that is a bill no salon subscription covers, with a
 * second of waiting between every click and a subtly different face each time.
 * Instead the model draws the hair once, a person cuts it out of the picture
 * once, and from then on all 800 are a fragment shader over two textures:
 * instant, free, and recognisably the same woman in every one.
 *
 * What still costs a generation is in photo-preview.tsx — a new model, or the
 * customer's own photograph — and nothing on this panel does.
 */

const Renderer = dynamic(() => import('./photo/renderer').then((module) => module.PhotoRenderer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-ink-subtle">Opening the studio…</p>
    </div>
  ),
});

export interface StudioCustomer {
  id: string;
  name: string;
}

export interface InitialDesign {
  id: string;
  name: string;
  catalogId: string | null;
  modelKey: string;
  texture: HairTexture;
  length: HairLength;
  density: HairDensity;
  volume: number;
  baseColor: string;
  config: Record<string, unknown>;
  notes: string | null;
}

const DEFAULT_DESIGN: PhotoDesign = {
  baseColor: '#3B2417',
  /*
   * Half, not zero. At zero the control does nothing visible on hair that is
   * already dark — the first thing anybody does is pick a colour, and a picker
   * that appears to be broken for the first few clicks is one people stop using.
   */
  lift: 50,
  /*
   * Fifty across the board, because fifty means "exactly as the photograph was
   * taken". A control whose neutral position is at one end teaches people it only
   * does one thing; from the middle it is obvious that it goes both ways.
   */
  density: 50,
  shine: 50,
  intensity: 50,
  highlightColor: '#C68642',
  highlightAmount: 0,
  highlightFace: false,
  rootColor: '#1C1512',
  rootDepth: 0,
  endsColor: '#D9A95C',
  endsAmount: 0,
  endsStart: 55,
  strips: [],
};

/** What gets saved, and what a saved look is rebuilt from. */
function toConfig(design: PhotoDesign) {
  return {
    bangs: 'NONE' as const,
    layers: 'NONE' as const,
    parting: 'NATURAL' as const,
    strips: design.strips,
    photo: {
      lift: design.lift,
      density: design.density,
      shine: design.shine,
      intensity: design.intensity,
      highlightColor: design.highlightColor,
      highlightAmount: design.highlightAmount,
      highlightFace: design.highlightFace,
      rootColor: design.rootColor,
      rootDepth: design.rootDepth,
      endsColor: design.endsColor,
      endsAmount: design.endsAmount,
      endsStart: design.endsStart,
    },
  };
}

function fromDesign(design: InitialDesign | null): PhotoDesign {
  if (!design) return DEFAULT_DESIGN;
  const config = design.config ?? {};
  const photo = (config.photo ?? {}) as Partial<PhotoDesign>;
  return {
    ...DEFAULT_DESIGN,
    ...photo,
    baseColor: design.baseColor || DEFAULT_DESIGN.baseColor,
    strips: Array.isArray(config.strips) ? (config.strips as PhotoDesign['strips']) : [],
  };
}

export function Studio({
  styles,
  customer,
  initialDesign,
  initialStyleId = null,
}: {
  styles: Hairstyle[];
  customer: StudioCustomer | null;
  initialDesign: InitialDesign | null;
  initialStyleId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const [catalogId, setCatalogId] = useState<string>(
    () =>
      (initialDesign?.catalogId
        ? styles.find((item) => item.id === initialDesign.catalogId)?.id
        : initialStyleId
          ? styles.find((item) => item.id === initialStyleId)?.id
          : undefined) ??
      styles[0]?.id ??
      '',
  );
  const [design, setDesign] = useState<PhotoDesign>(() => fromDesign(initialDesign));
  const [painting, setPainting] = useState(false);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initialDesign?.name ?? '');
  const [notes, setNotes] = useState(initialDesign?.notes ?? '');
  const [savedId, setSavedId] = useState<string | null>(initialDesign?.id ?? null);
  const [savedName, setSavedName] = useState(initialDesign?.name ?? '');
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(() =>
    initialDesign ? JSON.stringify({ catalogId, design: fromDesign(initialDesign) }) : null,
  );

  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [lookBookOpen, setLookBookOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  const style = styles.find((item) => item.id === catalogId);
  const dirty = savedSnapshot !== null && savedSnapshot !== JSON.stringify({ catalogId, design });

  /**
   * A TAP ON THE PHOTOGRAPH BECOMES A PAINTED SECTION.
   *
   * It borrows the current base colour rather than defaulting to blonde: on dark
   * hair a blonde default lands as a stripe nobody asked for, and starting from
   * the base means the first tap changes the SHAPE of the colour rather than the
   * colour itself, which is the easier thing to judge.
   *
   * The shader multiplies every section by the hair mask, so a tap that lands on
   * a cheek or the backdrop simply does nothing — the colour cannot spill onto
   * the face however carelessly it is placed.
   */
  const paint = useCallback((spot: { x: number; y: number }) => {
    setDesign((current) => {
      if (current.strips.length >= 6) return current;
      return {
        ...current,
        strips: [
          ...current.strips,
          {
            id: `s-${Date.now().toString(36)}-${current.strips.length}`,
            color: current.baseColor,
            x: spot.x,
            y: spot.y,
            width: 35,
            blend: 45,
            strength: 70,
          },
        ],
      };
    });
  }, []);

  const canRecolour = !!style?.maskUrl;

  const photoUrl = style?.previewUrl ?? null;

  async function save() {
    if (!style) return;
    const title = name.trim();
    if (!title) {
      toast.error('Give the look a name you will recognise later.');
      return;
    }

    setSaving(true);
    try {
      const saved = await apiPost<{ id: string }>('hair-studio/designs', {
        name: title,
        catalogId: style.id,
        /*
         * The cut itself is the photograph's, not a set of sliders. These three
         * come straight off the style so a saved look still records what was
         * actually agreed — the API and the advisor both read them.
         */
        modelKey: `photo_${style.kind}`,
        texture: style.supportedTextures[0] ?? 'STRAIGHT',
        length: style.supportedLengths[Math.floor(style.supportedLengths.length / 2)] ?? 'MEDIUM',
        density: 'MEDIUM',
        volume: 50,
        baseColor: design.baseColor,
        config: toConfig(design),
        customerId: customer?.id ?? null,
        notes: notes.trim() || null,
      });
      setSavedId(saved.id);
      setSavedName(title);
      setSavedSnapshot(JSON.stringify({ catalogId, design }));
      setSaveOpen(false);
      toast.success(customer ? `Saved to ${customer.name}` : 'Look saved');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function book() {
    if (!savedId) {
      toast.error('Save the look first — the booking is attached to it.');
      return;
    }
    try {
      const intent = await apiGet<{ serviceId: string | null; reason: string | null }>(
        `hair-studio/designs/${savedId}/booking-intent`,
      );
      if (!intent.serviceId) {
        toast.error(intent.reason ?? 'This style has no service attached yet.');
        return;
      }
      const params = new URLSearchParams({ service: intent.serviceId, design: savedId });
      if (customer) params.set('customer', customer.id);
      router.push(`/calendar?${params.toString()}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const styleOptions = useMemo(() => styles.filter((item) => item.isActive), [styles]);

  if (!style) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-ink">No styles in the catalogue yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-ink-muted">
          Add the styles your salon offers in the Hair library, give each one a photograph, and they appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-11rem)] lg:flex-row">
        <div className="relative flex min-h-[420px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-900/90">
          {photoUrl ? (
            <Renderer
              photoUrl={photoUrl}
              maskUrl={style.maskUrl ?? null}
              design={design}
              onPick={painting && canRecolour ? paint : undefined}
              /*
               * h-full w-full, not max-h/max-w.
               *
               * A canvas is a replaced element sized by its backing store, so
               * `max-*` only ever shrinks it — a portrait smaller than the stage
               * sat as a postage stamp in the middle of a dark panel. The
               * backing store stays at the photograph's own resolution; this is
               * only how much of the screen it is given.
               */
              className="h-full w-full object-contain"
            />
          ) : (
            <p className="max-w-xs p-8 text-center text-sm leading-relaxed text-stone-300">
              This style has no photograph yet. Upload one of your own cuts in the Hair library — once the hair is cut
              out of it, every colour here is free.
            </p>
          )}

          {painting ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
              <span className="rounded-full bg-brand-600/95 px-3 py-1 text-2xs font-medium text-white shadow-sm">
                Tap the hair to paint a section
              </span>
            </div>
          ) : null}

          {/*
            SAID ON THE PICTURE, because the picture is what gets turned towards
            a customer. It is a model wearing the cut, not her — and a photograph
            is persuasive enough that leaving this unsaid would be a small lie.
          */}
          <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-900/80 to-transparent p-3 text-center text-2xs text-stone-200">
            A model wearing this cut and colour — not your customer&rsquo;s own face.
          </p>
        </div>

        <div className="flex w-full flex-col rounded-xl border border-stone-200 bg-white lg:w-[22rem] lg:shrink-0">
          <div className="flex items-center gap-2 border-b border-stone-200 p-3">
            <Button size="sm" variant="secondary" onClick={() => setSaveOpen(true)} className="flex-1">
              <Save className="h-3.5 w-3.5" />
              Save look
            </Button>
            <Button
              size="sm"
              onClick={book}
              className="flex-1"
              title={style.service ? `${style.service.name} · ${money(style.service.price)}` : undefined}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Book it
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setLookBookOpen(true)}
            className="flex items-center justify-center gap-1.5 border-b border-stone-200 px-4 py-2 text-2xs font-medium text-ink-muted transition-colors hover:bg-stone-50 hover:text-ink"
          >
            <Images className="h-3.5 w-3.5" aria-hidden />
            {style.name} · change style
          </button>

          <button
            type="button"
            onClick={() => setAdvisorOpen(true)}
            className="flex items-center justify-center gap-1.5 border-b border-stone-200 px-4 py-2 text-2xs font-medium text-ink-muted transition-colors hover:bg-stone-50 hover:text-ink"
          >
            <Wand2 className="h-3.5 w-3.5" aria-hidden />
            What would suit {customer ? customer.name.split(' ')[0] : 'her'}?
          </button>

          {/*
            THE ONE CONTROL ON THIS SCREEN THAT SPENDS MONEY, and it is marked.

            Everything above is a shader, drawn in the browser, free however many
            times it changes. This asks the image model for a new picture, and a
            stylist is entitled to know which clicks cost something.

            NAMED AFTER THE CUSTOMER WHEN THERE IS ONE, because that is what the
            screen behind it is for: this cut, on her own photograph. "Generate a
            new picture" described the mechanism and hid the point — and the point
            is the only question a customer actually asks.
          */}
          <button
            type="button"
            onClick={() => {
              if (!savedId) {
                toast.error('Save the look first — the picture is drawn from the saved design.');
                return;
              }
              setPhotoOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 border-b border-stone-200 px-4 py-2 text-2xs font-medium text-ink-muted transition-colors hover:bg-stone-50 hover:text-ink"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden />
            {customer ? `See this on ${customer.name.split(' ')[0]}` : 'See this on a real photo'}
            {dirty && savedId ? <span className="text-amber-700">· unsaved changes</span> : null}
          </button>

          {style.service ? (
            <p className="border-b border-stone-200 px-4 py-2 text-2xs text-ink-subtle">
              {style.service.name} &middot; {money(style.service.price)} &middot; {style.service.durationMin} min
            </p>
          ) : (
            <p className="border-b border-stone-200 bg-amber-50 px-4 py-2 text-2xs text-amber-800">
              No service attached to this style yet, so it cannot be booked.
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <PhotoControls
              design={design}
              onChange={setDesign}
              painting={painting}
              onPaintingChange={setPainting}
              canRecolour={canRecolour}
            />
          </div>
        </div>
      </div>

      <LookBook
        open={lookBookOpen}
        onClose={() => setLookBookOpen(false)}
        styles={styleOptions}
        onChoose={(id) => {
          setCatalogId(id);
          setLookBookOpen(false);
        }}
      />

      <Advisor
        open={advisorOpen}
        onClose={() => setAdvisorOpen(false)}
        styles={styles}
        customer={customer}
        onChoose={({ catalogId: chosen }) => {
          setCatalogId(chosen);
          setAdvisorOpen(false);
          toast.success(`Opened ${styles.find((item) => item.id === chosen)?.name ?? 'that style'}`);
        }}
      />

      <PhotoPreview
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        designId={savedId}
        designName={savedName}
        customerId={customer?.id ?? null}
        customerName={customer?.name ?? null}
        dirty={dirty}
      />

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save this look"
        description={customer ? `Kept on ${customer.name}'s record.` : 'Not attached to anyone yet — pick a customer to keep it.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save look
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required hint="What you will call it in a month">
            {({ id }) => (
              <Input
                id={id}
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                placeholder={style.name}
              />
            )}
          </Field>
          <Field label="Notes" hint="Formula, what the customer asked for, anything the next stylist needs">
            {({ id }) => <Textarea id={id} value={notes} onChange={(event) => setNotes(event.target.value)} />}
          </Field>
        </div>
      </Modal>
    </>
  );
}
