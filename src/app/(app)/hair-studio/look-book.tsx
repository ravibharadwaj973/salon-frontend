'use client';

import { useMemo, useState } from 'react';
import { ImageOff, Search } from 'lucide-react';
import { Badge } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { GENDER_LABELS, type HairLength, type HairTexture, type Hairstyle } from './catalogue-types';

/**
 * THE LOOK-BOOK — WHAT THE SALON OFFERS, AS PICTURES.
 *
 * The configurator is for the look somebody is building; this is for the moment
 * before that, when nobody has decided anything yet and a customer is flicking
 * through to see what they like. Those are different screens because they answer
 * different questions, and the dropdown in the panel answers neither: a style
 * picker listing thirty names is a thing a stylist uses because they already know
 * what the names mean.
 *
 * It is also what makes the reference pictures worth generating. A library of
 * photographs with no screen that browses them is an expense.
 *
 * ── Why the filters are these filters ─────────────────────────────────────
 *
 * They are the ones a customer uses out loud: how long, how curly, who it is for.
 * Not face shape — that is the advisor's job and it needs a reading first — and
 * not maintenance, which nobody browses by even though it is the thing that most
 * often makes the cut wrong.
 */

type Group = 'ALL' | 'POPULAR' | 'SHORT' | 'MEDIUM' | 'LONG' | 'STRAIGHT' | 'CURLY' | 'MEN' | 'WOMEN';

const GROUPS: { key: Group; label: string }[] = [
  { key: 'ALL', label: 'Everything' },
  { key: 'POPULAR', label: 'Most chosen' },
  { key: 'SHORT', label: 'Short' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'LONG', label: 'Long' },
  { key: 'STRAIGHT', label: 'Straight' },
  { key: 'CURLY', label: 'Curly' },
  { key: 'WOMEN', label: "Women's" },
  { key: 'MEN', label: "Men's" },
];

const LENGTHS: Record<'SHORT' | 'MEDIUM' | 'LONG', HairLength[]> = {
  SHORT: ['VERY_SHORT', 'SHORT'],
  MEDIUM: ['MEDIUM'],
  LONG: ['LONG', 'VERY_LONG'],
};

const TEXTURES: Record<'STRAIGHT' | 'CURLY', HairTexture[]> = {
  STRAIGHT: ['STRAIGHT', 'WAVY'],
  CURLY: ['CURLY', 'COILY'],
};

/**
 * An empty supported-array means "all of them" — the same reading the API takes,
 * because a salon that has not answered has not thereby refused. Getting this
 * backwards would hide most of the menu from every filter, which is the kind of
 * bug that looks like an empty catalogue.
 */
const supports = <T extends string>(list: T[], wanted: T[]) =>
  list.length === 0 || list.some((item) => wanted.includes(item));

export function LookBook({
  open,
  onClose,
  styles,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  styles: Hairstyle[];
  onChoose: (catalogId: string) => void;
}) {
  const [group, setGroup] = useState<Group>('ALL');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    let list = styles.filter((style) => style.isActive);

    if (text) {
      list = list.filter(
        (style) =>
          style.name.toLowerCase().includes(text) ||
          (style.category ?? '').toLowerCase().includes(text) ||
          (style.description ?? '').toLowerCase().includes(text),
      );
    }

    switch (group) {
      case 'SHORT':
      case 'MEDIUM':
      case 'LONG':
        list = list.filter((style) => supports(style.supportedLengths, LENGTHS[group]));
        break;
      case 'STRAIGHT':
      case 'CURLY':
        list = list.filter((style) => supports(style.supportedTextures, TEXTURES[group]));
        break;
      case 'MEN':
        list = list.filter((style) => style.gender === 'MALE' || style.gender === 'UNISEX');
        break;
      case 'WOMEN':
        list = list.filter((style) => style.gender === 'FEMALE' || style.gender === 'UNISEX');
        break;
      case 'POPULAR':
        /*
         * Sorted by this salon's own saved looks, and styles nobody has chosen
         * are dropped rather than ranked last. "Most chosen" containing something
         * chosen zero times is how a trending list stops being believed.
         */
        list = list.filter((style) => (style.timesChosen ?? 0) > 0).sort((a, b) => (b.timesChosen ?? 0) - (a.timesChosen ?? 0));
        break;
      default:
        break;
    }

    return list;
  }, [styles, group, query]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Explore hairstyles"
      description="Everything your salon offers. Pick one to open it in the studio."
      size="xl"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {GROUPS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setGroup(key)}
              aria-pressed={group === key}
              className={cn(
                'rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors',
                group === key
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-stone-200 text-ink-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-xs text-ink-muted">
            {group === 'POPULAR'
              ? 'Nothing has been saved from the studio yet, so there is no "most chosen" to show.'
              : 'Nothing in the menu matches that.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => onChoose(style.id)}
                className="overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition-shadow hover:shadow-pop"
              >
                <div className="aspect-[4/5] bg-stone-100">
                  {style.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={style.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    /*
                      A style with no picture is still bookable, so it is still
                      here — showing only the illustrated half of the menu would
                      quietly stop selling everything the salon has not got round
                      to photographing.
                    */
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-ink-subtle">
                      <ImageOff className="h-4 w-4" aria-hidden />
                      <span className="text-2xs">No picture yet</span>
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-medium text-ink">{style.name}</p>
                  <p className="truncate text-2xs text-ink-subtle">
                    {style.category ?? GENDER_LABELS[style.gender]}
                  </p>
                  {(style.timesChosen ?? 0) > 0 ? (
                    <Badge tone="neutral" className="mt-1.5">
                      Chosen {style.timesChosen}×
                    </Badge>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
