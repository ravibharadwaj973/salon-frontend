'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, FormRow, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import {
  DENSITY_LABELS,
  FACE_SHAPE_LABELS,
  GENDER_LABELS,
  LENGTH_LABELS,
  MAINTENANCE_LABELS,
  TEXTURE_LABELS,
  type FaceShape,
  type HairDensity,
  type HairGender,
  type HairLength,
  type HairMaintenance,
  type HairTexture,
  type Hairstyle,
  type HairstyleKind,
} from './types';

interface ServiceOption {
  id: string;
  name: string;
}

/**
 * A chip row that can only offer what the generator can draw.
 *
 * The backend refuses a widened entry, and a form that lets somebody tick
 * "coily" on a blunt cut and then explains why not is a worse way of saying the
 * same thing than not offering the tick at all.
 */
function ChipGroup<T extends string>({
  options,
  labels,
  selected,
  onToggle,
}: {
  options: T[];
  labels: Record<T, string>;
  selected: T[];
  onToggle: (value: T) => void;
}) {
  if (options.length === 0) {
    return <p className="text-xs text-ink-subtle">Not offered on this style.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option)}
            className={
              on
                ? 'rounded-full border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700'
                : 'rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs text-ink-muted hover:text-ink'
            }
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

interface FormState {
  kind: string;
  name: string;
  category: string;
  gender: HairGender;
  description: string;
  supportedTextures: HairTexture[];
  supportedLengths: HairLength[];
  supportedDensities: HairDensity[];
  recommendedFaceShapes: FaceShape[];
  supportsBangs: boolean;
  supportsLayers: boolean;
  supportsParting: boolean;
  supportsFade: boolean;
  maintenance: HairMaintenance;
  serviceId: string;
  isActive: boolean;
  sortOrder: string;
}

function initial(kinds: HairstyleKind[], style?: Hairstyle): FormState {
  const kind = style ? kinds.find((k) => k.key === style.kind) : kinds[0];
  if (style) {
    return {
      kind: style.kind,
      name: style.name,
      category: style.category ?? '',
      gender: style.gender,
      description: style.description ?? '',
      supportedTextures: style.supportedTextures,
      supportedLengths: style.supportedLengths,
      supportedDensities: style.supportedDensities,
      recommendedFaceShapes: style.recommendedFaceShapes,
      supportsBangs: style.supportsBangs,
      supportsLayers: style.supportsLayers,
      supportsParting: style.supportsParting,
      supportsFade: style.supportsFade,
      maintenance: style.maintenance,
      serviceId: style.serviceId ?? '',
      isActive: style.isActive,
      sortOrder: String(style.sortOrder),
    };
  }
  return {
    kind: kind?.key ?? '',
    name: kind?.variants[0] ?? '',
    category: kind?.category ?? '',
    gender: kind?.gender ?? 'UNISEX',
    description: '',
    // Everything the generator can do, to start. An empty list means "all" to
    // the API anyway, but showing the ticks is how somebody learns what the
    // style is capable of before they narrow it.
    supportedTextures: kind?.textures ?? [],
    supportedLengths: kind?.lengths ?? [],
    supportedDensities: kind?.densities ?? [],
    recommendedFaceShapes: kind?.faceShapes ?? [],
    supportsBangs: kind?.supportsBangs ?? false,
    supportsLayers: kind?.supportsLayers ?? false,
    supportsParting: kind?.supportsParting ?? true,
    supportsFade: kind?.supportsFade ?? false,
    maintenance: kind?.maintenance ?? 'MEDIUM',
    serviceId: '',
    isActive: true,
    sortOrder: '0',
  };
}

export function HairstyleEditor({
  kinds,
  services,
  style,
  trigger,
}: {
  kinds: HairstyleKind[];
  services: ServiceOption[];
  style?: Hairstyle;
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => initial(kinds, style));

  const editing = Boolean(style);
  const kind = kinds.find((k) => k.key === form.kind);

  function show() {
    setForm(initial(kinds, style));
    setError(null);
    setOpen(true);
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggle = <T extends string>(key: keyof FormState, value: T) =>
    setForm((current) => {
      const list = current[key] as unknown as T[];
      return {
        ...current,
        [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
      };
    });

  /**
   * Changing the generator re-bounds everything beneath it.
   *
   * Carrying the old selections across would leave a bob offering a fade the
   * moment somebody switched it from a taper, and the save would be refused
   * with an error about a control they never touched.
   */
  function chooseKind(key: string) {
    const next = kinds.find((k) => k.key === key);
    if (!next) return;
    setForm((current) => ({
      ...current,
      kind: key,
      name: current.name.trim() === '' ? next.variants[0] ?? '' : current.name,
      category: next.category,
      gender: next.gender,
      supportedTextures: current.supportedTextures.filter((t) => next.textures.includes(t)),
      supportedLengths: current.supportedLengths.filter((l) => next.lengths.includes(l)),
      supportedDensities: current.supportedDensities.filter((d) => next.densities.includes(d)),
      supportsBangs: current.supportsBangs && next.supportsBangs,
      supportsLayers: current.supportsLayers && next.supportsLayers,
      supportsParting: current.supportsParting && next.supportsParting,
      supportsFade: current.supportsFade && next.supportsFade,
      maintenance: next.maintenance,
    }));
  }

  async function submit() {
    setError(null);
    if (!form.name.trim()) {
      setError('Give the style the name your customers will see.');
      return;
    }

    const body = {
      kind: form.kind,
      name: form.name.trim(),
      category: form.category.trim() || null,
      gender: form.gender,
      description: form.description.trim() || null,
      supportedTextures: form.supportedTextures,
      supportedLengths: form.supportedLengths,
      supportedDensities: form.supportedDensities,
      recommendedFaceShapes: form.recommendedFaceShapes,
      supportsBangs: form.supportsBangs,
      supportsLayers: form.supportsLayers,
      supportsParting: form.supportsParting,
      supportsFade: form.supportsFade,
      maintenance: form.maintenance,
      serviceId: form.serviceId || null,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 0,
    };

    setSaving(true);
    try {
      if (editing && style) {
        await apiPatch(`hair-studio/hairstyles/${style.id}`, body);
        toast.success('Style updated');
      } else {
        await apiPost('hair-studio/hairstyles', body);
        toast.success('Style added');
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const byGender = (gender: HairGender) => kinds.filter((k) => k.gender === gender);

  return (
    <>
      {trigger ? (
        trigger(show)
      ) : (
        <Button onClick={show}>
          <Plus className="h-4 w-4" />
          Add style
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? 'Edit style' : 'Add a style'}
        description="What you offer, and what a customer is allowed to change about it in the studio."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {editing ? 'Save' : 'Add style'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

          <FormRow>
            <Field label="Cut" required hint="What the studio draws">
              {({ id }) => (
                <Select id={id} value={form.kind} onChange={(event) => chooseKind(event.target.value)}>
                  {(['FEMALE', 'MALE', 'UNISEX'] as HairGender[]).map((gender) =>
                    byGender(gender).length > 0 ? (
                      <optgroup key={gender} label={GENDER_LABELS[gender]}>
                        {byGender(gender).map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null,
                  )}
                </Select>
              )}
            </Field>
            <Field label="Name" required hint="What your customers call it">
              {({ id }) => (
                <Input id={id} value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Low fade" />
              )}
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Service" hint="What they are booking">
              {({ id }) => (
                <Select id={id} value={form.serviceId} onChange={(event) => set('serviceId', event.target.value)}>
                  <option value="">Not linked yet</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Upkeep" hint="How often they will be back">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.maintenance}
                  onChange={(event) => set('maintenance', event.target.value as HairMaintenance)}
                >
                  {(['LOW', 'MEDIUM', 'HIGH'] as HairMaintenance[]).map((level) => (
                    <option key={level} value={level}>
                      {MAINTENANCE_LABELS[level]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </FormRow>

          <Field label="Description">
            {({ id }) => (
              <Textarea
                id={id}
                rows={2}
                value={form.description}
                onChange={(event) => set('description', event.target.value)}
                placeholder="How you would describe it to someone in the chair"
              />
            )}
          </Field>

          <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/50 p-3.5">
            <p className="text-xs font-semibold text-ink">What a customer can change</p>

            <Field label="Hair texture">
              {() => (
                <ChipGroup
                  options={kind?.textures ?? []}
                  labels={TEXTURE_LABELS}
                  selected={form.supportedTextures}
                  onToggle={(value) => toggle('supportedTextures', value)}
                />
              )}
            </Field>

            <Field label="Length">
              {() => (
                <ChipGroup
                  options={kind?.lengths ?? []}
                  labels={LENGTH_LABELS}
                  selected={form.supportedLengths}
                  onToggle={(value) => toggle('supportedLengths', value)}
                />
              )}
            </Field>

            <Field label="Density">
              {() => (
                <ChipGroup
                  options={kind?.densities ?? []}
                  labels={DENSITY_LABELS}
                  selected={form.supportedDensities}
                  onToggle={(value) => toggle('supportedDensities', value)}
                />
              )}
            </Field>

            <div className="grid gap-2 sm:grid-cols-2">
              {/*
                Disabled rather than hidden when the cut cannot take it: a
                stylist glancing at this learns what the cut is, which is worth
                more than a tidier form.
              */}
              <Checkbox
                label="Bangs"
                checked={form.supportsBangs}
                disabled={!kind?.supportsBangs}
                description={kind?.supportsBangs ? undefined : 'This cut does not take bangs'}
                onChange={(event) => set('supportsBangs', event.target.checked)}
              />
              <Checkbox
                label="Layers"
                checked={form.supportsLayers}
                disabled={!kind?.supportsLayers}
                description={kind?.supportsLayers ? undefined : 'This cut does not take layers'}
                onChange={(event) => set('supportsLayers', event.target.checked)}
              />
              <Checkbox
                label="Parting"
                checked={form.supportsParting}
                disabled={!kind?.supportsParting}
                description={kind?.supportsParting ? undefined : 'Nothing to part'}
                onChange={(event) => set('supportsParting', event.target.checked)}
              />
              <Checkbox
                label="Fade"
                checked={form.supportsFade}
                disabled={!kind?.supportsFade}
                description={kind?.supportsFade ? undefined : 'Not a faded cut'}
                onChange={(event) => set('supportsFade', event.target.checked)}
              />
            </div>
          </div>

          <Field label="Suits these face shapes" hint="Advice in the studio, never a restriction">
            {() => (
              <ChipGroup
                options={['OVAL', 'ROUND', 'SQUARE', 'OBLONG', 'HEART', 'DIAMOND'] as FaceShape[]}
                labels={FACE_SHAPE_LABELS}
                selected={form.recommendedFaceShapes}
                onToggle={(value) => toggle('recommendedFaceShapes', value)}
              />
            )}
          </Field>

          <FormRow>
            <Field label="Order" hint="Lower comes first in the studio">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(event) => set('sortOrder', event.target.value)}
                />
              )}
            </Field>
            <div className="flex items-end pb-1">
              <Checkbox
                label="Offered"
                description="Switch off to take it out of the studio without losing the designs made from it."
                checked={form.isActive}
                onChange={(event) => set('isActive', event.target.checked)}
              />
            </div>
          </FormRow>
        </div>
      </Modal>
    </>
  );
}
