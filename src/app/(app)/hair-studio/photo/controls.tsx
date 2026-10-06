'use client';

import { useState } from 'react';
import { Brush, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { PhotoDesign } from './renderer';

/**
 * EVERY CONTROL HERE COSTS NOTHING TO MOVE.
 *
 * That is the one thing worth saying about this panel, and it is why it can have
 * sliders at all. When a colour change meant another call to the image model,
 * the honest interface was a short list of presets and a wait; now that it is a
 * shader over two textures, a stylist can drag the lift from black to blonde and
 * watch it happen, and try forty combinations in the time one generation used to
 * take.
 */

const BASE_SWATCHES = [
  ['#0A0A0A', 'Jet black'],
  ['#1C1512', 'Natural black'],
  ['#2E211C', 'Darkest brown'],
  ['#3B2417', 'Dark chocolate'],
  ['#4A3121', 'Medium brown'],
  ['#6B4A2F', 'Chestnut'],
  ['#8B5A2B', 'Light brown'],
  ['#A9743F', 'Caramel'],
  ['#C68642', 'Honey'],
  ['#D9A95C', 'Golden blonde'],
  ['#E8C88A', 'Buttery blonde'],
  ['#F2E2C4', 'Platinum'],
  ['#8C3B1B', 'Deep auburn'],
  ['#B4441F', 'Copper'],
  ['#D2552B', 'Ginger'],
  ['#7A2F3A', 'Burgundy'],
  ['#9B9B9B', 'Silver'],
  ['#D6D6D6', 'White'],
] as const;

export function PhotoControls({
  design,
  onChange,
  painting,
  onPaintingChange,
  canRecolour,
}: {
  design: PhotoDesign;
  onChange: (next: PhotoDesign) => void;
  painting: boolean;
  onPaintingChange: (painting: boolean) => void;
  /** False when the style's photograph has no mask cut out of it yet. */
  canRecolour: boolean;
}) {
  const set = (patch: Partial<PhotoDesign>) => onChange({ ...design, ...patch });
  const patchStrip = (id: string, patch: Partial<PhotoDesign['strips'][number]>) =>
    set({ strips: design.strips.map((strip) => (strip.id === id ? { ...strip, ...patch } : strip)) });

  if (!canRecolour) {
    return (
      <div className="p-4">
        <p className="rounded-lg bg-amber-50 p-3 text-2xs leading-relaxed text-amber-900">
          This style has a photograph but nobody has cut the hair out of it yet, so it cannot be recoloured. Open it in
          the Hair library and tap the hair a few times — it takes about twenty seconds, once, and then every colour
          here is instant and free.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-stone-200">
      <Section title="Colour">
        <Swatches value={design.baseColor} onChange={(baseColor) => set({ baseColor })} />
        {/*
          THE SLIDER THAT MAKES THE WHOLE THING WORK.

          Hue alone cannot turn black hair blonde — black has nowhere to go. This
          is the bleach step: how far the hair's own luminance is rescaled onto
          the colour chosen above. At 0 the original lighting is untouched and the
          colour is a tint; at 100 the hair is taken fully to that level.
        */}
        <Slider
          label="Lift"
          hint="How much the hair is lightened to reach that colour"
          value={design.lift}
          onChange={(lift) => set({ lift })}
        />
      </Section>

      <Section title="Highlights" defaultOpen={false}>
        <Swatches value={design.highlightColor} onChange={(highlightColor) => set({ highlightColor })} />
        <Slider label="How much" value={design.highlightAmount} onChange={(highlightAmount) => set({ highlightAmount })} />
        <Toggle
          label="Face-framing only"
          hint="Around the face rather than woven all over"
          checked={design.highlightFace}
          onChange={(highlightFace) => set({ highlightFace })}
        />
        <p className="text-2xs leading-relaxed text-ink-subtle">
          Highlights land on the strands already catching the light, which is where a colourist puts them — so they
          follow the curls rather than sitting on top of them.
        </p>
      </Section>

      <Section title="Balayage &amp; ombre" defaultOpen={false}>
        <Swatches value={design.endsColor} onChange={(endsColor) => set({ endsColor })} />
        <Slider label="How much" value={design.endsAmount} onChange={(endsAmount) => set({ endsAmount })} />
        <Slider
          label="Starts at"
          hint="How far down the hair the colour begins"
          value={design.endsStart}
          onChange={(endsStart) => set({ endsStart })}
          suffix="%"
        />
      </Section>

      <Section title="Root shadow" defaultOpen={false}>
        <Swatches value={design.rootColor} onChange={(rootColor) => set({ rootColor })} />
        <Slider label="Depth" value={design.rootDepth} onChange={(rootDepth) => set({ rootDepth })} />
      </Section>

      <Section title="Painted sections" defaultOpen={false}>
        <button
          type="button"
          onClick={() => onPaintingChange(!painting)}
          aria-pressed={painting}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
            painting ? 'border-brand-300 bg-brand-600 text-white' : 'border-stone-300 text-ink-muted hover:text-ink',
          )}
        >
          <Brush className="h-3.5 w-3.5" aria-hidden />
          {painting ? 'Tap the photo to place one' : 'Paint a section'}
        </button>

        <p className="text-2xs leading-relaxed text-ink-subtle">
          {painting
            ? 'Tap anywhere on the hair. The colour runs from there downwards and cannot spill onto the face — it is cut to the hair.'
            : 'Pick out a panel by hand, the way a colourist would, instead of choosing from presets.'}
        </p>

        {design.strips.map((strip, index) => (
          <div key={strip.id} className="space-y-2 rounded-lg border border-stone-200 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink">Section {index + 1}</span>
              <button
                type="button"
                onClick={() => set({ strips: design.strips.filter((item) => item.id !== strip.id) })}
                className="text-2xs text-ink-subtle hover:text-rose-700"
              >
                Remove
              </button>
            </div>
            <Swatches value={strip.color} onChange={(color) => patchStrip(strip.id, { color })} />
            <Slider label="Width" value={strip.width} onChange={(width) => patchStrip(strip.id, { width })} />
            <Slider label="Strength" value={strip.strength} onChange={(strength) => patchStrip(strip.id, { strength })} />
            <Slider label="Blend" value={strip.blend} onChange={(blend) => patchStrip(strip.id, { blend })} />
          </div>
        ))}
      </Section>
    </div>
  );
}

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
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-ink"
      >
        {title}
        <ChevronDown className={cn('h-3.5 w-3.5 text-ink-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="space-y-3 px-4 pb-4">{children}</div> : null}
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {BASE_SWATCHES.map(([hex, name]) => (
          <button
            key={hex}
            type="button"
            title={name}
            aria-label={name}
            aria-pressed={value.toLowerCase() === hex.toLowerCase()}
            onClick={() => onChange(hex)}
            className={cn(
              'h-6 w-6 rounded-full ring-1 ring-inset ring-stone-300 transition-transform',
              value.toLowerCase() === hex.toLowerCase() && 'scale-110 ring-2 ring-brand-500',
            )}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-2xs text-ink-subtle">
        {/* A colour picker as well as the swatches: a salon's own shade card does
            not stop at eighteen colours, and there is no cost to any of them. */}
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-stone-300 bg-white p-0.5"
          aria-label="Custom colour"
        />
        Custom
      </label>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  onChange,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink">{label}</span>
        <span className="tnum text-2xs text-ink-subtle">
          {value}
          {suffix ?? ''}
        </span>
      </div>
      {hint ? <p className="mb-1 text-2xs text-ink-subtle">{hint}</p> : null}
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-stone-200 accent-brand-600"
      />
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-muted">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5" />
      <span>
        {label}
        {hint ? <span className="block text-2xs text-ink-subtle">{hint}</span> : null}
      </span>
    </label>
  );
}
