'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  DENSITY_LABELS,
  FACE_SHAPE_LABELS,
  LENGTH_LABELS,
  TEXTURE_LABELS,
  type FaceShape,
  type HairDensity,
  type HairLength,
  type HairTexture,
  type Hairstyle,
} from '../hairstyles/types';
import type { Bangs, DesignConfig, FadeType, Intensity, Layers, Parting, Tint } from './hair/spec';

/**
 * WHAT A CUSTOMER MAY CHANGE, AND NOTHING ELSE.
 *
 * Every control here is shown because the chosen style says it is offered. The
 * API refuses a design the style does not allow and the engine ignores it even
 * if one gets through, so this panel is the third statement of the same rule —
 * and the only one of the three the customer ever experiences. A fade slider on
 * a bob is not a harmless extra: it is a promise the chair cannot keep.
 */

export const COLOURS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#1C1917' },
  { name: 'Dark brown', hex: '#3B2417' },
  { name: 'Brown', hex: '#5A3A22' },
  { name: 'Light brown', hex: '#7B5230' },
  { name: 'Dark blonde', hex: '#9A6B3A' },
  { name: 'Blonde', hex: '#C9A063' },
  { name: 'Copper', hex: '#B4551F' },
  { name: 'Red', hex: '#8C2F23' },
  { name: 'Grey', hex: '#8E8A86' },
  { name: 'White', hex: '#DEDAD4' },
];

const BANG_LABELS: Record<Bangs, string> = {
  NONE: 'None',
  CURTAIN: 'Curtain',
  STRAIGHT: 'Straight',
  SIDE: 'Side',
  WISPY: 'Wispy',
  MICRO: 'Micro',
};

const LAYER_LABELS: Record<Layers, string> = {
  NONE: 'None',
  LIGHT: 'Light',
  MEDIUM: 'Medium',
  HEAVY: 'Heavy',
};

const PARTING_LABELS: Record<Parting, string> = {
  NATURAL: 'Natural',
  CENTER: 'Centre',
  LEFT: 'Left',
  RIGHT: 'Right',
  DEEP_SIDE: 'Deep side',
};

const FADE_LABELS: Record<FadeType, string> = { LOW: 'Low', MID: 'Mid', HIGH: 'High' };
const INTENSITY_LABELS: Record<Intensity, string> = { SUBTLE: 'Subtle', MEDIUM: 'Medium', STRONG: 'Strong' };

// ------------------------------------------------------------- pieces -----

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-stone-200 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</span>
        <ChevronDown className={cn('h-4 w-4 text-ink-subtle transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? <div className="space-y-3.5 px-4 pb-4">{children}</div> : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink">{label}</p>
      {children}
    </div>
  );
}

function Chips<T extends string>({
  options,
  labels,
  value,
  onChange,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs transition-colors',
            option === value
              ? 'border-brand-300 bg-brand-50 font-medium text-brand-700'
              : 'border-stone-300 bg-white text-ink-muted hover:text-ink',
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-ink">{label}</span>
        <span className="tnum text-2xs text-ink-subtle">
          {value}
          {suffix ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-stone-200 accent-brand-600"
      />
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {COLOURS.map((colour) => (
          <button
            key={colour.hex}
            type="button"
            title={colour.name}
            aria-label={colour.name}
            aria-pressed={colour.hex.toLowerCase() === value.toLowerCase()}
            onClick={() => onChange(colour.hex)}
            className={cn(
              'h-7 w-7 rounded-full border-2 transition-transform',
              colour.hex.toLowerCase() === value.toLowerCase()
                ? 'border-brand-600 scale-110'
                : 'border-stone-300 hover:scale-105',
            )}
            style={{ backgroundColor: colour.hex }}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-2xs text-ink-subtle">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-7 w-10 cursor-pointer rounded border border-stone-300 bg-white p-0.5"
        />
        Custom colour
      </label>
    </div>
  );
}

/** A colour treatment: off, or a colour and how hard it was applied. */
function TintRow({
  label,
  tint,
  onChange,
  fallback,
  extra,
}: {
  label: string;
  tint: Tint | undefined;
  onChange: (tint: Tint | undefined) => void;
  fallback: string;
  extra?: React.ReactNode;
}) {
  const on = Boolean(tint?.enabled);
  const current = tint ?? { enabled: false, color: fallback, intensity: 'MEDIUM' as Intensity };

  return (
    <div className="rounded-lg border border-stone-200 p-2.5">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => onChange({ ...current, enabled: event.target.checked })}
          className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-xs font-medium text-ink">{label}</span>
      </label>
      {on ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={current.color}
              aria-label={`${label} colour`}
              onChange={(event) => onChange({ ...current, color: event.target.value.toUpperCase() })}
              className="h-7 w-10 cursor-pointer rounded border border-stone-300 bg-white p-0.5"
            />
            <Chips
              options={['SUBTLE', 'MEDIUM', 'STRONG'] as Intensity[]}
              labels={INTENSITY_LABELS}
              value={current.intensity}
              onChange={(intensity) => onChange({ ...current, intensity })}
            />
          </div>
          {extra}
        </div>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------- panel -----

export interface StudioState {
  catalogId: string;
  face: FaceShape;
  texture: HairTexture;
  length: HairLength;
  density: HairDensity;
  volume: number;
  baseColor: string;
  config: DesignConfig;
}

const ALL_TEXTURES: HairTexture[] = ['STRAIGHT', 'WAVY', 'CURLY', 'COILY'];
const ALL_LENGTHS: HairLength[] = ['VERY_SHORT', 'SHORT', 'MEDIUM', 'LONG', 'VERY_LONG'];
const ALL_DENSITIES: HairDensity[] = ['LOW', 'MEDIUM', 'HIGH'];
const ALL_FACES: FaceShape[] = ['OVAL', 'ROUND', 'SQUARE', 'OBLONG', 'HEART', 'DIAMOND'];

export function Controls({
  styles,
  state,
  onChange,
}: {
  styles: Hairstyle[];
  state: StudioState;
  onChange: (next: StudioState) => void;
}) {
  const style = styles.find((item) => item.id === state.catalogId);
  const set = (patch: Partial<StudioState>) => onChange({ ...state, ...patch });
  const setConfig = (patch: Partial<DesignConfig>) => onChange({ ...state, config: { ...state.config, ...patch } });

  // An empty list means "all of them" — the same reading the API takes, because
  // a salon that has not answered has not refused.
  const allowed = <T extends string>(list: T[], all: T[]) => (list.length === 0 ? all : list);

  const textures = allowed(style?.supportedTextures ?? [], ALL_TEXTURES);
  const lengths = allowed(style?.supportedLengths ?? [], ALL_LENGTHS);
  const densities = allowed(style?.supportedDensities ?? [], ALL_DENSITIES);

  const grouped = [
    { label: 'Women', list: styles.filter((item) => item.gender === 'FEMALE') },
    { label: 'Men', list: styles.filter((item) => item.gender === 'MALE') },
    { label: 'Anyone', list: styles.filter((item) => item.gender === 'UNISEX') },
  ].filter((group) => group.list.length > 0);

  return (
    <div className="divide-y divide-stone-200">
      <Section title="The cut">
        <Row label="Style">
          <select
            value={state.catalogId}
            aria-label="Style"
            onChange={(event) => set({ catalogId: event.target.value })}
            className="h-9 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-ink shadow-sm"
          >
            {grouped.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.list.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {style?.description ? <p className="mt-1.5 text-2xs text-ink-subtle">{style.description}</p> : null}
        </Row>

        <Row label="Texture">
          <Chips options={textures} labels={TEXTURE_LABELS} value={state.texture} onChange={(texture) => set({ texture })} />
        </Row>

        <Row label="Length">
          <Chips options={lengths} labels={LENGTH_LABELS} value={state.length} onChange={(length) => set({ length })} />
        </Row>

        <Row label="Density">
          <Chips options={densities} labels={DENSITY_LABELS} value={state.density} onChange={(density) => set({ density })} />
        </Row>

        <Slider label="Volume" value={state.volume} onChange={(volume) => set({ volume })} />
      </Section>

      {/* Only the controls this style actually offers. */}
      {style?.supportsBangs || style?.supportsLayers || style?.supportsParting || style?.supportsFade ? (
        <Section title="Shaping">
          {style?.supportsBangs ? (
            <Row label="Bangs">
              <Chips
                options={['NONE', 'CURTAIN', 'STRAIGHT', 'SIDE', 'WISPY', 'MICRO'] as Bangs[]}
                labels={BANG_LABELS}
                value={state.config.bangs}
                onChange={(bangs) => setConfig({ bangs })}
              />
            </Row>
          ) : null}

          {style?.supportsLayers ? (
            <>
              <Row label="Layers">
                <Chips
                  options={['NONE', 'LIGHT', 'MEDIUM', 'HEAVY'] as Layers[]}
                  labels={LAYER_LABELS}
                  value={state.config.layers}
                  onChange={(layers) => setConfig({ layers })}
                />
              </Row>
              {state.config.layers !== 'NONE' ? (
                <Slider
                  label="Face-framing"
                  value={state.config.faceFramingLayers ?? 0}
                  onChange={(faceFramingLayers) => setConfig({ faceFramingLayers })}
                />
              ) : null}
            </>
          ) : null}

          {style?.supportsParting ? (
            <Row label="Parting">
              <Chips
                options={['NATURAL', 'CENTER', 'LEFT', 'RIGHT', 'DEEP_SIDE'] as Parting[]}
                labels={PARTING_LABELS}
                value={state.config.parting}
                onChange={(parting) => setConfig({ parting })}
              />
            </Row>
          ) : null}

          {style?.supportsFade ? (
            <>
              <Row label="Fade">
                <Chips
                  options={['LOW', 'MID', 'HIGH'] as FadeType[]}
                  labels={FADE_LABELS}
                  value={state.config.fade?.type ?? 'MID'}
                  onChange={(type) =>
                    setConfig({ fade: { type, guard: state.config.fade?.guard ?? 1, topLength: state.config.fade?.topLength ?? 60 } })
                  }
                />
              </Row>
              <Row label="Guard">
                <Chips
                  options={['0', '0.5', '1', '2', '3']}
                  labels={{ '0': 'Skin', '0.5': '0.5', '1': '1', '2': '2', '3': '3' }}
                  value={String(state.config.fade?.guard ?? 1)}
                  onChange={(guard) =>
                    setConfig({
                      fade: {
                        type: state.config.fade?.type ?? 'MID',
                        guard: Number(guard) as 0 | 0.5 | 1 | 2 | 3,
                        topLength: state.config.fade?.topLength ?? 60,
                      },
                    })
                  }
                />
              </Row>
              <Slider
                label="Length on top"
                value={state.config.fade?.topLength ?? 60}
                onChange={(topLength) =>
                  setConfig({
                    fade: { type: state.config.fade?.type ?? 'MID', guard: state.config.fade?.guard ?? 1, topLength },
                  })
                }
              />
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title="Colour">
        <Row label="Base">
          <Swatches value={state.baseColor} onChange={(baseColor) => set({ baseColor })} />
        </Row>
      </Section>

      <Section title="Colour work" defaultOpen={false}>
        <TintRow
          label="Highlights"
          tint={state.config.highlights}
          fallback="#C9A063"
          onChange={(highlights) => setConfig({ highlights })}
        />
        <TintRow
          label="Lowlights"
          tint={state.config.lowlights}
          fallback="#3B2417"
          onChange={(lowlights) => setConfig({ lowlights })}
        />
        <TintRow
          label="Balayage"
          tint={state.config.balayage}
          fallback="#C58B55"
          onChange={(tint) =>
            setConfig({
              balayage: tint ? { ...tint, placement: state.config.balayage?.placement ?? 'ENDS' } : undefined,
            })
          }
          extra={
            <Chips
              options={['MID', 'ENDS', 'FULL']}
              labels={{ MID: 'From mid', ENDS: 'Ends', FULL: 'All over' }}
              value={state.config.balayage?.placement ?? 'ENDS'}
              onChange={(placement) =>
                setConfig({
                  balayage: {
                    enabled: true,
                    color: state.config.balayage?.color ?? '#C58B55',
                    intensity: state.config.balayage?.intensity ?? 'MEDIUM',
                    placement: placement as 'MID' | 'ENDS' | 'FULL',
                  },
                })
              }
            />
          }
        />

        <div className="rounded-lg border border-stone-200 p-2.5">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(state.config.ombre?.enabled)}
              onChange={(event) =>
                setConfig({
                  ombre: {
                    enabled: event.target.checked,
                    rootColor: state.config.ombre?.rootColor ?? state.baseColor,
                    endColor: state.config.ombre?.endColor ?? '#C9A063',
                  },
                })
              }
              className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs font-medium text-ink">Ombre</span>
          </label>
          {state.config.ombre?.enabled ? (
            <div className="mt-2 flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-2xs text-ink-subtle">
                Root
                <input
                  type="color"
                  value={state.config.ombre.rootColor}
                  aria-label="Ombre root colour"
                  onChange={(event) =>
                    setConfig({ ombre: { ...state.config.ombre!, rootColor: event.target.value.toUpperCase() } })
                  }
                  className="h-7 w-9 cursor-pointer rounded border border-stone-300 bg-white p-0.5"
                />
              </label>
              <label className="flex items-center gap-1.5 text-2xs text-ink-subtle">
                Ends
                <input
                  type="color"
                  value={state.config.ombre.endColor}
                  aria-label="Ombre end colour"
                  onChange={(event) =>
                    setConfig({ ombre: { ...state.config.ombre!, endColor: event.target.value.toUpperCase() } })
                  }
                  className="h-7 w-9 cursor-pointer rounded border border-stone-300 bg-white p-0.5"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-stone-200 p-2.5">
            <input
              type="checkbox"
              checked={Boolean(state.config.moneyPiece?.enabled)}
              onChange={(event) =>
                setConfig({
                  moneyPiece: { enabled: event.target.checked, color: state.config.moneyPiece?.color ?? '#D9B380' },
                })
              }
              className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs font-medium text-ink">Money piece</span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-stone-200 p-2.5">
            <input
              type="checkbox"
              checked={Boolean(state.config.faceFraming?.enabled)}
              onChange={(event) =>
                setConfig({
                  faceFraming: { enabled: event.target.checked, color: state.config.faceFraming?.color ?? '#C9A063' },
                })
              }
              className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs font-medium text-ink">Face framing</span>
          </label>
        </div>

        <div className="rounded-lg border border-stone-200 p-2.5">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(state.config.rootShadow?.enabled)}
              onChange={(event) =>
                setConfig({
                  rootShadow: {
                    enabled: event.target.checked,
                    color: state.config.rootShadow?.color ?? '#2A1B12',
                    depth: state.config.rootShadow?.depth ?? 30,
                    blend: state.config.rootShadow?.blend ?? 50,
                  },
                })
              }
              className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs font-medium text-ink">Root shadow</span>
          </label>
          {state.config.rootShadow?.enabled ? (
            <div className="mt-2 space-y-2">
              <input
                type="color"
                value={state.config.rootShadow.color}
                aria-label="Root shadow colour"
                onChange={(event) =>
                  setConfig({ rootShadow: { ...state.config.rootShadow!, color: event.target.value.toUpperCase() } })
                }
                className="h-7 w-10 cursor-pointer rounded border border-stone-300 bg-white p-0.5"
              />
              <Slider
                label="Depth"
                value={state.config.rootShadow.depth}
                onChange={(depth) => setConfig({ rootShadow: { ...state.config.rootShadow!, depth } })}
              />
              <Slider
                label="Blend"
                value={state.config.rootShadow.blend}
                onChange={(blend) => setConfig({ rootShadow: { ...state.config.rootShadow!, blend } })}
              />
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Head" defaultOpen={false}>
        <Row label="Face shape">
          <Chips options={ALL_FACES} labels={FACE_SHAPE_LABELS} value={state.face} onChange={(face) => set({ face })} />
        </Row>
        {style && style.recommendedFaceShapes.length > 0 ? (
          <p className="text-2xs text-ink-subtle">
            {style.recommendedFaceShapes.includes(state.face)
              ? `A ${style.name.toLowerCase()} suits this face shape.`
              : `Usually cut on ${style.recommendedFaceShapes.map((shape) => FACE_SHAPE_LABELS[shape].toLowerCase()).join(', ')} faces — advice, not a rule.`}
          </p>
        ) : null}
      </Section>
    </div>
  );
}
