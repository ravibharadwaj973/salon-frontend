'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Palette, RefreshCw, UserCheck, UserPlus } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge, Spinner } from '@/components/ui/display';
import { Modal, useToast } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';

/**
 * THIS STYLE, ON THIS CUSTOMER. THE REASON THE IMAGE MODEL IS HERE AT ALL.
 *
 * ── What this screen is for, stated plainly ───────────────────────────────
 *
 * The studio answers "what colour, how dense, how glossy" by recolouring a
 * photograph in the browser, for free, as fast as a slider moves. What it cannot
 * answer is the question every customer actually asks — what will this look like
 * ON ME — because the photograph it is recolouring is somebody else's head.
 *
 * That is the question an image model is worth paying for, and it is the only
 * one. Not filling in the salon's menu: a photograph of the salon's own work does
 * that better and for nothing, which is why the library screen leads with
 * uploading and the drawn stand-in there is capped to a quarter of the day. The
 * rest of the allowance is held for this screen, where there is somebody in the
 * chair waiting to see herself.
 *
 * So the primary button here is HER OWN PHOTO, named after her, and the virtual
 * model is the fallback for a consultation where no photograph exists.
 *
 * ── Three things worth being honest about on screen ───────────────────────
 *
 *   It costs money, per picture, so the salon's remaining allowance is shown
 *   BEFORE the button rather than discovered by being refused mid-consultation.
 *
 *   It takes tens of seconds, so nothing here waits on a response. The request
 *   returns a row and this polls it, which means a stylist can close the modal,
 *   carry on designing, and come back to a finished picture.
 *
 *   A VIRTUAL MODEL IS NOT THE CUSTOMER, and her own photo is a GUESS about how
 *   the hair falls. Two different sentences for two different pictures, said
 *   under the picture every time — because the picture is what gets turned
 *   towards her, and the worst outcome for this feature is a customer
 *   disappointed by her own reflection afterwards.
 *
 * ── Why a modal rather than a panel beside the studio ─────────────────────
 *
 * Both are pictures of a head and they compete for exactly the same attention.
 * Side by side on a salon tablet, each gets half a screen and neither is worth
 * looking at — and this one is the one somebody leans in to study.
 */

type Status = 'PENDING' | 'SUBMITTED' | 'READY' | 'FAILED' | 'REFUSED';
type Kind = 'MODEL_PORTRAIT' | 'STYLE_PREVIEW' | 'RECOLOUR' | 'CUSTOMER_PREVIEW';

interface Generation {
  id: string;
  kind: Kind;
  status: Status;
  prompt: string;
  seed: number | null;
  imageUrl: string | null;
  error: string | null;
  createdAt: string;
  readyAt: string | null;
  /** Set when the source was the customer's own photograph. */
  analysisId: string | null;
}

interface GenerationStatus {
  configured: boolean;
  verified: boolean | null;
  model: string;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number | null;
  /** The share the look-book may spend on itself. Not this screen's business. */
  libraryLimit: number;
  libraryUsedToday: number;
  libraryRemainingToday: number | null;
}

const WORKING: Status[] = ['PENDING', 'SUBMITTED'];
const isWorking = (generation: Generation | null) => !!generation && WORKING.includes(generation.status);

/**
 * How often to ask, and when to stop asking.
 *
 * Three seconds against a job that polls the provider every four: asking faster
 * than the server learns anything is pure noise. The ceiling is two minutes,
 * which is well past a normal generation — and when it is reached the picture is
 * not lost, it is still being worked on by a job that outlives this screen, so
 * the wording says come back rather than try again.
 */
const POLL_MS = 3000;
const POLL_CEILING = 40;

const KIND_LABEL: Record<Kind, string> = {
  MODEL_PORTRAIT: 'New model',
  STYLE_PREVIEW: 'This design',
  RECOLOUR: 'Colour only',
  CUSTOMER_PREVIEW: 'On her own photo',
};

export function PhotoPreview({
  open,
  onClose,
  designId,
  designName,
  customerId,
  customerName,
  dirty,
}: {
  open: boolean;
  onClose: () => void;
  /** Null when the look has never been saved. There is nothing to draw from. */
  designId: string | null;
  designName: string;
  /** Needed to find her consented photo, for the preview on her own face. */
  customerId: string | null;
  /**
   * Her name, for the button that puts the style on her.
   *
   * Worth the extra prop: "Put it on Priya's photo" is the sentence that explains
   * the whole feature without a paragraph next to it, and "Preview on her" is a
   * control somebody has to think about before pressing.
   */
  customerName?: string | null;
  /**
   * Whether the design has been changed since it was last saved.
   *
   * Passed in rather than guessed, because it decides whether two of the three
   * buttons can be trusted: an edit renders THE SAVED DESIGN, so pressing it
   * with unsaved changes spends money on the previous version of the look and
   * the stylist has no way to tell from the picture.
   */
  dirty: boolean;
}) {
  const toast = useToast();

  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [history, setHistory] = useState<Generation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [polls, setPolls] = useState(0);
  /**
   * Her own photograph, if there is one and she agreed to it being kept.
   *
   * Looked up rather than passed in, because consent can be withdrawn between
   * opening the studio and opening this modal — and a button that draws on her
   * face must not outlive the permission to do so.
   */
  const [ownPhoto, setOwnPhoto] = useState<{ id: string; imageUrl: string } | null>(null);
  /**
   * WHAT SHE ASKED FOR THAT NO SLIDER COVERS.
   *
   * A menu entry plus the configurator describe a cut. A consultation is that cut
   * plus one sentence — "keep the front long enough to tuck behind my ear",
   * "shorter at the back than the picture" — and the list of such sentences is the
   * whole of hairdressing, so it is a text box rather than another control.
   *
   * Cleared after each request on purpose: it belongs to the picture that was just
   * asked for, and a sentence left in the box silently applying to the next one is
   * how a stylist ends up with a picture they did not ask for.
   */
  const [requirement, setRequirement] = useState('');

  const selected = history.find((item) => item.id === selectedId) ?? history[0] ?? null;

  const load = useCallback(async () => {
    if (!designId) return;
    setLoading(true);
    try {
      const [state, list] = await Promise.all([
        apiGet<GenerationStatus>('hair-studio/generations/status'),
        apiGet<Generation[]>('hair-studio/generations', { query: { designId, limit: '24' } }),
      ]);
      setStatus(state);
      setHistory(list);

      if (customerId) {
        const reading = await apiGet<{ id: string; imageUrl: string | null } | null>(
          `hair-studio/analyses/customer/${customerId}`,
        ).catch(() => null);
        setOwnPhoto(reading?.imageUrl ? { id: reading.id, imageUrl: reading.imageUrl } : null);
      } else {
        setOwnPhoto(null);
      }
      /*
       * Land on something worth looking at. The newest finished picture beats the
       * newest row: opening on a FAILED attempt from yesterday hides the good
       * picture underneath it.
       */
      setSelectedId((current) => current ?? (list.find((item) => item.status === 'READY') ?? list[0])?.id ?? null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [designId, customerId, toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  /**
   * POLL ONLY WHAT IS ACTUALLY IN FLIGHT.
   *
   * Keyed on the selected row's id and status, so the interval is created when a
   * picture starts and torn down the moment it finishes — no timer surviving a
   * closed modal, and no second timer stacking on top of the first when the
   * person clicks between pictures.
   */
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!open || !selected || !isWorking(selected) || polls >= POLL_CEILING) return;

    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const fresh = await apiGet<Generation>(`hair-studio/generations/${selected.id}`);
          setPolls((count) => count + 1);
          setHistory((list) => list.map((item) => (item.id === fresh.id ? fresh : item)));
          if (fresh.status === 'READY') {
            // The allowance moved, and the number on screen should not be stale
            // the moment the person considers a second picture.
            void apiGet<GenerationStatus>('hair-studio/generations/status').then(setStatus, () => {});
          }
        } catch {
          // A single failed poll is a bad second, not a failed picture: the job
          // on the server is unaffected. Counted so a broken connection still
          // reaches the ceiling rather than asking for ever.
          setPolls((count) => count + 1);
        }
      })();
    }, POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [open, selected, selected?.status, polls]);

  async function request(kind: Kind) {
    if (!designId) return;
    setRequesting(true);
    try {
      const body: Record<string, unknown> = { kind, designId };

      /*
       * Not sent with a new virtual model: there is nobody in the room to have
       * asked for anything, and the API drops it there anyway. Sending it would
       * make this look like a free-text image generator, which it is not.
       */
      if (kind !== 'MODEL_PORTRAIT' && requirement.trim()) {
        body.requirement = requirement.trim().slice(0, 200);
      }

      if (kind === 'CUSTOMER_PREVIEW') {
        if (!ownPhoto) {
          toast.error('No consented photo on her record yet — add one under “What would suit her”.');
          return;
        }
        body.sourceAnalysisId = ownPhoto.id;
      } else if (kind !== 'MODEL_PORTRAIT') {
        const source = history.find((item) => item.status === 'READY' && item.imageUrl);
        if (!source) {
          toast.error('Generate a model first — there is no picture to change yet.');
          return;
        }
        body.sourceGenerationId = selected?.status === 'READY' ? selected.id : source.id;
      }

      const created = await apiPost<Generation>('hair-studio/generations', body);
      setHistory((list) => [created, ...list]);
      setSelectedId(created.id);
      setPolls(0);
      setRequirement('');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRequesting(false);
    }
  }

  const exhausted = status?.remainingToday === 0;
  const canEdit = !!selected && selected.status === 'READY' && !dirty;
  const firstName = customerName?.trim().split(/\s+/)[0] ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={firstName ? `This style on ${firstName}` : 'Photographic preview'}
      description={designName ? `From the saved look “${designName}”` : undefined}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {status ? (
            <span className="mr-auto text-2xs text-ink-subtle">
              {status.dailyLimit === 0
                ? `${status.usedToday} today`
                : `${status.usedToday} of ${status.dailyLimit} today`}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => request('RECOLOUR')}
            disabled={!canEdit || requesting || exhausted}
            title={
              dirty
                ? 'Save your changes first — the picture is built from the saved look'
                : 'Keeps the face and the cut, changes the colour'
            }
          >
            <Palette className="h-3.5 w-3.5" />
            Colour only
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => request('STYLE_PREVIEW')}
            disabled={!canEdit || requesting || exhausted}
            title={
              dirty
                ? 'Save your changes first — the picture is built from the saved look'
                : 'Keeps the same face, applies this design to it'
            }
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Same model
          </Button>
          {/*
            THE VIRTUAL MODEL IS THE FALLBACK NOW, NOT THE HEADLINE.

            It was the primary button, which quietly said the point of this screen
            was generating stock photographs of strangers. The point is the cut on
            the customer; a model is what you show when there is no photograph of
            her — a walk-in, somebody who would rather not be photographed.
          */}
          <Button
            size="sm"
            variant={ownPhoto ? 'secondary' : 'primary'}
            onClick={() => request('MODEL_PORTRAIT')}
            loading={requesting && !ownPhoto}
            disabled={!designId || exhausted || !status?.configured}
            title="A plausible head wearing this cut — nobody real"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {ownPhoto ? 'A model instead' : 'New model'}
          </Button>
          {/*
            THE ONE PEOPLE ACTUALLY WANT, AND THE ONE THAT CARRIES AN OBLIGATION.

            Primary, named after her, and last — where the eye lands on a salon
            tablet. Shown only when there is a photograph on her record that she
            agreed to: not greyed out with a tooltip, because an offer to put a
            customer's face through an image model should not appear at all until
            the permission exists. The API refuses it independently, and the line
            inside the modal says how to get there when it is missing.
          */}
          {ownPhoto ? (
            <Button
              size="sm"
              onClick={() => request('CUSTOMER_PREVIEW')}
              loading={requesting}
              disabled={requesting || exhausted || dirty}
              title={
                dirty
                  ? 'Save your changes first — the picture is built from the saved look'
                  : 'Her own photo, with this hair on it. Face, clothes and background unchanged.'
              }
            >
              <UserCheck className="h-3.5 w-3.5" />
              {firstName ? `Put it on ${firstName}’s photo` : 'Put it on her photo'}
            </Button>
          ) : null}
        </div>
      }
    >
      {!designId ? (
        <Blank>
          Save the look first. Every picture is built from a saved design, so that what the customer is shown is
          something your salon can actually cut.
        </Blank>
      ) : loading && !history.length ? (
        <div className="flex h-56 items-center justify-center">
          <Spinner />
        </div>
      ) : !status?.configured ? (
        /*
         * An honest empty state rather than a disabled button with no reason.
         * The person reading this is usually the owner, and the fix is an env
         * variable on the server — nothing they can do from this screen, and
         * nothing the studio's own recolouring needs.
         */
        <Blank>
          Photographic previews are not switched on for this server yet. The studio itself works without them — it
          recolours the photograph in your browser, which is free and needs nothing set up.
        </Blank>
      ) : (
        <div className="space-y-3">
          {dirty ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-2xs text-amber-800">
              You have changed the design since it was saved. A new picture is drawn from the <em>saved</em> look, so
              save again before using it.
            </p>
          ) : null}

          {/*
            THE MAIN THING, MISSING, EXPLAINED — rather than silently absent.

            The button that puts the style on her own photograph only exists once
            there is a consented photograph to put it on. Before this line, that
            meant the headline feature of the screen was invisible with nothing
            saying why, and the only visible option was a picture of a stranger.
            This says what is missing and where it is added, and deliberately
            offers no shortcut: the photograph and the consent are recorded
            together, in the reading, by somebody talking to her.
          */}
          {!ownPhoto ? (
            <p className="rounded-lg border border-dashed border-stone-300 px-3 py-2 text-2xs leading-relaxed text-ink-muted">
              {firstName
                ? `To show this on ${firstName} herself, her photo needs to be on her record — add it under “What would suit ${firstName}?”, with her agreement. Until then this draws a virtual model wearing the cut.`
                : 'To show this on the customer herself, pick a customer and add her photo under “What would suit her?”, with her agreement. Until then this draws a virtual model wearing the cut.'}
            </p>
          ) : null}

          <Frame generation={selected} polls={polls} />

          {/*
            ONE SENTENCE OF WHAT SHE ASKED FOR.

            Under the picture rather than above it, because it is usually typed
            after looking at one: "that, but shorter at the back". It applies to
            the hair only — the API scopes it, and the placeholder says so by
            example rather than by warning.
          */}
          <div className="space-y-1">
            <label htmlFor="hair-requirement" className="block text-2xs font-medium text-ink-muted">
              Anything she asked for that the sliders do not cover
            </label>
            <input
              id="hair-requirement"
              value={requirement}
              maxLength={200}
              onChange={(event) => setRequirement(event.target.value)}
              placeholder="e.g. keep the front long enough to tuck behind her ear"
              className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-subtle focus:border-brand-400 focus:outline-none"
            />
            <p className="text-2xs text-ink-subtle">
              Applied to the hair only, on the next picture. Her face, clothes and background are kept as they are.
            </p>
          </div>

          {history.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setPolls(0);
                  }}
                  aria-pressed={item.id === selected?.id}
                  title={`${KIND_LABEL[item.kind]} · ${new Date(item.createdAt).toLocaleString()}`}
                  className={cn(
                    'relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-stone-100',
                    item.id === selected?.id ? 'border-brand-500 ring-1 ring-brand-300' : 'border-stone-200',
                  )}
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-2xs text-ink-subtle">
                      {item.status === 'REFUSED' ? 'refused' : item.status === 'FAILED' ? 'failed' : '…'}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : null}

          {/*
            The prompt, available but folded away.

            A salon is entitled to know what was said on its behalf, and a
            stylist reading it is how the wording gets better. It is not what
            anybody came here to look at, so it does not take up the room.
          */}
          {selected?.prompt ? (
            <details className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <summary className="cursor-pointer text-2xs font-medium text-ink-muted">What we asked for</summary>
              <p className="mt-2 text-2xs leading-relaxed text-ink-subtle">{selected.prompt}</p>
            </details>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function Blank({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-56 items-center justify-center px-6 text-center">
      <p className="max-w-sm text-xs leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

/** The picture, or whatever is standing in for it. */
function Frame({ generation, polls }: { generation: Generation | null; polls: number }) {
  if (!generation) {
    return (
      <Blank>
        Nothing drawn for this look yet. If her photo is on her record, the button on the right puts this hair on it —
        her face, clothes and background untouched. Otherwise a virtual model wears the cut: a plausible head, not your
        customer&rsquo;s face.
      </Blank>
    );
  }

  if (generation.status === 'READY' && generation.imageUrl) {
    return (
      <figure className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={generation.imageUrl}
            alt="A virtual model wearing this design"
            className="mx-auto max-h-[52vh] w-auto"
          />
        </div>
        <figcaption className="flex flex-wrap items-center gap-2 text-2xs text-ink-subtle">
          <Badge tone={generation.kind === 'CUSTOMER_PREVIEW' ? 'info' : 'neutral'}>
            {KIND_LABEL[generation.kind]}
          </Badge>
          {/*
            SAID EVERY TIME, NOT ONCE IN THE ONBOARDING.

            The caption is attached to the picture because the picture is what
            gets turned towards a customer, and this is the sentence that stops
            her believing she has been shown her own face.
          */}
          {/*
            TWO DIFFERENT SENTENCES, because the two pictures make different
            claims. A virtual model has to be disclaimed or the customer believes
            she has been shown her own face. Her own photograph has the opposite
            problem: it looks authoritative, and the thing worth saying is that an
            image model has GUESSED how the hair falls.
          */}
          <span>
            {generation.kind === 'CUSTOMER_PREVIEW'
              ? 'Her own photo, hair replaced by an image model — a good likeness of the cut, not a promise about it.'
              : 'A virtual model, not your customer — it shows the cut and the colour, not her face.'}
          </span>
        </figcaption>
      </figure>
    );
  }

  if (generation.status === 'REFUSED') {
    return (
      <Blank>
        The image provider would not draw this one. That is its own safety filter rather than anything you did —
        a different colour or a less extreme description usually goes through.
      </Blank>
    );
  }

  if (generation.status === 'FAILED') {
    return <Blank>{generation.error ?? 'That picture could not be drawn. Nothing was charged to your allowance twice — try again.'}</Blank>;
  }

  return (
    <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50">
      <Spinner />
      <p className="max-w-xs text-center text-2xs leading-relaxed text-ink-muted">
        {polls >= POLL_CEILING
          ? 'Still drawing. It carries on on the server, so you can close this and come back to it.'
          : 'Drawing — usually under a minute. You can keep designing; it finishes on the server either way.'}
      </p>
    </div>
  );
}
