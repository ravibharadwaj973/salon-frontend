import type { Metadata } from 'next';
import { Info, Megaphone } from 'lucide-react';
import { apiFetchSafe } from '@/lib/api';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, StatTile } from '@/components/ui/display';
import { count, date, daysAgo, money, monthStart, today } from '@/lib/format';
import { SpendVsReturn } from './source-charts';
import { SourceEditor } from './source-editor';
import { SourceTable } from './source-table';
import type { Source, SourceResult } from './types';

export const metadata: Metadata = { title: 'Ad results' };
export const dynamic = 'force-dynamic';

/**
 * DID THE MONEY COME BACK.
 *
 * Instagram can tell a salon how many people saw a reel. It cannot tell them
 * that nine of those people sat in a chair and paid, because Instagram does not
 * have the invoices. This screen is the only place both ends exist, so it does
 * not try to be Ads Manager -- no impressions, no reach, no frequency. It
 * answers the question Ads Manager structurally cannot.
 *
 * Spend is typed in by the owner who paid it rather than fetched from Meta. That
 * is not a stopgap: fetching it needs Meta App Review and Business Verification,
 * weeks of waiting during which a salon would learn nothing at all. A number
 * typed by the person whose money it was is just as true, and available today.
 */
export default async function AdResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const from = params.from ?? monthStart();
  const to = params.to ?? today();

  const [results, sources] = await Promise.all([
    apiFetchSafe<SourceResult[]>('/marketing-sources/results', { query: { from, to } }),
    apiFetchSafe<Source[]>('/marketing-sources'),
  ]);

  const rows = results ?? [];
  const all = sources ?? [];

  const totals = rows.reduce(
    (sum, row) => ({
      spend: sum.spend + row.spend,
      clicks: sum.clicks + row.clicks,
      conversations: sum.conversations + row.conversations,
      bookings: sum.bookings + row.bookings,
      revenue: sum.revenue + row.revenue,
    }),
    { spend: 0, clicks: 0, conversations: 0, bookings: 0, revenue: 0 },
  );

  return (
    <>
      <PageHeader
        title="Ad results"
        description={`${date(from)} – ${date(to)}`}
        action={<SourceEditor />}
      />

      {/* A plain form, so any period is a shareable URL — the same pattern as
          Reports, because somebody will want to send these numbers to a partner. */}
      <form className="mb-5 flex flex-wrap items-center gap-2" action="/ad-results">
        <input
          type="date"
          name="from"
          defaultValue={from}
          aria-label="From"
          className="h-9 rounded-lg border border-stone-300 px-3 text-sm shadow-sm"
        />
        <span className="text-xs text-ink-subtle">to</span>
        <input
          type="date"
          name="to"
          defaultValue={to}
          aria-label="To"
          className="h-9 rounded-lg border border-stone-300 px-3 text-sm shadow-sm"
        />
        <button type="submit" className="h-9 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
          Update
        </button>
        <div className="ml-auto flex gap-1.5">
          {[
            { label: 'This month', from: monthStart() },
            { label: 'Last 30 days', from: daysAgo(30) },
            { label: 'Last 90 days', from: daysAgo(90) },
          ].map((preset) => (
            <a
              key={preset.label}
              href={`/ad-results?from=${preset.from}&to=${today()}`}
              className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              {preset.label}
            </a>
          ))}
        </div>
      </form>

      {all.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Megaphone}
              title="Nothing being tracked yet"
              description="Add the reel, story or flyer you are putting money behind. You get a short link to paste in your Instagram bio or story, and anyone who books through it is counted here — along with what they spent."
              action={<SourceEditor />}
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Spent" value={totals.spend > 0 ? money(totals.spend) : '—'} hint="what you told us you paid" />
            <StatTile label="Bookings" value={count(totals.bookings)} hint={`${count(totals.clicks)} taps, ${count(totals.conversations)} DMs`} />
            <StatTile label="Billed" value={totals.revenue > 0 ? money(totals.revenue) : '—'} hint="from those bookings" />
            {/*
              The headline ratio, and the one place a divide-by-zero would lie
              loudest: with nothing spent there is no return, and showing a dash
              is the honest answer where 0 or infinity would both be wrong.
            */}
            <StatTile
              label="Back per ₹1"
              value={totals.spend > 0 ? money(totals.revenue / totals.spend) : '—'}
              tone={totals.spend > 0 && totals.revenue >= totals.spend ? 'positive' : 'neutral'}
              hint={totals.spend > 0 ? 'billed ÷ spent' : 'record what you spent'}
            />
          </div>

          <Card className="mb-5">
            <CardHeader title="What each promotion cost, and what came back" />
            <CardBody>
              <SpendVsReturn rows={rows} />
            </CardBody>
          </Card>

          <Card className="mb-5">
            <CardHeader title="Every promotion" subtitle="Taps on the link, DMs that came from the ad, bookings, and the money." />
            <SourceTable results={rows} sources={all} />
          </Card>
        </>
      )}

      {/*
        Said plainly rather than buried in a help doc, because a salon owner
        comparing this screen against Instagram's own will otherwise assume the
        smaller numbers here are a bug. They are a different measurement.
      */}
      <div className="flex gap-2.5 rounded-xl border border-stone-200 bg-stone-50/60 p-4 text-xs leading-relaxed text-ink-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
        <div className="space-y-1.5">
          <p>
            <span className="font-medium text-ink">How people get counted.</span> Someone who taps your link is a tap.
            Someone who books through it, or who sends a DM straight from the ad, is tied to that promotion for good —
            so when they are billed, weeks later, the money lands here.
          </p>
          <p>
            Views, reach and impressions stay in Instagram, which is the only place that knows them. This screen holds
            the half Instagram cannot see: who actually sat in a chair and paid.
          </p>
        </div>
      </div>
    </>
  );
}
