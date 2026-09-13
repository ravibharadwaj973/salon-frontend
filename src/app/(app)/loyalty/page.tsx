import type { Metadata } from 'next';
import { Star, Trophy, Users } from 'lucide-react';
import { apiFetchSafe } from '@/lib/api';
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatTile } from '@/components/ui/display';
import { count, money, percent } from '@/lib/format';
import type { LoyaltyProgram, Money, Reward } from '@/lib/types';

export const metadata: Metadata = { title: 'Loyalty' };
export const dynamic = 'force-dynamic';

interface Engagement {
  totalCustomers: number;
  tiers: { tier: string; customers: number; sharePct: number; revenue: Money }[];
  streaks: { average: number; longest: number };
  challenges: Record<string, number>;
}

interface Referrer {
  customerId: string | null;
  name: string;
  phone: string | null;
  tier: string | null;
  referrals: number;
  revenueFromReferrals: Money;
}

export default async function LoyaltyPage() {
  const [program, rewards, engagement, referrers] = await Promise.all([
    apiFetchSafe<LoyaltyProgram>('/loyalty/program'),
    apiFetchSafe<Reward[]>('/loyalty/rewards'),
    apiFetchSafe<Engagement>('/engagement/engagement'),
    apiFetchSafe<Referrer[]>('/engagement/referrals/leaderboard', { query: { limit: 8 } }),
  ]);

  return (
    <>
      <PageHeader
        title="Loyalty"
        description="Points are only worth having if they bring people back — every rule here feeds the retention journeys."
      />

      {program ? (
        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Earn rate" value={`1 pt / ${money(program.amountPerPoint)}`} hint="spent" />
          <StatTile label="Point value" value={money(program.pointValue)} hint="when redeemed" />
          <StatTile label="Min. to redeem" value={count(program.minRedeemPoints)} hint={`max ${percent(Number(program.maxRedeemPctOfBill), 0)} of a bill`} />
          <StatTile label="Points expire after" value={`${program.expiryMonths} months`} />
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Customer tiers" subtitle="Where your revenue actually sits" />
          <CardBody>
            {engagement && engagement.tiers.length > 0 ? (
              <div className="space-y-3">
                {engagement.tiers
                  .slice()
                  .sort((a, b) => Number(b.revenue) - Number(a.revenue))
                  .map((tier) => (
                    <div key={tier.tier} className="flex items-center gap-3">
                      <Badge tone={tier.tier === 'VIP' ? 'brand' : tier.tier === 'GOLD' ? 'warning' : 'neutral'} className="w-16 justify-center">
                        {tier.tier}
                      </Badge>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.max(2, tier.sharePct)}%` }} />
                      </div>
                      <span className="tnum w-24 text-right text-xs text-ink-muted">{count(tier.customers)} customers</span>
                      <span className="tnum w-24 text-right text-sm font-medium text-ink">{money(tier.revenue)}</span>
                    </div>
                  ))}
                <p className="pt-2 text-xs text-ink-subtle">
                  Average visit streak {engagement.streaks.average.toFixed(1)} · longest {engagement.streaks.longest}
                </p>
              </div>
            ) : (
              <EmptyState icon={Users} title="No tier data yet" description="Tiers are assigned automatically as customers spend." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Rewards catalogue" subtitle="What points can be exchanged for" />
          <CardBody>
            {rewards && rewards.length > 0 ? (
              <ul className="space-y-2.5">
                {rewards.map((reward) => (
                  <li key={reward.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{reward.name}</p>
                      <p className="text-xs text-ink-subtle">
                        {reward.rewardType === 'FREE_SERVICE' && reward.service ? reward.service.name : money(reward.value)}
                      </p>
                    </div>
                    <Badge tone="warning">
                      <Star className="h-3 w-3" />
                      {count(reward.pointsCost)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Star} title="No rewards yet" className="py-8" />
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Top referrers" subtitle="Customers who bring you other customers" />
        {referrers && referrers.length > 0 ? (
          <ul className="divide-y divide-stone-100">
            {referrers.map((referrer, index) => (
              <li key={referrer.customerId ?? index} className="flex items-center gap-3 px-5 py-3">
                <span className="w-5 text-center text-xs font-semibold text-ink-subtle">{index + 1}</span>
                <Avatar name={referrer.name} id={referrer.customerId ?? String(index)} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{referrer.name}</p>
                  <p className="tnum text-xs text-ink-subtle">{referrer.phone ?? ''}</p>
                </div>
                <span className="tnum text-sm font-medium text-ink">{referrer.referrals} referrals</span>
                <span className="tnum w-24 text-right text-sm text-ink-muted">{money(referrer.revenueFromReferrals)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Trophy}
            title="No referrals recorded yet"
            description="Set 'referred by' when adding a customer and referral points are awarded automatically."
          />
        )}
      </Card>
    </>
  );
}
