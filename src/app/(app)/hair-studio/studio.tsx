'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { CalendarPlus, RotateCcw, Save } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import type { FaceShape, HairDensity, HairLength, HairTexture, Hairstyle } from './catalogue-types';
import { Controls, type StudioState } from './controls';
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
}: {
  styles: Hairstyle[];
  customer: StudioCustomer | null;
  initialDesign: InitialDesign | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const first = styles[0];

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

  const style = styles.find((item) => item.id === state.catalogId);

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
          <Viewport
            spec={spec}
            face={state.face}
            options={options}
            view={view}
            viewNonce={viewNonce}
            onUserTookCamera={() => setFreeCamera(true)}
          />

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
            <Controls styles={styles} state={state} onChange={change} />
          </div>
        </div>
      </div>

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
