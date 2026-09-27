'use client';

import { useState } from 'react';
import { Heart, Lock, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';

interface Result {
  thankYou: boolean;
  nextStep: 'GOOGLE_REVIEW' | 'APOLOGY';
  googleReviewUrl: string | null;
  message: string;
}

const LABELS = ['', 'Poor', 'Not great', 'Fine', 'Good', 'Loved it'];

/**
 * WHAT THE RATING CHANGES, AND WHAT IT NO LONGER CHANGES.
 *
 * It changes what this page SAYS. Three stars or fewer and the extra questions
 * appear — who did the service, how long the wait was — under a line promising
 * the answer goes to the owner rather than anywhere public, because those are
 * the two things a salon can act on and somebody will only type them if they
 * believe that.
 *
 * It no longer changes whether the customer may review the salon publicly.
 * That used to be the whole design: 4s and 5s were handed the Google link and
 * everybody else was quietly steered away from it. Google prohibits exactly
 * that — selectively soliciting positive reviews — so the link is offered to
 * everyone now and the apology comes first for the people who need one.
 *
 * The link stays a real anchor the customer taps themselves. Opening a window
 * from code is what every phone browser blocks; the tap is recorded on the way
 * past instead.
 */
export function FeedbackForm({
  appointmentId,
  customerName,
  services,
  staffName,
  alreadySubmitted,
}: {
  appointmentId: string;
  customerName: string;
  /**
   * The services on THIS visit, with their ids.
   *
   * The customer is never asked to pick what they had — the appointment
   * already knows, and a form that opens with "which services did you
   * receive?" is asking somebody to do the salon's data entry.
   */
  services: { id: string; name: string }[];
  staffName: string | null;
  alreadySubmitted: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [staffRating, setStaffRating] = useState(0);
  const [waitRating, setWaitRating] = useState(0);
  /** serviceId -> stars. Absent means not answered, which is allowed. */
  const [serviceRatings, setServiceRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tapped, setTapped] = useState(false);

  if (alreadySubmitted && !result) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-card">
        <Heart className="mx-auto mb-3 h-6 w-6 text-brand-500" />
        <p className="text-sm font-medium text-ink">You have already told us — thank you</p>
        <p className="mt-1 text-xs text-ink-muted">We only ask once per visit.</p>
      </div>
    );
  }

  if (result) {
    const happy = result.nextStep === 'GOOGLE_REVIEW';
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-card">
        <span
          className={cn(
            'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full',
            happy ? 'bg-emerald-100' : 'bg-amber-100',
          )}
        >
          <Heart className={cn('h-5 w-5', happy ? 'text-emerald-600' : 'text-amber-600')} />
        </span>
        <p className="text-sm font-medium text-ink">{result.message}</p>

        {/**
          * The apology comes first for an unhappy customer, and the link comes
          * after it — not instead of it.
          *
          * Withholding the link from the people who rated badly is review
          * gating, which Google prohibits outright. So the difference between
          * a good and a bad rating is what this page SAYS, never whether the
          * customer is allowed to say it publicly.
          */}
        {!happy ? (
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            This has gone straight to the owner, not onto any public page. Someone will be in touch. Thank you for
            saying something — it is the only way things improve.
          </p>
        ) : null}

        {result.googleReviewUrl ? (
          <>
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              {happy
                ? 'A public review takes about thirty seconds and is how most new customers find the salon.'
                : /* No pleading, and no suggestion of what to write. They were
                     asked because everybody is asked, and that is the whole
                     reason it can be offered here at all. */
                  'You are welcome to leave a public review as well. We ask everyone, whatever they told us.'}
            </p>
            <a
              href={result.googleReviewUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                setTapped(true);
                // Fire and forget — awaiting it would turn the tap into a
                // pop-up the browser blocks.
                void apiPost(`public/feedback/${appointmentId}/google`, {}).catch(() => {});
              }}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <Star className="h-4 w-4 fill-white" />
              Write a Google review
            </a>
            {tapped ? <p className="mt-2 text-xs text-ink-subtle">Thank you — that really does help.</p> : null}
          </>
        ) : (
          /* No link configured for this branch yet. Says the same thing to
             everybody, because by this point the rating is irrelevant to what
             happens next. */
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            If you have a moment, a public review helps other people find the salon. The team will send you a link.
          </p>
        )}
      </div>
    );
  }

  async function submit() {
    if (rating === 0) {
      setError('Please pick a rating first.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      setResult(
        await apiPost<Result>(`public/feedback/${appointmentId}`, {
          rating,
          comment: comment.trim() || undefined,
          staffRating: staffRating || undefined,
          waitRating: waitRating || undefined,
          /**
           * Only the ones actually answered. A zero here is "not asked about",
           * not "nought out of five", and sending it would put a score in the
           * service's average that nobody gave.
           */
          services: services
            .filter((service) => (serviceRatings[service.id] ?? 0) > 0)
            .map((service) => ({ serviceId: service.id, rating: serviceRatings[service.id]! })),
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const shown = hover || rating;
  const unhappy = rating > 0 && rating <= 3;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
      <h2 className="text-center text-base font-semibold text-ink">How was it, {customerName}?</h2>
      {services.length > 0 ? (
        <p className="mt-1 text-center text-xs text-ink-muted">
          {services.map((service) => service.name).join(', ')}
          {staffName ? ` with ${staffName}` : ''}
        </p>
      ) : null}

      <div className="my-6 flex justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            onMouseEnter={() => setHover(value)}
            className="p-1 transition-transform hover:scale-110"
            aria-label={`${value} out of 5`}
          >
            <Star
              className={cn('h-9 w-9 transition-colors', value <= shown ? 'fill-amber-400 text-amber-400' : 'text-stone-300')}
            />
          </button>
        ))}
      </div>

      <p className="mb-4 h-4 text-center text-xs font-medium text-ink-muted">{LABELS[shown] ?? ''}</p>

      {/**
        * A ROW PER SERVICE, ONCE THEY HAVE ANSWERED THE FIRST QUESTION.
        *
        * Hidden until then, because five sets of stars on a page somebody just
        * opened reads as a survey, and a survey gets closed. The visit already
        * knows which services these are — nobody is asked to pick them.
        *
        * Optional, deliberately. Blocking the button until every service is
        * rated trades a complete response for a tidy one: the overall rating is
        * the answer that must not be lost, and two services rated out of three
        * is still two more than the single number this form used to collect.
        */}
      {rating > 0 && services.length > 0 ? (
        <div className="mb-4 space-y-3 rounded-xl border border-stone-200 p-3.5">
          <p className="text-xs font-medium text-ink">And each one on its own?</p>
          {services.map((service) => (
            <MiniStars
              key={service.id}
              label={service.name}
              value={serviceRatings[service.id] ?? 0}
              onChange={(value) =>
                setServiceRatings((current) => ({ ...current, [service.id]: value }))
              }
            />
          ))}
        </div>
      ) : null}

      {unhappy ? (
        <div className="mb-4 space-y-3 rounded-xl bg-stone-50 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
            <Lock className="h-3 w-3 text-ink-muted" />
            This stays between you and the owner
          </p>
          <MiniStars label="The person who did your service" value={staffRating} onChange={setStaffRating} />
          <MiniStars label="How long you waited" value={waitRating} onChange={setWaitRating} />
        </div>
      ) : null}

      {rating > 0 ? (
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          placeholder={
            rating >= 4 ? 'What did you like most? (optional)' : 'What went wrong? The owner reads these personally.'
          }
        />
      ) : null}

      {error ? <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

      <Button onClick={submit} loading={saving} size="lg" className="mt-4 w-full" disabled={rating === 0}>
        {unhappy ? 'Send privately to the owner' : 'Send feedback'}
      </Button>
    </div>
  );
}

function MiniStars({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star === value ? 0 : star)}
            aria-label={`${label}: ${star} out of 5`}
            className="p-0.5"
          >
            <Star className={cn('h-4 w-4', star <= value ? 'fill-amber-400 text-amber-400' : 'text-stone-300')} />
          </button>
        ))}
      </span>
    </div>
  );
}
