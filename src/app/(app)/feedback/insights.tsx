import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { cn } from '@/lib/cn';

/**
 * WHAT CUSTOMERS KEEP SAYING.
 *
 * Every analysed piece of feedback has been classified into topics with a
 * sentiment each, and stored, since the day that feature shipped. Nothing ever
 * read it back — not one screen. A salon has been told its average is 4.6 and
 * never told that eleven people mentioned waiting.
 *
 * Which is the difference between a score and something to act on. An average
 * moves slowly and says nothing about what to change on Monday; "waiting time,
 * 11" is a decision about Saturday staffing.
 *
 * Both columns are shown even when one is empty, because the shape of the panel
 * is itself information: a salon with praise and no complaints should see an
 * empty complaints column rather than a panel that quietly becomes a list of
 * compliments.
 */

export interface ReviewInsights {
  praised: { topic: string; count: number }[];
  criticised: { topic: string; count: number }[];
  analysed: number;
  pending: number;
}

/** The enum, as a salon would say it. */
const TOPIC_LABELS: Record<string, string> = {
  SERVICE: 'The service itself',
  STAFF: 'Staff',
  CLEANLINESS: 'Cleanliness',
  WAITING_TIME: 'Waiting time',
  PRICE: 'Price',
  VALUE: 'Value for money',
  AMBIENCE: 'Atmosphere',
  BOOKING: 'Booking',
  PRODUCT_QUALITY: 'Products used',
  RESULT: 'How it turned out',
  CUSTOMER_SERVICE: 'Looking after people',
};

function label(topic: string): string {
  return TOPIC_LABELS[topic] ?? topic.toLowerCase().replace(/_/g, ' ');
}

export function ReviewInsightsPanel({ insights }: { insights: ReviewInsights | null }) {
  if (!insights || insights.analysed === 0) {
    return (
      <Card>
        <CardHeader title="What customers keep saying" />
        <CardBody>
          <p className="text-xs leading-relaxed text-ink-muted">
            Nothing to count yet. These are built from the comments customers leave, so they appear once a
            few people have written something alongside their rating.
          </p>
        </CardBody>
      </Card>
    );
  }

  /**
   * One scale across BOTH columns, not one per column.
   *
   * Scaling each side to its own maximum would draw a single complaint as a
   * full-width bar beside eighty compliments, which is the opposite of what the
   * panel is for.
   */
  const most = Math.max(
    1,
    ...insights.praised.map((row) => row.count),
    ...insights.criticised.map((row) => row.count),
  );

  return (
    <Card>
      <CardHeader
        title="What customers keep saying"
        subtitle={
          insights.pending > 0
            ? `From ${insights.analysed} read so far · ${insights.pending} still to be read`
            : `From ${insights.analysed} comments`
        }
      />
      <CardBody>
        <div className="grid gap-6 sm:grid-cols-2">
          <TopicColumn
            title="Liked"
            icon={<ThumbsUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
            rows={insights.praised}
            most={most}
            tone="good"
            empty="Nobody has praised anything in particular yet."
          />
          <TopicColumn
            title="Mentioned as a problem"
            icon={<ThumbsDown className="h-3.5 w-3.5 text-amber-600" aria-hidden />}
            rows={insights.criticised}
            most={most}
            tone="bad"
            empty="No complaints about anything in particular. "
          />
        </div>

        <p className="mt-4 text-2xs leading-relaxed text-ink-subtle">
          {/* Said plainly, because a salon making staffing decisions on these
              numbers deserves to know they are counts of real comments rather
              than an impression. */}
          Counted from what customers actually wrote. One mention per topic per
          customer, so somebody who complains twice about waiting counts once.
        </p>
      </CardBody>
    </Card>
  );
}

function TopicColumn({
  title,
  icon,
  rows,
  most,
  tone,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { topic: string; count: number }[];
  most: number;
  tone: 'good' | 'bad';
  empty: string;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-ink-subtle">
        {icon}
        {title}
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-ink-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 6).map((row) => (
            <li key={row.topic}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs text-ink">{label(row.topic)}</span>
                <span className="shrink-0 text-xs font-medium tabular-nums text-ink-muted">{row.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className={cn('h-full rounded-full', tone === 'good' ? 'bg-emerald-500' : 'bg-amber-500')}
                  style={{ width: `${Math.max(4, (row.count / most) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
