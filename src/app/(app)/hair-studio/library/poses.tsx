'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Plus, Scissors, Trash2 } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Badge, Spinner } from '@/components/ui/display';
import { useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { MaskEditor } from './mask-editor';
import { POSE_LABELS, POSE_WHY, type HairPose, type PhotoChecklist } from '../catalogue-types';

/**
 * THE ANGLES, AS A CHECKLIST RATHER THAN A GALLERY.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PROBLEM THIS SCREEN EXISTS FOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The back of the head is where most of the work in a haircut is, and the front
 * is all anybody photographs.
 *
 * A butterfly cut, a U-cut, a V-cut, layers, a fade — the whole point of each is
 * a shape the customer cannot see on herself. She approves a front view, sits
 * down, and meets the back of her head in a mirror afterwards. That is the
 * commonest route from a technically correct haircut to a complaint, and it is a
 * photography problem rather than a cutting one.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A CHECKLIST AND NOT AN "ADD PHOTO" BUTTON
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Because an "add another photo" button produces eleven front views. Every
 * photograph anybody takes unprompted is from the front; the angle that is
 * missing is precisely the one nobody thinks of, so the screen has to ask for it
 * by name. The slots are therefore fixed and named, one picture each, and the
 * server's unique key on (style, angle) means replacing rather than accumulating.
 *
 * The list of slots comes from the SERVER and is derived from the cut, so it is
 * short: a one-length cut is not asked for four views of the same curtain of
 * hair. A checklist nobody can finish is a feature nobody starts.
 *
 * Each slot says what that angle is FOR, because "Back" is an instruction and
 * "the graduation, the V or U, the fade — what she cannot see on herself" is a
 * reason.
 */

export function Poses({
  catalogId,
  onChanged,
}: {
  catalogId: string;
  /** The front view is mirrored onto the catalogue row, so the grid behind
   *  this drawer goes stale when it changes. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<PhotoChecklist | null>(null);
  const [busy, setBusy] = useState<HairPose | null>(null);
  const [masking, setMasking] = useState<HairPose | null>(null);
  /** One hidden input, retargeted — five file inputs is five ways to leak a
   *  stale selection into the wrong slot. */
  const fileRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HairPose | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await apiGet<PhotoChecklist>(`hair-studio/hairstyles/${catalogId}/photos`));
    } catch {
      // A checklist that cannot load must not block the rest of the drawer, which
      // is where the style's name and price are edited and needs no photographs.
    }
  }, [catalogId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(pose: HairPose, file: File) {
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

    setBusy(pose);
    try {
      /*
       * Consent per ANGLE, not once per style.
       *
       * Each angle is a separate photograph, possibly of a different person on a
       * different day, and agreement to appear in a look-book is given for a
       * picture rather than for a catalogue entry. The API refuses without it
       * independently.
       */
      await apiPost(`hair-studio/hairstyles/${catalogId}/photo`, { pose, photo: dataUrl, consent: true });
      toast.success(`${POSE_LABELS[pose]} added — cut the hair out of it next`);
      await load();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function remove(pose: HairPose) {
    setBusy(pose);
    try {
      await apiPost(`hair-studio/hairstyles/${catalogId}/photo`, { pose, photo: null });
      await load();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner className="h-4 w-4" />
      </div>
    );
  }

  const byPose = new Map(state.photos.map((photo) => [photo.pose, photo]));
  /*
   * Wanted first, then anything shot that nobody asked for. The extras are SHOWN
   * rather than filtered out: a salon that photographed an angle off the list has
   * not made a mistake, and a screen that hid it would look like it had lost the
   * file.
   */
  /*
   * FRONT IS DELIBERATELY NOT A SLOT HERE.
   *
   * It has the large preview, the primary upload button and its own cut-out
   * control above this component, because it is the look-book's face and the one
   * picture the studio recolours. A second way to do the same thing six inches
   * below the first is how somebody uploads a front view twice and wonders which
   * one won.
   *
   * So this is the OTHER angles — which is also the honest framing, since the
   * front is the one nobody needs reminding about.
   */
  const slots: HairPose[] = [...state.wanted, ...state.extra.filter((pose) => !state.wanted.includes(pose))].filter(
    (pose) => pose !== 'FRONT',
  );
  const wanted = state.wanted.filter((pose) => pose !== 'FRONT');
  const have = slots.filter((pose) => byPose.has(pose)).length;
  const masked = state.photos.filter((photo) => photo.maskUrl && photo.pose !== 'FRONT').length;

  /*
   * Some cuts genuinely do not need another angle, and the server says so by
   * returning only FRONT. Rendering an empty grid with a heading would read as a
   * broken component rather than as "nothing to do here".
   */
  if (slots.length === 0) return null;

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const pose = targetRef.current;
          if (file && pose) void upload(pose, file);
          event.target.value = '';
          targetRef.current = null;
        }}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xs font-medium text-ink-muted">
          Other angles · {have} of {wanted.length}
        </p>
        {masked > 0 ? <span className="text-2xs text-ink-subtle">{masked} ready to recolour</span> : null}
      </div>

      {/*
        THE SENTENCE THAT MAKES ANYBODY SHOOT THE SECOND ANGLE.

        Shown only while the back is missing, because once it is there this is a
        lecture. It names the consequence rather than the rule: a salon does not
        photograph the back because it has been told to, it photographs it to stop
        the conversation that happens in the mirror afterwards.
      */}
      {state.missing.includes('BACK') ? (
        <p className="rounded-lg bg-amber-50 p-2.5 text-2xs leading-relaxed text-amber-900">
          No back view yet. The shape of this cut is mostly at the back — it is the one thing a customer cannot see on
          herself, and the first thing she sees in the mirror afterwards.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slots.map((pose) => {
          const photo = byPose.get(pose);
          const working = busy === pose;

          return (
            <div
              key={pose}
              className={cn(
                'overflow-hidden rounded-lg border bg-white',
                photo ? 'border-stone-200' : 'border-dashed border-stone-300',
              )}
            >
              <div className="relative aspect-square bg-stone-100">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => {
                      targetRef.current = pose;
                      fileRef.current?.click();
                    }}
                    // The empty slot IS the button, which is the whole point of a
                    // checklist: the gap and the way to fill it are one target.
                    className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-ink-subtle transition-colors hover:bg-stone-50 hover:text-ink"
                  >
                    {working ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" aria-hidden />}
                    <span className="text-2xs font-medium">{POSE_LABELS[pose]}</span>
                  </button>
                )}

                {photo?.maskUrl ? (
                  <span
                    title="The hair is cut out of this one, so the studio can recolour it"
                    className="absolute right-1 top-1 rounded-full bg-brand-600 p-0.5 text-white"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                ) : null}
                {photo && !photo.isUploaded ? (
                  <span className="absolute left-1 top-1 rounded-full bg-stone-900/70 px-1.5 py-0.5 text-2xs text-white">
                    Drawn
                  </span>
                ) : null}
              </div>

              <div className="space-y-1 p-2">
                <p className="text-2xs font-medium text-ink">{POSE_LABELS[pose]}</p>
                {/*
                  WHAT THE ANGLE IS FOR, on the empty ones only.

                  It is an argument for taking the photograph, so it stops being
                  needed the moment the photograph exists — and leaving it there
                  would push the controls below the fold on a tablet.
                */}
                {!photo ? (
                  <p className="text-2xs leading-snug text-ink-subtle">{POSE_WHY[pose]}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMasking(pose)}
                      className={cn(
                        'inline-flex items-center gap-1 text-2xs underline-offset-2 hover:underline',
                        photo.maskUrl ? 'text-ink-subtle' : 'text-brand-700',
                      )}
                    >
                      <Scissors className="h-3 w-3" aria-hidden />
                      {photo.maskUrl ? 'Re-cut' : 'Cut out'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        targetRef.current = pose;
                        fileRef.current?.click();
                      }}
                      disabled={working}
                      className="inline-flex items-center gap-1 text-2xs text-ink-subtle underline-offset-2 hover:underline"
                    >
                      <Camera className="h-3 w-3" aria-hidden />
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(pose)}
                      disabled={working}
                      className="ml-auto text-ink-subtle hover:text-rose-700"
                      title={`Remove the ${POSE_LABELS[pose].toLowerCase()} view`}
                    >
                      {working ? <Spinner className="h-3 w-3" /> : <Trash2 className="h-3 w-3" aria-hidden />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/*
        The angles nobody asked for, named rather than silently mixed in — so a
        salon can see that the list above is a recommendation and not a limit.
      */}
      {state.extra.length ? (
        <p className="text-2xs text-ink-subtle">
          Also shot: {state.extra.map((pose) => POSE_LABELS[pose]).join(', ')}. Not needed for this cut, kept anyway.
        </p>
      ) : null}

      <p className="text-2xs leading-relaxed text-ink-subtle">
        <Badge tone="neutral">Per angle</Badge> Each one needs its own cut-out: hair sits in completely different places
        from the side than from the front, so one mask across angles would paint colour onto a cheek.
      </p>

      {masking && byPose.get(masking) ? (
        <MaskEditor
          open
          onClose={() => setMasking(null)}
          catalogId={catalogId}
          pose={masking}
          photoUrl={byPose.get(masking)!.imageUrl}
          existingMaskUrl={byPose.get(masking)!.maskUrl}
          onSaved={() => {
            void load();
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
