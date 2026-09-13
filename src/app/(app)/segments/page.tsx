import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, Users } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Card, EmptyState, PageHeader } from '@/components/ui/display';
import { SegmentBuilder } from './segment-builder';
import { PlanGate, PlanGateList } from '@/components/plan-gate';
import { count, fromNow } from '@/lib/format';
import type { Segment, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Segments' };
export const dynamic = 'force-dynamic';

export default async function SegmentsPage() {
  const session = await apiFetchSafe<SessionUser>('/auth/me', { noBranch: true });
  if (session && !(session.features ?? []).includes('segments')) {
    return (
      <PlanGate
        title="Segments are not on your plan"
        what="A segment is a live rule for picking customers — everyone who has not been in for sixty days, everyone who only ever books colour."
        planName={session.tenant.plan?.name}
      >
        <PlanGateList
          items={[
            'Build a group from visits, spend, service history or tags',
            'The count updates itself; it is a rule, not a frozen list',
            'Point a campaign straight at it',
          ]}
        />
      </PlanGate>
    );
  }

  const [{ data: segments }, user] = await Promise.all([
    apiFetchList<Segment>('/segments', { query: { pageSize: 50 } }),
    Promise.resolve(session),
  ]);

  const canManage = user?.permissions.includes('segment.manage') ?? false;

  return (
    <>
      <PageHeader
        title="Segments"
        description="Who you are talking to. A segment is a live rule, not a frozen list — it re-counts every time you use it."
        action={canManage ? <SegmentBuilder /> : null}
      />

      {segments.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No segments yet"
            description="Start with the one that pays: customers with 2+ visits who have not been in for 45 days."
            action={canManage ? <SegmentBuilder /> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {segments.map((segment) => (
            <Card key={segment.id} className="flex flex-col">
              <div className="flex-1 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold text-ink">{segment.name}</h2>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    <Users className="h-3 w-3" />
                    {count(segment.lastCount)}
                  </span>
                </div>

                {segment.description ? (
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{segment.description}</p>
                ) : null}

                <ul className="mt-3 space-y-1">
                  {(segment.rules?.conditions ?? []).slice(0, 4).map((condition, index) => (
                    <li key={index} className="rounded bg-stone-50 px-2 py-1 font-mono text-2xs text-ink-muted">
                      {condition.field} {condition.op} {String(condition.value ?? '')}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between border-t border-stone-200 px-5 py-3">
                <span className="text-2xs text-ink-subtle">
                  {segment.lastComputedAt ? `Counted ${fromNow(segment.lastComputedAt)}` : 'Never counted'}
                </span>
                <Link
                  href={`/campaigns?segmentId=${segment.id}`}
                  className="text-xs font-medium text-brand-700 hover:underline"
                >
                  Send a campaign
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
