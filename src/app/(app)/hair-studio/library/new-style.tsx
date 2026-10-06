'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import {
  GENDER_LABELS,
  MAINTENANCE_LABELS,
  type HairMaintenance,
  type HairstyleKind,
} from '../catalogue-types';

/**
 * ADD A STYLE THE SALON ACTUALLY CUTS.
 *
 * ── Why a `kind` has to be chosen and cannot be typed ─────────────────────
 *
 * The catalogue is the salon's menu — its own names, its own prices — but every
 * entry points at one of a fixed set of KINDS, and the API refuses anything else.
 * That is not bureaucracy. The advisor scores a style using the kind's own notion
 * of which faces and textures it suits, and the prompt that generates its
 * reference picture is built from the kind's vocabulary. A free-text kind would
 * produce a style the advisor cannot rank and the model cannot draw.
 *
 * So the kind is picked from the registry the backend publishes, and choosing one
 * fills in everything underneath it. A salon then NARROWS: offering a bob only in
 * medium, say. It can never widen, because the thing on the other end cannot do
 * what the generator cannot do.
 *
 * ── Why "Skin fade" and "Low fade" are two entries on one kind ────────────
 *
 * Because they are two things a salon sells and one thing the engine knows about.
 * The catalogue is unique on (tenant, kind, name) rather than on kind alone,
 * which is what lets a barber list five fades at five prices.
 */

export function NewStyleButton({ kinds }: { kinds: HairstyleKind[] }) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [kindKey, setKindKey] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [maintenance, setMaintenance] = useState<HairMaintenance>('MEDIUM');

  const kind = useMemo(() => kinds.find((item) => item.key === kindKey) ?? null, [kinds, kindKey]);

  /** The salon's name for it, defaulted to one of the kind's own variants. */
  const choose = (key: string) => {
    setKindKey(key);
    const picked = kinds.find((item) => item.key === key);
    if (picked) {
      setMaintenance(picked.maintenance);
      // Only when the box is still untouched — overwriting a name somebody has
      // typed because they changed their mind about the generator is maddening.
      setName((current) => (current.trim() ? current : (picked.variants[0] ?? picked.label)));
      setCategory((current) => (current.trim() ? current : picked.category));
    }
  };

  async function create() {
    if (!kind) {
      toast.error('Pick the kind of cut this is.');
      return;
    }
    if (!name.trim()) {
      toast.error('Give it the name your customers will see.');
      return;
    }

    setSaving(true);
    try {
      /*
       * Created with the kind's FULL range rather than a narrowed one.
       *
       * A salon that has not yet thought about which lengths it offers has not
       * thereby refused all of them — and an empty supported-array is read as
       * "all" everywhere in this codebase, so sending the kind's own lists keeps
       * the entry honest and visible rather than accidentally empty.
       */
      const created = await apiPost<{ id: string; name: string }>('hair-studio/hairstyles', {
        kind: kind.key,
        name: name.trim(),
        category: category.trim() || kind.category,
        gender: kind.gender,
        description: description.trim() || null,
        supportedTextures: kind.textures,
        supportedLengths: kind.lengths,
        supportedDensities: kind.densities,
        recommendedFaceShapes: kind.faceShapes,
        supportsBangs: kind.supportsBangs,
        supportsLayers: kind.supportsLayers,
        supportsParting: kind.supportsParting,
        supportsFade: kind.supportsFade,
        maintenance,
      });
      toast.success(`${created.name} added — give it a picture next`);
      setOpen(false);
      setKindKey('');
      setName('');
      setCategory('');
      setDescription('');
      router.refresh();
    } catch (error) {
      /*
       * The API's own words. It refuses a duplicate name on the same kind and a
       * kind it cannot draw, and both are things the person can fix — "could not
       * save" would send them to support instead.
       */
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Add a style
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a style"
        description="Something your salon cuts. It appears in the studio, the advisor and the look-book."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={create} loading={saving}>
              Add it
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink">What kind of cut is it?</p>
            <p className="mb-2 text-2xs text-ink-subtle">
              This is what the advisor scores against and what the reference picture is drawn from. Pick the nearest —
              your own name for it goes below.
            </p>
            <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-stone-200 p-2 sm:grid-cols-3">
              {kinds.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => choose(item.key)}
                  aria-pressed={kindKey === item.key}
                  className={cn(
                    'rounded-lg border px-2 py-1.5 text-left text-2xs transition-colors',
                    kindKey === item.key
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-stone-200 text-ink-muted hover:text-ink',
                  )}
                >
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-ink-subtle">{GENDER_LABELS[item.gender]}</span>
                </button>
              ))}
            </div>
          </div>

          {kind ? (
            /*
              WHAT THE CHOICE COMMITS TO, shown before it is made rather than
              discovered afterwards in a drawer. Somebody picking "Bob" and then
              finding they cannot offer it long has been told too late.
            */
            <div className="rounded-lg bg-stone-50 p-3 text-2xs text-ink-subtle">
              <p className="font-medium text-ink-muted">A {kind.label.toLowerCase()} can be cut:</p>
              <p className="mt-1">
                {kind.textures.join(', ').toLowerCase()} · {kind.lengths.join(', ').toLowerCase().replace(/_/g, ' ')} ·
                suits {kind.faceShapes.join(', ').toLowerCase()} faces
              </p>
              <p className="mt-1">
                Takes{' '}
                {[
                  kind.supportsBangs && 'bangs',
                  kind.supportsLayers && 'layers',
                  kind.supportsParting && 'a parting',
                  kind.supportsFade && 'a fade',
                ]
                  .filter(Boolean)
                  .join(', ') || 'nothing extra'}
                . You can narrow any of this afterwards — you cannot widen it.
              </p>
              {kind.variants.length > 1 ? (
                <p className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span>Salons usually sell it as:</span>
                  {kind.variants.map((variant) => (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => setName(variant)}
                      className="rounded-full bg-white px-1.5 py-0.5 ring-1 ring-inset ring-stone-200 hover:ring-brand-300"
                    >
                      {variant}
                    </button>
                  ))}
                </p>
              ) : null}
            </div>
          ) : null}

          <Field label="Name" required hint="What a customer sees on the look-book">
            {({ id }) => (
              <Input
                id={id}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={kind?.variants[0] ?? 'Layered bob'}
              />
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" hint="How the look-book groups it">
              {({ id }) => (
                <Input
                  id={id}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder={kind?.category ?? "Women's haircut"}
                />
              )}
            </Field>
            <Field label="Upkeep" hint="The filter nobody records and everybody needs">
              {({ id }) => (
                <Select
                  id={id}
                  value={maintenance}
                  onChange={(event) => setMaintenance(event.target.value as HairMaintenance)}
                >
                  {(['LOW', 'MEDIUM', 'HIGH'] as HairMaintenance[]).map((value) => (
                    <option key={value} value={value}>
                      {MAINTENANCE_LABELS[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label="Description" hint="One line. Customers read it; the advisor does not.">
            {({ id }) => (
              <Textarea id={id} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
            )}
          </Field>

          <p className="flex items-start gap-2 rounded-lg bg-stone-50 p-2.5 text-2xs leading-relaxed text-ink-muted">
            <Badge tone="neutral">Next</Badge>
            <span>
              Adding it costs nothing. Giving it a reference picture is one generation, and cutting the hair out of that
              picture is about twenty seconds — after which every colour in the studio is instant and free.
            </span>
          </p>
        </div>
      </Modal>
    </>
  );
}
