import type { Metadata } from 'next';
import Link from 'next/link';
import { Heart, TrendingUp } from 'lucide-react';
import { apiFetch, apiFetchList, apiFetchSafe } from '@/lib/api';
import { Card, CardHeader, EmptyState, PageHeader, StatTile, StatusBadge } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { date, dayjs, fullName, money } from '@/lib/format';
import { PlanManager } from './plan-manager';
import type { MembershipPlan, MembershipSubscription, Service, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Memberships' };
export const dynamic = 'force-dynamic';

export default async function MembershipsPage({
  searchParams,
}: {
  searchParams: Promise<{ expiringInDays?: string }>;
}) {
  const params = await searchParams;

  const [user, plans, menu, subscriptions, expiring] = await Promise.all([
    apiFetch<SessionUser>('/auth/me', { noBranch: true }),
    apiFetchSafe<MembershipPlan[]>('/memberships/plans'),
    apiFetchSafe<{ id: string; name: string; services: Service[] }[]>('/services/menu'),
    apiFetchList<MembershipSubscription>('/memberships/subscriptions', {
      query: { status: 'ACTIVE', pageSize: 50, expiringInDays: params.expiringInDays },
    }).catch(() => null),
    apiFetchList<MembershipSubscription>('/memberships/subscriptions', {
      query: { status: 'ACTIVE', expiringInDays: 30, pageSize: 1 },
    }).catch(() => null),
  ]);

  const services = (menu ?? []).flatMap((group) => group.services).filter((service) => service.isActive !== false);
  const canManage = user.permissions.includes('membership.manage');
  const activeCount = subscriptions?.meta.total ?? 0;
  const recurringValue = (subscriptions?.data ?? []).reduce((sum, sub) => sum + Number(sub.price), 0);

  return (
    <>
      <PageHeader
        title="Memberships"
        description="Your plans, your prices. Members visit more often and spend more; renewal reminders go out automatically at 30, 7 and 1 day."
      />

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active members" value={String(activeCount)} />
        <StatTile label="Plans on sale" value={String(plans?.filter((p) => p.isActive).length ?? 0)} />
        <StatTile
          label="Expiring in 30 days"
          value={String(expiring?.meta.total ?? 0)}
          tone={(expiring?.meta.total ?? 0) > 0 ? 'negative' : 'neutral'}
          href="/memberships?expiringInDays=30"
        />
        <StatTile label="Value on the books" value={money(recurringValue)} hint="from the members listed" />
      </section>

      <PlanManager plans={plans ?? []} services={services} canManage={canManage} />

      <Card>
        <CardHeader
          title={params.expiringInDays ? `Expiring within ${params.expiringInDays} days` : 'Active members'}
          subtitle={params.expiringInDays ? 'Call these people — renewal converts far better by phone' : undefined}
          action={
            params.expiringInDays ? (
              <Link href="/memberships" className="text-xs font-medium text-brand-700 hover:underline">
                Show all
              </Link>
            ) : null
          }
        />
        {!subscriptions || subscriptions.data.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No active memberships"
            description="Sell one from New bill — attach the customer, open the Memberships tab and add a plan to the bill."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Plan</TH>
                <TH align="right">Paid</TH>
                <TH>Started</TH>
                <TH>Expires</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {subscriptions.data.map((subscription) => {
                const daysLeft = dayjs(subscription.endAt).diff(dayjs(), 'day');
                return (
                  <TR key={subscription.id}>
                    <TD>
                      {subscription.customer ? (
                        <Link href={`/customers/${subscription.customer.id}`} className="font-medium text-ink hover:text-brand-700">
                          {fullName(subscription.customer)}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="text-ink-muted">{subscription.plan.name}</TD>
                    <TD align="right">{money(subscription.price)}</TD>
                    <TD className="text-xs text-ink-muted">{date(subscription.startAt)}</TD>
                    <TD className={`text-xs ${daysLeft <= 30 ? 'font-medium text-amber-700' : 'text-ink-muted'}`}>
                      {date(subscription.endAt)}
                      {daysLeft >= 0 ? <span className="text-ink-subtle"> · {daysLeft}d left</span> : null}
                    </TD>
                    <TD>
                      <StatusBadge status={subscription.status} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-subtle">
        <TrendingUp className="h-3.5 w-3.5" />
        Membership renewal reminders are handled by the &ldquo;Membership renewal&rdquo; journey.
      </p>
    </>
  );
}
