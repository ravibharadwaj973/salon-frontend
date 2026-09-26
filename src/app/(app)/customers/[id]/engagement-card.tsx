import { Eye, MousePointerClick } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { fromNow, dateTime } from '@/lib/format';

export interface CustomerEngagement {
  interests: {
    kind: string;
    refId: string;
    label: string;
    views: number;
    lastViewedAt: string;
    /** Recent enough to act on. See INTEREST_STALE_DAYS on the backend. */
    fresh: boolean;
  }[];
  activity: {
    sessionId: string | null;
    startedAt: string;
    endedAt: string;
    events: { event: string; path: string; label: string | null; at: string }[];
  }[];
}

const EVENT_LABEL: Record<string, string> = {
  page_view: 'Opened',
  gallery_filter: 'Filtered the gallery to',
  service_view: 'Looked at',
  booking_started: 'Started booking',
  booked: 'Booked',
  feedback_left: 'Left feedback',
};

/**
 * WHAT THIS CUSTOMER HAS BEEN LOOKING AT.
 *
 * ── Two things this card is careful not to become ────────────────────────
 *
 * IT IS NOT A PREDICTION. "Looked at Hair Spa, 3 times, last on Tuesday" is a
 * fact. "Interested in Hair Spa — likely to book" is a claim the app has no
 * standing to make, and once a screen starts making it, a salon starts acting
 * on it. So the wording stays at what happened.
 *
 * IT IS NOT A SURVEILLANCE FEED. Only somebody who arrived by tapping a link
 * the salon sent them appears here at all, the card says so in as many words,
 * and there is nothing about their device, their location or anything they did
 * anywhere else. If this card ever needs a longer explanation than the line at
 * the bottom, something has been added that should not have been.
 *
 * Stale interests are shown greyed rather than dropped. "She was looking at
 * hair spa, but that was in March" is worth knowing, and a list that silently
 * hides rows is one somebody stops believing.
 */
export function EngagementCard({ data }: { data: CustomerEngagement }) {
  if (data.interests.length === 0 && data.activity.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="What they have been looking at"
        subtitle="From links in your own messages — nothing else is tracked."
      />
      <CardBody className="space-y-5">
        {data.interests.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Pages they opened</p>
            <ul className="flex flex-wrap gap-1.5">
              {data.interests.map((interest) => (
                <li
                  key={`${interest.kind}:${interest.refId}`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${
                    interest.fresh
                      ? 'bg-brand-50 text-brand-800 ring-brand-200'
                      : 'bg-stone-50 text-ink-subtle ring-stone-200'
                  }`}
                  title={`Last opened ${dateTime(interest.lastViewedAt)}`}
                >
                  <Eye className="h-3 w-3" aria-hidden />
                  {interest.label}
                  {interest.views > 1 ? <span className="tnum font-medium">×{interest.views}</span> : null}
                  <span className={interest.fresh ? 'text-brand-600' : ''}>· {fromNow(interest.lastViewedAt)}</span>
                </li>
              ))}
            </ul>
            {data.interests.some((i) => !i.fresh) ? (
              <p className="mt-1.5 text-2xs text-ink-subtle">Greyed out means too long ago to act on.</p>
            ) : null}
          </div>
        ) : null}

        {data.activity.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Recent visits to your website</p>
            <ul className="space-y-3">
              {data.activity.slice(0, 5).map((session, index) => (
                <li key={session.sessionId ?? index} className="rounded-lg bg-stone-50 p-3">
                  <p className="text-2xs text-ink-subtle">{fromNow(session.startedAt)}</p>
                  {/* The journey forwards, which is the only order it reads in:
                      opened the gallery → looked at hair spa → started booking
                      → stopped is a story, and the same rows shuffled are not. */}
                  <ol className="mt-1 space-y-0.5">
                    {session.events.map((event, position) => (
                      <li key={`${event.at}-${position}`} className="flex items-baseline gap-1.5 text-xs text-ink">
                        <MousePointerClick className="mt-0.5 h-3 w-3 shrink-0 text-ink-subtle" aria-hidden />
                        <span>
                          {EVENT_LABEL[event.event] ?? event.event.replace(/_/g, ' ')}
                          {event.label ? <span className="font-medium"> {event.label}</span> : null}
                          {!event.label && event.event === 'page_view' ? (
                            <span className="text-ink-muted"> {event.path}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* THE LINE THAT HAS TO BE HERE.
            A salon owner reading this card should know exactly how much it can
            see, without having to ask — and the honest answer is "less than you
            might assume", which is worth saying out loud. */}
        <p className="border-t border-stone-100 pt-3 text-2xs leading-relaxed text-ink-subtle">
          Recorded only when they tap a link in a message you sent them, and only for a month after that message. No
          cookies, no device details, nothing about anywhere else they go. Use it to make your next message relevant —
          not as a reason to send one now.
        </p>
      </CardBody>
    </Card>
  );
}
