import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquareHeart, Star } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Avatar, Card, CardBody, CardHeader, EmptyState, PageHeader, StatTile } from '@/components/ui/display';
import { ResolveComplaint } from './resolve-complaint';
import { dateTime, fullName, percent } from '@/lib/format';
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
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ unresolvedOnly?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);

  const [{ data: feedback }, summary, user] = await Promise.all([
    apiFetchList<Feedback>('/feedback', {
      query: { unresolvedOnly: params.unresolvedOnly, page, pageSize: 30 },
    }),
    apiFetchSafe<Reputation>('/feedback/summary'),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  const canResolve = user?.permissions.includes('feedback.manage') ?? false;
  const maxCount = Math.max(1, ...Object.values(summary?.distribution ?? {}));

  return (
    <>
      <PageHeader
        title="Feedback"
        description="4–5 stars are invited to review on Google. 1–3 stars come straight to you instead."
      />

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Average rating"
          value={summary ? Number(summary.averageRating).toFixed(1) : '—'}
          hint={`${summary?.totalReviews ?? 0} reviews`}
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
            title={params.unresolvedOnly === 'true' ? 'Unresolved complaints' : 'Recent feedback'}
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
              {feedback.map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={fullName(item.customer)} id={item.customer?.id ?? item.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.customer ? (
                          <Link href={`/customers/${item.customer.id}`} className="text-sm font-medium text-ink hover:text-brand-700">
                            {fullName(item.customer)}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-ink">Anonymous</span>
                        )}
                        <Stars rating={item.rating} />
                        {item.staff ? <span className="text-xs text-ink-subtle">with {item.staff.displayName}</span> : null}
                      </div>

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

                    {item.isComplaint && !item.resolvedAt && canResolve ? (
                      <ResolveComplaint feedbackId={item.id} />
                    ) : null}
                  </div>
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
