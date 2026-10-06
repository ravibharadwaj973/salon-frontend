'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Sparkles, Upload, Wand2 } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge, Spinner } from '@/components/ui/display';
import { Field, Select } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import type { FaceShape, HairDensity, HairLength, HairTexture, Hairstyle } from './catalogue-types';

/**
 * WHAT WOULD SUIT HER.
 *
 * ── Two readings, and the product needs both ──────────────────────────────
 *
 * A stylist ticking six boxes while looking at the person is faster, free and
 * more accurate than any photograph. A photograph is the only version that works
 * when there is no stylist in the room. So the form is the primary interface and
 * the photo is an accelerant: upload one and the fields arrive pre-filled, and
 * every one of them stays editable. The screen never ends up in a state where the
 * machine's opinion cannot be contradicted.
 *
 * ── The ranking is not from a model ───────────────────────────────────────
 *
 * It is weighted arithmetic over this salon's own active menu, computed on the
 * server: face 30, texture 25, length 15, density 10, stated preference 10,
 * upkeep 10. Each result comes back with its factors, which is why this screen can
 * show WHY something is at 94% instead of asserting it. A number nobody can
 * interrogate gets ignored by the second week.
 */

type Hairline = 'STRAIGHT' | 'ROUNDED' | 'WIDOWS_PEAK' | 'RECEDING' | 'UNEVEN';
type Maintenance = 'LOW' | 'MEDIUM' | 'HIGH';
type Source = 'AI' | 'MANUAL' | 'CORRECTED';

export interface Reading {
  id: string;
  source: Source;
  faceShape: FaceShape | null;
  faceShapeConfidence: number | null;
  texture: HairTexture | null;
  density: HairDensity | null;
  length: HairLength | null;
  volume: number | null;
  hairline: Hairline | null;
  notes: string | null;
  imageUrl: string | null;
}

interface Factor {
  key: 'face' | 'texture' | 'length' | 'density' | 'preference' | 'maintenance';
  fit: number;
  weight: number;
  points: number;
  note: string | null;
}

interface Result {
  catalogId: string;
  kind: string;
  name: string;
  score: number;
  factors: Factor[];
  reason: string;
  caution: string | null;
  category: string | null;
  maintenance: Maintenance | null;
  service: { id: string; name: string; price: number; durationMin: number } | null;
}

interface Advice {
  basis: { source: Source | null; analysisId: string | null; known: string[]; catalogueSize: number };
  results: Result[];
}

const FACE_SHAPES: FaceShape[] = ['OVAL', 'ROUND', 'SQUARE', 'OBLONG', 'HEART', 'DIAMOND'];
const TEXTURES: HairTexture[] = ['STRAIGHT', 'WAVY', 'CURLY', 'COILY'];
const DENSITIES: HairDensity[] = ['LOW', 'MEDIUM', 'HIGH'];
const LENGTHS: HairLength[] = ['VERY_SHORT', 'SHORT', 'MEDIUM', 'LONG', 'VERY_LONG'];
const HAIRLINES: Hairline[] = ['STRAIGHT', 'ROUNDED', 'WIDOWS_PEAK', 'RECEDING', 'UNEVEN'];
const MAINTENANCE: Maintenance[] = ['LOW', 'MEDIUM', 'HIGH'];

const title = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const FACTOR_LABEL: Record<Factor['key'], string> = {
  face: 'Face shape',
  texture: 'Hair texture',
  length: 'Length',
  density: 'Density',
  preference: 'What she asked for',
  maintenance: 'Upkeep',
};

/**
 * A SECOND MAP, BECAUSE THEY ARE DIFFERENT KEYS.
 *
 * `basis.known` lists fields of the PROFILE — faceShape, texture, density,
 * length, gender — while the factors are named after what they score: face,
 * texture, length… Reusing one map for both printed "Scored on faceShape, hair
 * texture, length" on screen, which is a camelCase identifier leaking into a
 * sentence a stylist reads.
 */
const PROFILE_LABEL: Record<string, string> = {
  faceShape: 'her face shape',
  texture: 'her hair texture',
  density: 'density',
  length: 'the length she has now',
  gender: 'who the style is cut for',
};

/** 10MB, matching what the API will accept. Checked before the read, not after. */
const MAX_BYTES = 10 * 1024 * 1024;

export function Advisor({
  open,
  onClose,
  styles,
  customer,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  styles: Hairstyle[];
  customer: { id: string; name: string } | null;
  /** Hands a chosen style back to the studio, with whatever the reading knows. */
  onChoose: (choice: { catalogId: string; texture: HairTexture | null; length: HairLength | null }) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [reading, setReading] = useState<Reading | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [asking, setAsking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // The six observations. A photo pre-fills them; they are always editable.
  const [faceShape, setFaceShape] = useState<FaceShape | ''>('');
  const [texture, setTexture] = useState<HairTexture | ''>('');
  const [density, setDensity] = useState<HairDensity | ''>('');
  const [length, setLength] = useState<HairLength | ''>('');
  const [hairline, setHairline] = useState<Hairline | ''>('');

  // What she says she wants, which the server weights at 10 and 10.
  const [desiredLength, setDesiredLength] = useState<HairLength | ''>('');
  const [maintenance, setMaintenance] = useState<Maintenance | ''>('');
  const [wantsBangs, setWantsBangs] = useState(false);
  const [wantsFade, setWantsFade] = useState(false);

  const apply = useCallback((row: Reading) => {
    setReading(row);
    setFaceShape(row.faceShape ?? '');
    setTexture(row.texture ?? '');
    setDensity(row.density ?? '');
    setLength(row.length ?? '');
    setHairline(row.hairline ?? '');
  }, []);

  /**
   * A reading from a previous visit is worth more than a blank form.
   *
   * Hair changes slowly. Somebody who was read as having wavy, medium-density
   * hair in March still does in June, and making the stylist re-enter it is how a
   * feature stops being used.
   */
  useEffect(() => {
    if (!open || !customer) return;
    void apiGet<Reading | null>(`hair-studio/analyses/customer/${customer.id}`)
      .then((row) => {
        if (row) apply(row);
      })
      .catch(() => {});
  }, [open, customer, apply]);

  function readFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(`That photo is about ${Math.round(file.size / 1024 / 1024)}MB. The limit is 10MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => toast.error('That photo could not be read.');
    reader.readAsDataURL(file);
  }

  async function saveReading() {
    const observations = {
      faceShape: faceShape || null,
      texture: texture || null,
      density: density || null,
      length: length || null,
      hairline: hairline || null,
    };

    if (!photo && !Object.values(observations).some(Boolean)) {
      toast.error('Add a photo, or tick at least one thing you can see.');
      return;
    }
    if (photo && !consent) {
      toast.error('The customer has to agree to their photo being kept.');
      return;
    }

    setAnalysing(true);
    try {
      const row = await apiPost<Reading>('hair-studio/analyses', {
        customerId: customer?.id ?? null,
        photo,
        consent: photo ? consent : undefined,
        ...observations,
      });
      apply(row);
      setPhoto(null);
      toast.success(row.source === 'MANUAL' ? 'Reading saved' : 'Photo read — check the fields and correct anything');
      // Straight on to the answer: nobody opened this to admire a form.
      await ask(row.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAnalysing(false);
    }
  }

  const ask = useCallback(
    async (analysisId?: string | null) => {
      setAsking(true);
      try {
        const result = await apiPost<Advice>('hair-studio/recommendations', {
          analysisId: analysisId ?? reading?.id ?? null,
          customerId: customer?.id ?? null,
          // Sent alongside the stored reading so an unsaved correction counts
          // immediately — a stylist trying "what if it were longer" should not
          // have to save a reading she does not believe.
          faceShape: faceShape || null,
          texture: texture || null,
          density: density || null,
          length: length || null,
          preferences: {
            desiredLength: desiredLength || null,
            maintenance: maintenance || null,
            wantsBangs: wantsBangs || null,
            wantsFade: wantsFade || null,
          },
          limit: 5,
        });
        setAdvice(result);
        if (result.results.length === 0) {
          toast.toast('Nothing in the menu scores well enough to recommend. Loosen the upkeep, or add more styles.', 'warning');
        }
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setAsking(false);
      }
    },
    [reading?.id, customer?.id, faceShape, texture, density, length, desiredLength, maintenance, wantsBangs, wantsFade, toast],
  );

  const hasObservations = !!(faceShape || texture || density || length);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="What would suit her"
      description={
        customer
          ? `Ranked against your own menu for ${customer.name}`
          : 'Ranked against your own menu — pick a customer to keep the reading'
      }
      size="lg"
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="mr-auto text-2xs text-ink-subtle">
            {advice ? `${advice.basis.catalogueSize} styles in your menu` : null}
          </span>
          <Button size="sm" variant="secondary" onClick={() => void saveReading()} loading={analysing}>
            {photo ? 'Read the photo' : 'Save reading'}
          </Button>
          <Button size="sm" onClick={() => void ask()} loading={asking} disabled={analysing}>
            <Wand2 className="h-3.5 w-3.5" />
            Rank the menu
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ---------------------------------------------------- the photo -- */}
        <div className="rounded-xl border border-stone-200 p-3">
          <div className="flex items-start gap-3">
            {reading?.imageUrl || photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo ?? reading?.imageUrl ?? ''}
                alt=""
                className="h-20 w-20 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-stone-100">
                <Camera className="h-5 w-5 text-ink-subtle" aria-hidden />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => cameraRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5" />
                  Take photo
                </Button>
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </Button>
                {reading ? (
                  <Badge tone={reading.source === 'MANUAL' ? 'neutral' : 'info'}>
                    {reading.source === 'MANUAL'
                      ? 'Entered by hand'
                      : reading.source === 'CORRECTED'
                        ? 'Read, then corrected'
                        : `Read from a photo${reading.faceShapeConfidence ? ` · ${Math.round(reading.faceShapeConfidence * 100)}% sure` : ''}`}
                  </Badge>
                ) : null}
              </div>

              {/*
                `capture="user"` rather than getUserMedia: it opens the phone's own
                camera app, which already has the permission, the preview and the
                retake button — none of which is worth rebuilding badly.
              */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="user"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readFile(file);
                  event.target.value = '';
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readFile(file);
                  event.target.value = '';
                }}
              />

              <p className="mt-2 text-2xs leading-relaxed text-ink-muted">
                A photo is optional — it only pre-fills the fields below, and you can change any of them. The reading
                works perfectly well from what you can see yourself.
              </p>

              {photo ? (
                /*
                  CONSENT, ASKED FOR IN THE SAME BREATH AS THE UPLOAD.

                  Not buried in a settings page or assumed from a signup. The API
                  refuses to store a face without it, and this is the only place
                  the answer can honestly be collected: the customer is standing
                  right there.
                */
                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg bg-amber-50 p-2 text-2xs text-amber-900">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    She is happy for this photo to be kept on her record. You can delete it at any time, and deleting
                    it also removes any previews made from it.
                  </span>
                </label>
              ) : null}
            </div>
          </div>
        </div>

        {/* ------------------------------------------- what you can see -- */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Pick label="Face shape" value={faceShape} options={FACE_SHAPES} onChange={setFaceShape} />
          <Pick label="Texture" value={texture} options={TEXTURES} onChange={setTexture} />
          <Pick label="Density" value={density} options={DENSITIES} onChange={setDensity} />
          <Pick label="Length now" value={length} options={LENGTHS} onChange={setLength} />
          <Pick label="Hairline" value={hairline} options={HAIRLINES} onChange={setHairline} />
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-stone-50 p-3 sm:grid-cols-3">
          <Pick label="Length she wants" value={desiredLength} options={LENGTHS} onChange={setDesiredLength} />
          <Pick label="Upkeep she accepts" value={maintenance} options={MAINTENANCE} onChange={setMaintenance} />
          <div className="flex flex-col justify-end gap-1.5 pb-1">
            <Tick label="Wants bangs" checked={wantsBangs} onChange={setWantsBangs} />
            <Tick label="Wants a fade" checked={wantsFade} onChange={setWantsFade} />
          </div>
        </div>

        {/* ------------------------------------------------- the answer -- */}
        {asking ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner />
          </div>
        ) : advice ? (
          <div className="space-y-2">
            <p className="text-2xs text-ink-subtle">
              {advice.basis.known.length
                ? `Scored on ${advice.basis.known.map((key) => PROFILE_LABEL[key] ?? key).join(', ')}. Anything not known is scored neutrally rather than against her.`
                : 'Nothing known about her hair yet, so these are the salon’s general bets.'}
            </p>

            {advice.results.length === 0 ? (
              <p className="rounded-lg bg-stone-50 p-3 text-xs text-ink-muted">
                Nothing in the menu scores above 55% on what you have entered. That is the honest answer rather than
                five padded suggestions — loosen the upkeep, or add the styles you actually cut.
              </p>
            ) : (
              advice.results.map((result) => {
                const known = styles.some((style) => style.id === result.catalogId);
                const isOpen = expanded === result.catalogId;
                return (
                  <div key={result.catalogId} className="rounded-xl border border-stone-200">
                    <div className="flex items-start gap-3 p-3">
                      {/*
                        The number and a bar, because a list of five percentages
                        in the eighties is read as five identical things. The bar
                        is what makes 94 and 81 look different at a glance.
                      */}
                      <div className="w-12 shrink-0 text-center">
                        <p className="text-sm font-semibold text-ink">{result.score}%</p>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-200">
                          <div className="h-full rounded-full bg-brand-600" style={{ width: `${result.score}%` }} />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-ink">{result.name}</p>
                        <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">{result.reason}</p>
                        {result.caution ? (
                          <p className="mt-1 text-2xs text-amber-700">{result.caution}</p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : result.catalogId)}
                            className="text-2xs text-ink-subtle underline-offset-2 hover:underline"
                          >
                            {isOpen ? 'Hide the working' : 'Show the working'}
                          </button>
                          {result.maintenance ? (
                            <span className="text-2xs text-ink-subtle">{title(result.maintenance)} upkeep</span>
                          ) : null}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!known}
                        title={known ? undefined : 'This style is not in the list the studio loaded — reload the page'}
                        onClick={() =>
                          onChoose({
                            catalogId: result.catalogId,
                            texture: texture || null,
                            length: desiredLength || length || null,
                          })
                        }
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Open
                      </Button>
                    </div>

                    {/*
                      THE WORKING, SHOWN ON REQUEST.

                      This is what makes the number arguable. A stylist who can see
                      that a style lost fifteen points on upkeep can say "she'll
                      come in monthly, actually" and change the input — which is a
                      conversation a model's paragraph cannot have.
                    */}
                    {isOpen ? (
                      <div className="space-y-1 border-t border-stone-200 px-3 py-2">
                        {result.factors.map((factor) => (
                          <div key={factor.key} className="flex items-baseline gap-2 text-2xs">
                            <span className="w-28 shrink-0 text-ink-subtle">{FACTOR_LABEL[factor.key]}</span>
                            <span
                              className={cn(
                                'w-14 shrink-0 font-medium',
                                factor.fit >= 0.8 ? 'text-emerald-700' : factor.fit <= 0.3 ? 'text-rose-700' : 'text-ink-muted',
                              )}
                            >
                              {Math.round(factor.points)}/{factor.weight}
                            </span>
                            {/* A factor with no note still scored something, and a
                                bare dash beside "6/10" reads as a bug. */}
                            <span className="text-ink-muted">
                              {factor.note ?? 'Nothing to go on — scored neutrally'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-stone-50 p-3 text-2xs leading-relaxed text-ink-muted">
            {hasObservations
              ? 'Press “Rank the menu”. The ranking is arithmetic over your own active styles — it needs no key, no network and costs nothing.'
              : 'Tick what you can see, or add a photo, then rank the menu.'}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Pick<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | '';
  options: T[];
  onChange: (value: T | '') => void;
}) {
  return (
    <Field label={label}>
      {({ id }) => (
        <Select id={id} value={value} onChange={(event) => onChange(event.target.value as T | '')}>
          {/* An explicit "not known" rather than a default guess: an unknown
              factor is scored as neutral by the server and said so on screen,
              which is more honest than quietly assuming oval. */}
          <option value="">Not sure</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {title(option)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function Tick({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-ink-muted">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
