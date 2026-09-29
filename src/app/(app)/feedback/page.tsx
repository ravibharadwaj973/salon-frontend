import type { Metadata } from 'next';
import Link from 'next/link';
import { Globe, MessageSquareHeart, Star } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Avatar, Card, CardBody, CardHeader, EmptyState, PageHeader, StatTile } from '@/components/ui/display';
import { ResolveComplaint } from './resolve-complaint';
import { ReviewInsightsPanel, type ReviewInsights } from './insights';
import { PublishToggle } from './publish-toggle';
import { cn } from '@/lib/cn';
import { dateTime, dayLabel, daysAgo, fullName, percent } from '@/lib/format';
import type { Feedback, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Feedback' };
export const dynamic = 'force-dynamic';

interface Reputation {
  averageRating: number;
  totalReviews: number;
  distribution: Record<string, number>;
  positiveRatePct: number;
  nps: number | null;
  unresolvedComplaints: number;
  positive: number;
  neutral: number;
  negative: number;
  googleRequested: number;
  googleClicked: number;
  googleLinkConfigured: boolean;
  byStaff: { staffId: string | null; name: string; averageRating: number; reviews: number }[];
  /**
   * Counted alongside, never inside, the figures above. Feedback typed into
   * the public form on the salon's website is unverified — anybody with the
   * address can leave it — so folding it into the average would make the
   * number the salon judges itself by something a stranger can move.
   */
  website?: { count: number; averageRating: number | null };
}

/**
 * The periods a salon actually asks about.
 *
 * Four, not a date picker. "How was this week" and "how is the month going" are
 * the two real questions; a pair of calendar inputs makes somebody choose two
 * dates to ask one of them. Custom ranges belong on a report, not on the screen
 * people open to read complaints.
 */
const RANGES = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null as number | null },
] as const;

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ unresolvedOnly?: string; source?: string; page?: string; days?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);

  /**
   * THE SAME PERIOD EVERYWHERE ON THE PAGE.
   *
   * The range goes to all three requests, not just the list. A page showing
   * "last 7 days" above an average computed from two years of feedback is worse
   * than showing neither: the salon reads the two numbers together and draws a
   * conclusion about the week from a figure that cannot move.
   *
   * Measured on the salon's clock rather than the server's, like every other day
   * boundary here — otherwise "last 7 days" starts a day early for the five and
   * a half hours each evening that UTC is behind.
   */
  const range = RANGES.find((option) => option.key === (params.days ?? '30')) ?? RANGES[1]!;
  const from = range.days ? daysAgo(range.days) : undefined;

  const [{ data: feedback }, summary, insights, user] = await Promise.all([
    apiFetchList<Feedback>('/feedback', {
      query: { unresolvedOnly: params.unresolvedOnly, source: params.source, page, pageSize: 30, from },
    }),
    apiFetchSafe<Reputation>('/feedback/summary', { query: { from } }),
    apiFetchSafe<ReviewInsights>('/feedback/insights', { query: { from } }),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  /**
   * Grouped by the day the customer left it.
   *
   * The list was one undifferentiated column, which reads as a pile rather than
   * a history — and the question a salon actually asks of it is "what came in
   * today", "was Saturday bad". The API already returns newest first, so this
   * only has to keep that order and break it into days.
   */
  const byDay: { label: string; items: Feedback[] }[] = [];
  for (const item of feedback) {
    const label = dayLabel(item.createdAt);
    const last = byDay[byDay.length - 1];
    if (last && last.label === label) last.items.push(item);
    else byDay.push({ label, items: [item] });
  }

  const canResolve = user?.permissions.includes('feedback.manage') ?? false;
  const maxCount = Math.max(1, ...Object.values(summary?.distribution ?? {}));

  return (
    <>
      <PageHeader
        title="Feedback"
        description="4–5 stars are invited to review on Google. 1–3 stars come straight to you instead."
      />

      {/**
        * The period, above the figures it governs.
        *
        * Above rather than beside the list, because it moves the stat tiles and
        * the insights panel too. A control that changes four numbers should not
        * look like it belongs to one of them.
        */}
      <div className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((option) => {
          const query = new URLSearchParams();
          if (option.key !== '30') query.set('days', option.key);
          if (params.unresolvedOnly) query.set('unresolvedOnly', params.unresolvedOnly);
          if (params.source) query.set('source', params.source);
          const href = query.size > 0 ? `/feedback?${query.toString()}` : '/feedback';

          return (
            <Link
              key={option.key}
              href={href}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                option.key === range.key
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-stone-200 bg-white text-ink-muted hover:border-brand-200',
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Average rating"
          value={summary ? Number(summary.averageRating).toFixed(1) : '—'}
          hint={
            summary?.website?.count
              ? `${summary.totalReviews} after visits · ${summary.website.count} from your site, not counted`
              : `${summary?.totalReviews ?? 0} reviews`
          }
        />
        <StatTile label="Positive (4–5★)" value={percent(summary?.positiveRatePct ?? 0, 0)} tone="positive" />
        <StatTile label="NPS" value={summary?.nps !== null && summary?.nps !== undefined ? String(summary.nps) : '—'} />
        <StatTile
          label="Unresolved complaints"
          value={String(summary?.unresolvedComplaints ?? 0)}
          tone={(summary?.unresolvedComplaints ?? 0) > 0 ? 'negative' : 'neutral'}
          href="/feedback?unresolvedOnly=true"
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={params.unresolvedOnly === 'true' ? 'Unresolved complaints' : 'Feedback'}
            /* The period named on the card as well as in the chips, so a
               screenshot of this list is not ambiguous about what it covers. */
            subtitle={range.days ? `Newest first · ${range.label.toLowerCase()}` : 'Newest first · all time'}
            action={
              params.unresolvedOnly === 'true' ? (
                <Link href="/feedback" className="text-xs font-medium text-brand-700 hover:underline">
                  Show all
                </Link>
              ) : (
                <Link href="/feedback?unresolvedOnly=true" className="text-xs font-medium text-brand-700 hover:underline">
                  Complaints only
                </Link>
              )
            }
          />
          {feedback.length === 0 ? (
            <EmptyState
              icon={MessageSquareHeart}
              title="No feedback yet"
              description="A review request goes out two hours after every completed appointment."
            />
          ) : (
            <ul className="divide-y divide-stone-100">
              {byDay.map((group) => (
                <li key={group.label}>
                  {/**
                    * The day, and how many came in on it.
                    *
                    * Sticky so the heading stays put while somebody scrolls a
                    * busy day — otherwise, three screens into Saturday, there is
                    * nothing on screen saying which day this is.
                    */}
                  <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-stone-100 bg-stone-50/95 px-5 py-2 backdrop-blur">
                    <span className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
                      {group.label}
                    </span>
                    <span className="text-2xs tabular-nums text-ink-subtle">
                      {group.items.length === 1 ? '1 review' : `${group.items.length} reviews`}
                    </span>
                  </div>

                  <ul className="divide-y divide-stone-100">
                    {group.items.map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={fullName(item.customer)} id={item.customer?.id ?? item.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.customer ? (
                          <Link href={`/customers/${item.customer.id}`} className="text-sm font-medium text-ink hover:text-brand-700">
                            {fullName(item.customer)}
                          </Link>
                        ) : item.source === 'WEBSITE' ? (
                          /* The name they typed, presented as exactly that.
                             Not linked to a customer, because the phone number
                             behind it is unverified — see the note on
                             authorName in the schema. */
                          <span className="text-sm font-medium text-ink">{item.authorName ?? 'Anonymous'}</span>
                        ) : (
                          <span className="text-sm font-medium text-ink">Anonymous</span>
                        )}
                        <Stars rating={item.rating} />
                        {item.source === 'WEBSITE' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                            <Globe className="h-3 w-3" />
                            from your website
                          </span>
                        ) : null}
                        {item.staff ? <span className="text-xs text-ink-subtle">with {item.staff.displayName}</span> : null}
                      </div>

                      {/* The number they left, and who the salon already knows
                          with that number. Shown as a possible match rather
                          than written onto the record: anybody can type
                          anybody's number into a public form, and a stored
                          link would let them attach this to a named person. */}
                      {item.source === 'WEBSITE' && item.authorPhone ? (
                        <p className="mt-1 text-2xs text-ink-subtle">
                          <span className="tnum text-ink-muted">{item.authorPhone}</span>
                          {item.possibleCustomer ? (
                            <>
                              {' · looks like '}
                              <Link
                                href={`/customers/${item.possibleCustomer.id}`}
                                className="font-medium text-brand-700 hover:underline"
                              >
                                {item.possibleCustomer.name}
                              </Link>
                              {' — unverified'}
                            </>
                          ) : (
                            ' · not a number you have on file'
                          )}
                        </p>
                      ) : null}

                      {item.comment ? (
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">&ldquo;{item.comment}&rdquo;</p>
                      ) : null}

                      <p className="mt-1 text-2xs text-ink-subtle">{dateTime(item.createdAt)}</p>

                      {item.resolutionNote ? (
                        <p className="mt-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">
                          Resolved: {item.resolutionNote}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {item.isComplaint && !item.resolvedAt && canResolve ? (
                        <ResolveComplaint feedbackId={item.id} />
                      ) : null}
                      {/* Only worth offering for something with words in it:
                          a bare five stars with no comment has nothing to put
                          on a page. */}
                      {canResolve && item.comment ? (
                        <PublishToggle feedbackId={item.id} isPublic={item.isPublic ?? false} />
                      ) : null}
                    </div>
                  </div>
                </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Google reviews" subtitle="Only 4–5★ customers are ever sent here" />
            <CardBody className="space-y-3">
              <Funnel
                asked={summary?.googleRequested ?? 0}
                tapped={summary?.googleClicked ?? 0}
                total={summary?.totalReviews ?? 0}
              />
              {summary && !summary.googleLinkConfigured ? (
                <p className="rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800">
                  No Google review link is set, so happy customers have nowhere to go.{' '}
                  <Link href="/settings?tab=branches" className="font-medium underline">
                    Add it in Settings → Branches
                  </Link>
                  .
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-2 border-t border-stone-100 pt-3 text-center">
                <Split label="Happy" sub="4–5★" value={summary?.positive ?? 0} tone="text-emerald-700" />
                <Split label="On the fence" sub="3★" value={summary?.neutral ?? 0} tone="text-amber-700" />
                <Split label="Unhappy" sub="1–2★" value={summary?.negative ?? 0} tone="text-rose-700" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Rating spread" />
            <CardBody>
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const value = summary?.distribution?.[String(rating)] ?? 0;
                  return (
                    <div key={rating} className="flex items-center gap-2">
                      <span className="tnum w-3 text-xs text-ink-muted">{rating}</span>
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className={`h-full rounded-full ${rating >= 4 ? 'bg-emerald-400' : rating === 3 ? 'bg-amber-400' : 'bg-rose-400'}`}
                          style={{ width: `${(value / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="tnum w-8 text-right text-xs text-ink-subtle">{value}</span>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {/* Above "By stylist" on purpose: what people keep mentioning is the
              thing to act on, and which stylist it was is the follow-up. */}
          <ReviewInsightsPanel insights={insights} />

          {summary && summary.byStaff.length > 0 ? (
            <Card>
              <CardHeader title="By stylist" subtitle="Where the experience varies" />
              <CardBody>
                <ul className="space-y-2">
                  {summary.byStaff.map((row) => (
                    <li key={row.staffId ?? row.name} className="flex items-center justify-between gap-2">
                      <Link href={row.staffId ? `/staff/${row.staffId}` : '#'} className="truncate text-sm text-ink hover:text-brand-700">
                        {row.name}
                      </Link>
                      <span className="flex shrink-0 items-center gap-1 text-sm">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="tnum font-medium text-ink">{Number(row.averageRating).toFixed(1)}</span>
                        <span className="text-2xs text-ink-subtle">({row.reviews})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * Two bars, drawn to the same scale so the drop-off is the thing you see:
 * of everyone who left a rating, how many were happy enough to be asked, and
 * how many of those actually went to Google.
 */
function Funnel({ asked, tapped, total }: { asked: number; tapped: number; total: number }) {
  const base = Math.max(1, total, asked);
  const conversion = asked > 0 ? Math.round((tapped / asked) * 100) : null;

  return (
    <div className="space-y-2.5">
      <Bar label="Asked to review" value={asked} width={(asked / base) * 100} className="bg-brand-400" />
      <Bar label="Tapped through" value={tapped} width={(tapped / base) * 100} className="bg-emerald-500" />
      <p className="text-2xs text-ink-subtle">
        {conversion === null
          ? 'Nobody has been asked yet.'
          : `${conversion}% of the customers who were asked went on to Google.`}
      </p>
    </div>
  );
}

function Bar({ label, value, width, className }: { label: string; value: number; width: number; className: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs text-ink-muted">{label}</span>
        <span className="tnum text-sm font-medium text-ink">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, width)}%` }} />
      </div>
    </div>
  );
}

function Split({ label, sub, value, tone }: { label: string; sub: string; value: number; tone: string }) {
  return (
    <div>
      <p className={`tnum text-lg font-semibold ${tone}`}>{value}</p>
      <p className="text-2xs text-ink-muted">{label}</p>
      <p className="text-2xs text-ink-subtle">{sub}</p>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={`h-3 w-3 ${value <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`}
        />
      ))}
    </span>
  );
}
