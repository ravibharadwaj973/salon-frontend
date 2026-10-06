'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Camera, CalendarPlus, Images, RotateCcw, Save, Wand2 } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import type { FaceShape, HairDensity, HairLength, HairTexture, Hairstyle } from './catalogue-types';
import { Controls, type StudioState } from './controls';
import { PhotoPreview } from './photo-preview';
import { Advisor } from './advisor';
import { CanvasBoundary } from './canvas-boundary';
import { LookBook } from './look-book';
// From views.ts, NOT from ./viewport: importing it from there drags three.js
// into the server bundle and defeats the ssr:false below.
import { VIEWS, VIEW_LABELS, type ViewName } from './views';
import { DEFAULT_CONFIG, type DesignConfig, type DesignSpec } from './hair/spec';

/**
 * Three.js is about six hundred kilobytes, and nobody opening the till needs
 * it. Loaded only when this route is, and never on the server — a WebGL canvas
 * has nothing to render into there.
 */
const Viewport = dynamic(() => import('./viewport').then((module) => module.Viewport), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-ink-subtle">Starting the studio…</p>
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
  config: DesignConfig;
  notes: string | null;
}

const ALL_TEXTURES: HairTexture[] = ['STRAIGHT', 'WAVY', 'CURLY', 'COILY'];
const ALL_LENGTHS: HairLength[] = ['VERY_SHORT', 'SHORT', 'MEDIUM', 'LONG', 'VERY_LONG'];
const ALL_DENSITIES: HairDensity[] = ['LOW', 'MEDIUM', 'HIGH'];

const pick = <T extends string>(allowed: T[], all: T[], current: T, fallback: T): T => {
  const list = allowed.length === 0 ? all : allowed;
  return list.includes(current) ? current : (list[Math.floor(list.length / 2)] ?? fallback);
};

/**
 * A comparable fingerprint of a design.
 *
 * Only the fields the backend actually renders from: the face shape is the
 * mannequin this browser draws on and changes no pixel of a generated
 * photograph, so including it would report the design as changed when nothing
 * the picture depends on has.
 */
function snapshot(input: {
  texture: HairTexture;
  length: HairLength;
  density: HairDensity;
  volume: number;
  baseColor: string;
  config: DesignConfig;
  catalogId?: string | null;
}): string {
  return JSON.stringify({
    catalogId: input.catalogId ?? null,
    texture: input.texture,
    length: input.length,
    density: input.density,
    volume: input.volume,
    baseColor: input.baseColor.toLowerCase(),
    config: input.config,
  });
}

/** modelKey is stored on the design, so a saved look comes back on the same head. */
const modelKey = (face: FaceShape) => `mannequin_${face.toLowerCase()}`;
const faceFromModel = (key: string | undefined): FaceShape => {
  const name = (key ?? '').replace('mannequin_', '').toUpperCase();
  const faces: FaceShape[] = ['OVAL', 'ROUND', 'SQUARE', 'OBLONG', 'HEART', 'DIAMOND'];
  return faces.includes(name as FaceShape) ? (name as FaceShape) : 'OVAL';
};

export function Studio({
  styles,
  customer,
  initialDesign,
  initialStyleId = null,
}: {
  styles: Hairstyle[];
  customer: StudioCustomer | null;
  initialDesign: InitialDesign | null;
  /** From ?style=, so the asset studio can open one straight in the chair. */
  initialStyleId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();

  /*
   * A design in the url beats a style in the url: ?design= is a look somebody
   * saved, ?style= is only a starting point, and opening the first and silently
   * applying the second would show the customer a different haircut from the one
   * the link promised.
   */
  const first = (initialStyleId ? styles.find((item) => item.id === initialStyleId) : null) ?? styles[0];

  const [state, setState] = useState<StudioState>(() => {
    const style = initialDesign?.catalogId
      ? styles.find((item) => item.id === initialDesign.catalogId) ?? first
      : first;
    if (initialDesign && style) {
      return {
        catalogId: style.id,
        face: faceFromModel(initialDesign.modelKey),
        texture: initialDesign.texture,
        length: initialDesign.length,
        density: initialDesign.density,
        volume: initialDesign.volume,
        baseColor: initialDesign.baseColor,
        config: { ...DEFAULT_CONFIG, ...initialDesign.config },
      };
    }
    return {
      catalogId: style?.id ?? '',
      face: 'OVAL',
      texture: pick(style?.supportedTextures ?? [], ALL_TEXTURES, 'STRAIGHT', 'STRAIGHT'),
      length: pick(style?.supportedLengths ?? [], ALL_LENGTHS, 'MEDIUM', 'MEDIUM'),
      density: 'MEDIUM',
      volume: 50,
      baseColor: '#3B2417',
      config: { ...DEFAULT_CONFIG },
    };
  });

  const [view, setView] = useState<ViewName>('FRONT');
  const [viewNonce, setViewNonce] = useState(0);
  const [freeCamera, setFreeCamera] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initialDesign?.name ?? '');
  const [notes, setNotes] = useState(initialDesign?.notes ?? '');
  const [savedId, setSavedId] = useState<string | null>(initialDesign?.id ?? null);
  const [savedName, setSavedName] = useState(initialDesign?.name ?? '');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [lookBookOpen, setLookBookOpen] = useState(false);
  const [painting, setPainting] = useState(false);
  /**
   * WHAT WAS LAST SAVED, SO "CHANGED SINCE" IS A FACT RATHER THAN A GUESS.
   *
   * A photographic preview is drawn from the SAVED design, on a server, from a
   * row — not from whatever the sliders say right now. Without this, moving the
   * colour and pressing the button spends real money rendering the PREVIOUS
   * version of the look, and nothing about the returned picture says so.
   */
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(() =>
    /*
     * Taken from the RESOLVED state rather than from initialDesign directly. A
     * design whose style has since been deleted comes back on a different style,
     * and fingerprinting the row would then report "changed" the moment the
     * screen opened, before anybody touched a slider.
     */
    initialDesign ? snapshot({ ...state, catalogId: state.catalogId }) : null,
  );

  const style = styles.find((item) => item.id === state.catalogId);

  /** Changed since the last save. Decides what the photographic preview trusts. */
  const dirty = savedSnapshot !== null && savedSnapshot !== snapshot({ ...state, catalogId: state.catalogId });

  /**
   * Changing the style re-bounds everything under it.
   *
   * The same normalisation the API does on save, done here so the person never
   * sees a design that would be refused. Carrying a fade across from a taper to
   * a bob would draw a haircut nobody can book.
   */
  const change = useCallback(
    (next: StudioState) => {
      if (next.catalogId === state.catalogId) {
        setState(next);
        return;
      }
      const picked = styles.find((item) => item.id === next.catalogId);
      if (!picked) return;
      setState({
        ...next,
        texture: pick(picked.supportedTextures, ALL_TEXTURES, next.texture, 'STRAIGHT'),
        length: pick(picked.supportedLengths, ALL_LENGTHS, next.length, 'MEDIUM'),
        density: pick(picked.supportedDensities, ALL_DENSITIES, next.density, 'MEDIUM'),
        config: {
          ...next.config,
          bangs: picked.supportsBangs ? next.config.bangs : 'NONE',
          layers: picked.supportsLayers ? next.config.layers : 'NONE',
          faceFramingLayers: picked.supportsLayers ? next.config.faceFramingLayers : undefined,
          parting: picked.supportsParting ? next.config.parting : 'NATURAL',
          fade: picked.supportsFade ? next.config.fade : undefined,
        },
      });
    },
    [state.catalogId, styles],
  );

  // Memoised so that opening a panel section does not rebuild two thousand
  // strands; the generator only reruns when the haircut actually changed.
  const spec = useMemo<DesignSpec>(
    () => ({
      kind: style?.kind ?? 'long_loose',
      texture: state.texture,
      length: state.length,
      density: state.density,
      volume: state.volume,
      baseColor: state.baseColor,
      config: state.config,
    }),
    [style?.kind, state.texture, state.length, state.density, state.volume, state.baseColor, state.config],
  );

  const options = useMemo(
    () => ({
      allowBangs: style?.supportsBangs ?? false,
      allowLayers: style?.supportsLayers ?? false,
      allowParting: style?.supportsParting ?? true,
      allowFade: style?.supportsFade ?? false,
    }),
    [style?.supportsBangs, style?.supportsLayers, style?.supportsParting, style?.supportsFade],
  );

  /**
   * A TAP ON THE HEAD BECOMES A SECTION OF COLOUR.
   *
   * The new section borrows the current base colour rather than defaulting to
   * blonde: on dark hair a blonde default lands as a bright stripe that nobody
   * asked for, and the first thing anyone does is reach for the swatch anyway.
   * Starting from the base means the first tap changes the shape of the colour
   * and not the colour itself, which is the easier thing to judge.
   *
   * `start` comes from how far down the head the tap was — tap near the crown and
   * the whole length is coloured, tap near the ends and only the tips are. The
   * slider in the panel corrects it afterwards.
   */
  const placeSection = useCallback(
    (spot: { phi: number; t: number }) => {
      setState((current) => {
        const strips = current.config.strips ?? [];
        // Six is already more sections than any colourist foils by hand, and the
        // panel stops being scrollable past that.
        if (strips.length >= 6) return current;
        return {
          ...current,
          config: {
            ...current.config,
            strips: [
              ...strips,
              {
                id: `strip-${Date.now().toString(36)}-${strips.length}`,
                color: current.baseColor,
                phi: spot.phi,
                start: Math.max(0.05, Math.min(0.85, spot.t)),
                width: 40,
                brightness: 70,
                blend: 45,
              },
            ],
          },
        };
      });
    },
    [],
  );

  const goTo = (next: ViewName) => {
    setView(next);
    setViewNonce((value) => value + 1);
    setFreeCamera(false);
  };

  async function save() {
    if (!style) return;
    const title = name.trim();
    if (!title) {
      toast.error('Give the look a name you will recognise later.');
      return;
    }

    setSaving(true);
    try {
      const design = await apiPost<{ id: string }>('hair-studio/designs', {
        name: title,
        catalogId: style.id,
        modelKey: modelKey(state.face),
        texture: state.texture,
        length: state.length,
        density: state.density,
        volume: state.volume,
        baseColor: state.baseColor,
        config: state.config,
        customerId: customer?.id ?? null,
        notes: notes.trim() || null,
      });
      setSavedId(design.id);
      setSavedName(title);
      setSavedSnapshot(snapshot({ ...state, catalogId: style.id }));
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

  if (!style) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-ink">No styles in the catalogue yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-ink-muted">
          The studio draws the cuts your salon offers. Add them under Hairstyles and they appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-11rem)] lg:flex-row">
        {/* The viewport. Given the room, because it is the product. */}
        <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border border-stone-200 bg-[#efe9e2]">
          {/*
            The boundary is INSIDE the layout, not around the page.
            
            Three throws "Error creating WebGL context" from its constructor during
            render, which no prop can catch — and a boundary one level up would
            still take the control panel, Save and Book down with it. Driving the
            real page with WebGL disabled is how that was found: the whole screen
            became "Try again".
          */}
          <CanvasBoundary
            fallback={
              <div className="flex h-full items-center justify-center p-8 text-center">
                <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
                  This browser could not start 3D, so the preview is unavailable. It needs WebGL, which is usually
                  switched off by a hardware-acceleration setting rather than missing — everything else on this screen
                  still works, including saving the look and booking it.
                </p>
              </div>
            }
          >
            <Viewport
              spec={spec}
              face={state.face}
              options={options}
              view={view}
              viewNonce={viewNonce}
              onUserTookCamera={() => setFreeCamera(true)}
              onPick={painting ? placeSection : undefined}
            />
          </CanvasBoundary>

          {/*
            SAID OVER THE MODEL, NOT ONLY IN THE PANEL.
            
            Painting changes what a tap on the head does, and the head is where the
            person is looking. A mode whose only indication is a pressed button in
            a side panel is a mode people forget they are in, and then wonder why
            the model keeps growing stripes.
          */}
          {painting ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
              <span className="rounded-full bg-brand-600/95 px-3 py-1 text-2xs font-medium text-white shadow-sm">
                Tap the hair to place a section · drag still turns the head
              </span>
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-1.5 p-3">
            {(Object.keys(VIEWS) as ViewName[]).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => goTo(name)}
                aria-pressed={!freeCamera && view === name}
                className={cn(
                  'pointer-events-auto rounded-full border px-2.5 py-1 text-2xs font-medium shadow-sm backdrop-blur transition-colors',
                  !freeCamera && view === name
                    ? 'border-brand-300 bg-brand-600 text-white'
                    : 'border-stone-300 bg-white/85 text-ink-muted hover:text-ink',
                )}
              >
                {VIEW_LABELS[name]}
              </button>
            ))}
            {freeCamera ? (
              <button
                type="button"
                onClick={() => goTo('FRONT')}
                className="pointer-events-auto flex items-center gap-1 rounded-full border border-stone-300 bg-white/85 px-2.5 py-1 text-2xs font-medium text-ink-muted shadow-sm backdrop-blur hover:text-ink"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                Reset
              </button>
            ) : null}
          </div>
        </div>

        {/* The panel. */}
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

          {/*
            THE PHOTOGRAPH, ON ITS OWN ROW AND SECOND.
            
            Not beside Save and Book: those two are what the studio is FOR —
            agreeing a shape and turning it into an appointment — and both work
            offline, instantly, for free. This one costs money and takes a
            minute. Putting it first would make the cheap, certain path look like
            the afterthought.
          */}
          {/*
            BROWSE FIRST, THEN ADVISE, THEN PHOTOGRAPH — the order of a real
            consultation, top to bottom.
            
            Somebody flicking through to see what they like has not decided
            anything yet, which is before "what would suit me" and well before
            "what would it look like on me".
          */}
          <button
            type="button"
            onClick={() => setLookBookOpen(true)}
            className="flex items-center justify-center gap-1.5 border-b border-stone-200 px-4 py-2 text-2xs font-medium text-ink-muted transition-colors hover:bg-stone-50 hover:text-ink"
          >
            <Images className="h-3.5 w-3.5" aria-hidden />
            Explore hairstyles
          </button>

          {/*
            THE ADVISOR SITS ABOVE THE PHOTOGRAPH, AND ABOVE IN THE ORDER OF
            OPERATIONS TOO.
            
            "Which cut suits her" comes before "what does it look like" in a real
            consultation, and this one is free, instant and offline — so it is the
            first thing offered after Save and Book.
          */}
          <button
            type="button"
            onClick={() => setAdvisorOpen(true)}
            className="flex items-center justify-center gap-1.5 border-b border-stone-200 px-4 py-2 text-2xs font-medium text-ink-muted transition-colors hover:bg-stone-50 hover:text-ink"
          >
            <Wand2 className="h-3.5 w-3.5" aria-hidden />
            What would suit {customer ? customer.name.split(' ')[0] : 'her'}?
          </button>

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
            See it on a model
            {dirty && savedId ? <span className="text-amber-700">· unsaved changes</span> : null}
          </button>

          {style.service ? (
            <p className="border-b border-stone-200 px-4 py-2 text-2xs text-ink-subtle">
              {style.service.name} &middot; {money(style.service.price)} &middot; {style.service.durationMin} min
            </p>
          ) : (
            // Said here rather than only on failure: the person choosing the
            // style is often the person who can attach the service.
            <p className="border-b border-stone-200 bg-amber-50 px-4 py-2 text-2xs text-amber-800">
              No service attached to this style yet, so it cannot be booked.
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <Controls
              styles={styles}
              state={state}
              onChange={change}
              painting={painting}
              onPaintingChange={setPainting}
            />
          </div>
        </div>
      </div>

      <LookBook
        open={lookBookOpen}
        onClose={() => setLookBookOpen(false)}
        styles={styles}
        onChoose={(catalogId) => {
          // Through `change`, like the advisor, so the style's own limits
          // re-bound everything underneath it rather than carrying a fade across
          // from a taper to a bob.
          change({ ...state, catalogId });
          setLookBookOpen(false);
        }}
      />

      <Advisor
        open={advisorOpen}
        onClose={() => setAdvisorOpen(false)}
        styles={styles}
        customer={customer}
        onChoose={({ catalogId, texture, length }) => {
          /*
           * The chosen style, plus whatever the reading already knows.
           *
           * Pushed through the same `change` that the control panel uses, so the
           * texture and length coming out of the advisor get re-bounded by what
           * the style actually supports — a recommendation must not be able to
           * put the configurator into a state it would refuse to save.
           */
          const picked = styles.find((item) => item.id === catalogId);
          if (!picked) return;
          change({
            ...state,
            catalogId,
            texture: texture ?? state.texture,
            length: length ?? state.length,
          });
          setAdvisorOpen(false);
          toast.success(`Opened ${picked.name} in the studio`);
        }}
      />

      <PhotoPreview
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        designId={savedId}
        designName={savedName}
        customerId={customer?.id ?? null}
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
                placeholder={`${style.name}, ${state.length.toLowerCase().replace('_', ' ')}`}
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
