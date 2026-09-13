import type { Metadata } from 'next';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { PageHeader, StatTile } from '@/components/ui/display';
import { ActivityFeed } from './activity-feed';
import type { AuditEntry, AuditFacets, AuditSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Activity' };

interface Search {
  page?: string;
  q?: string;
  group?: string;
  userId?: string;
  from?: string;
  to?: string;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;

  const [feed, facets, summary] = await Promise.all([
    apiFetchList<AuditEntry>('/audit', {
      query: {
        page: sp.page ?? 1,
        pageSize: 50,
        q: sp.q,
        group: sp.group,
        userId: sp.userId,
        from: sp.from,
        to: sp.to,
      },
    }),
    apiFetchSafe<AuditFacets>('/audit/facets'),
    apiFetchSafe<AuditSummary>('/audit/summary', { query: { days: 7 } }),
  ]);

  return (
    <>
      <PageHeader
        title="Activity"
        description="Who did what, and when. Only owners and admins can see this page."
      />

      {summary ? (
        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Today" value={String(summary.today)} hint="actions recorded" />
          <StatTile label={`Last ${summary.windowDays} days`} value={String(summary.total)} hint="actions recorded" />
          <StatTile
            label="Worth a look"
            value={String(summary.needsAttention)}
            hint="voids, refunds, points adjusted"
            tone={summary.needsAttention > 0 ? 'negative' : 'neutral'}
          />
          <StatTile
            label="Most common"
            value={summary.topActions[0]?.action.split('.').slice(1).join(' ') ?? '—'}
            hint={summary.topActions[0] ? `${summary.topActions[0].count} times` : 'nothing yet'}
          />
        </section>
      ) : null}

      <ActivityFeed
        entries={feed.data}
        meta={feed.meta}
        facets={facets ?? { actions: [], groups: [], users: [] }}
        active={{
          q: sp.q ?? '',
          group: sp.group ?? '',
          userId: sp.userId ?? '',
          from: sp.from ?? '',
          to: sp.to ?? '',
        }}
      />
    </>
  );
}
