'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, EmptyState, Avatar } from '@/components/ui/display';
import { Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/table';
import { dateTime, fromNow } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AuditEntry, AuditFacets, PageMeta } from '@/lib/types';

/**
 * Action strings are `entity.verb` — "invoice.voided". Rendering them raw makes
 * an owner decode machine names, so the noun and the verb are separated and the
 * few that matter for money are coloured.
 */
const TONE: Record<string, 'danger' | 'warn' | 'plain'> = {
  voided: 'danger',
  refunded: 'danger',
  deleted: 'danger',
  deactivated: 'danger',
  adjusted: 'warn',
  discount: 'warn',
  merged: 'warn',
  imported: 'warn',
};

const GROUP_LABELS: Record<string, string> = {
  appointment: 'Appointments',
  invoice: 'Billing',
  payment: 'Payments',
  customer: 'Customers',
  staff: 'Staff',
  user: 'Users',
  branch: 'Branches',
  service: 'Services',
  inventory: 'Stock',
  expense: 'Expenses',
  campaign: 'Campaigns',
  journey: 'Journeys',
  loyalty: 'Loyalty',
  membership: 'Memberships',
  package: 'Packages',
  lead: 'Leads',
  feedback: 'Feedback',
  settings: 'Settings',
  tenant: 'Salon',
  auth: 'Sign-in',
  credits: 'Top-ups',
  message: 'Messages',
};

function describe(action: string): { verb: string; noun: string; tone: 'danger' | 'warn' | 'plain' } {
  const [group = action, ...rest] = action.split('.');
  const verb = rest.join(' ').replace(/_/g, ' ') || 'changed';
  return {
    verb: verb.charAt(0).toUpperCase() + verb.slice(1),
    noun: GROUP_LABELS[group] ?? group,
    tone: TONE[rest[rest.length - 1] ?? ''] ?? 'plain',
  };
}

export function ActivityFeed({
  entries,
  meta,
  facets,
  active,
}: {
  entries: AuditEntry[];
  meta: PageMeta;
  facets: AuditFacets;
  active: { q: string; group: string; userId: string; from: string; to: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(active.q);
  const [open, setOpen] = useState<string | null>(null);

  const hasFilters = Boolean(active.q || active.group || active.userId || active.from || active.to);

  function apply(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    router.push(`/activity?${next.toString()}`);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-3">
        <form
          className="relative min-w-[180px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q });
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search person, action or record"
            className="pl-8"
          />
        </form>

        <Select value={active.group} onChange={(e) => apply({ group: e.target.value })} className="w-auto">
          <option value="">Everything</option>
          {facets.groups.map((group) => (
            <option key={group} value={group}>
              {GROUP_LABELS[group] ?? group}
            </option>
          ))}
        </Select>

        <Select value={active.userId} onChange={(e) => apply({ userId: e.target.value })} className="w-auto">
          <option value="">Anyone</option>
          {facets.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.count})
            </option>
          ))}
        </Select>

        <Input
          type="date"
          value={active.from}
          onChange={(e) => apply({ from: e.target.value })}
          className="w-auto"
          aria-label="From date"
        />
        <Input
          type="date"
          value={active.to}
          onChange={(e) => apply({ to: e.target.value })}
          className="w-auto"
          aria-label="To date"
        />

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ('');
              router.push('/activity');
            }}
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        ) : null}
      </div>

      <CardBody className="p-0">
        {entries.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title={hasFilters ? 'Nothing matches those filters' : 'No activity recorded yet'}
              description={
                hasFilters
                  ? 'Try a wider date range, or clear the filters.'
                  : 'Actions appear here as your team uses the app — bookings, bills, refunds, changes to staff and settings.'
              }
            />
          </div>
        ) : (
          <ol className="divide-y divide-stone-100">
            {entries.map((entry) => {
              const { verb, noun, tone } = describe(entry.action);
              const expanded = open === entry.id;
              const hasDetail = Boolean(entry.before || entry.after);

              return (
                <li key={entry.id}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Avatar name={entry.user?.name ?? 'System'} size="sm" />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">
                        <span className="font-medium">{entry.user?.name ?? 'System'}</span>{' '}
                        <span
                          className={cn(
                            tone === 'danger' && 'font-medium text-rose-700',
                            tone === 'warn' && 'font-medium text-amber-700',
                          )}
                        >
                          {verb.toLowerCase()}
                        </span>{' '}
                        <span className="text-ink-muted">in {noun}</span>
                      </p>

                      <p className="mt-0.5 text-2xs text-ink-subtle">
                        {fromNow(entry.createdAt)} · {dateTime(entry.createdAt)}
                        {entry.user?.role ? ` · ${entry.user.role.replace(/_/g, ' ').toLowerCase()}` : ''}
                        {entry.entityId ? ` · ${entry.entity} ${entry.entityId.slice(-6)}` : ''}
                        {entry.ip ? ` · ${entry.ip}` : ''}
                      </p>

                      {expanded && hasDetail ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {entry.before ? <Detail label="Before" value={entry.before} /> : null}
                          {entry.after ? <Detail label="After" value={entry.after} /> : null}
                        </div>
                      ) : null}
                    </div>

                    {hasDetail ? (
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : entry.id)}
                        className="shrink-0 rounded-md p-1 text-ink-subtle hover:bg-stone-100 hover:text-ink"
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Hide details' : 'Show details'}
                      >
                        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>

      {meta.totalPages > 1 ? (
        <div className="border-t border-stone-200 p-3">
          <Pagination
            page={meta.page}
            pageSize={meta.pageSize}
            total={meta.total}
            basePath="/activity"
            searchParams={{
              q: active.q || undefined,
              group: active.group || undefined,
              userId: active.userId || undefined,
              from: active.from || undefined,
              to: active.to || undefined,
            }}
          />
        </div>
      ) : null}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg bg-stone-50 p-2.5">
      <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <pre className="overflow-x-auto font-mono text-2xs leading-relaxed text-ink-muted">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
