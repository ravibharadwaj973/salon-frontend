import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2, PauseCircle } from 'lucide-react';
import { apiFetch, apiFetchSafe } from '@/lib/api';
import { Card, CardBody, CardHeader, PageHeader, StatTile } from '@/components/ui/display';
import { count, money } from '@/lib/format';
import { FAIR_USE_UNLIMITED, type AddOnPack, type LimitsSummary, type UsageSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Usage' };

const limitLabel = (n: number) => (n >= FAIR_USE_UNLIMITED ? 'Unlimited' : count(n));

export default async function UsagePage() {
  const [usage, limits, packs] = await Promise.all([
    apiFetch<UsageSummary>('/usage'),
    apiFetchSafe<LimitsSummary>('/usage/limits'),
    apiFetchSafe<AddOnPack[]>('/usage/packs'),
  ]);

  const anyBlocked = usage.meters.some((m) => m.blocked > 0);
  const anyLow = usage.meters.some((m) => m.included > 0 && m.available > 0 && m.percentUsed >= 80);

  return (
    <>
      <PageHeader
        title="Usage"
        description={`${usage.period.label} · allowances reset in ${usage.period.daysLeft} day${
          usage.period.daysLeft === 1 ? '' : 's'
        }`}
      />

      {usage.sending.blocked ? (
        <div className="mb-5 rounded-xl border border-rose-300 bg-rose-50 p-4">
          <div className="flex items-start gap-3">
            <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-rose-900">Sending is paused</p>
              <p className="text-xs leading-relaxed text-rose-800">
                {usage.sending.reason ??
                  'Your message allowance was used up, so new sending has stopped.'}{' '}
                {usage.sending.owedMessages > 0 ? (
                  <>
                    <strong>{count(usage.sending.owedMessages)} messages</strong> were sent beyond your allowance to
                    finish the campaign that was already running — nobody received half a message.{' '}
                  </>
                ) : null}
                Settle those and we will switch sending back on, usually the same day.
              </p>
              <p className="text-xs text-rose-800">
                Appointments, billing and everything else in the app keep working normally. Only outgoing messages are
                affected.
              </p>
            </div>
          </div>
        </div>
      ) : anyBlocked ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-medium text-rose-900">Some messages were not sent</p>
            <p className="text-xs text-rose-800">
              An allowance ran out and there were no top-up credits left, so those messages were skipped rather than
              queued. Reminders that do not go out become no-shows — top up, or they will resume on the 1st.
            </p>
          </div>
        </div>
      ) : anyLow ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-900">Running low</p>
            <p className="text-xs text-amber-800">
              You have used more than 80% of an allowance with {usage.period.daysLeft} day
              {usage.period.daysLeft === 1 ? '' : 's'} to go.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-900">
            Everything is sending normally on the <strong>{usage.plan?.name ?? 'current'}</strong> plan.
          </p>
        </div>
      )}

      <Card>
        <CardHeader
          title="Messages"
          subtitle="WhatsApp utility covers confirmations, reminders and bills. Marketing covers offers and win-back campaigns."
        />
        <CardBody className="space-y-5">
          {usage.meters
            .filter((meter) => meter.included > 0 || meter.used > 0 || meter.credits > 0)
            .map((meter) => {
              const over = meter.used > meter.included;
              return (
                <div key={meter.meter} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{meter.label}</span>
                    <span className="tnum text-xs text-ink-muted">
                      <strong className="font-medium text-ink">{count(meter.available)}</strong> left
                      {meter.credits > 0 ? ` (${count(meter.credits)} from top-ups)` : ''}
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={`h-full rounded-full ${
                        meter.blocked > 0 ? 'bg-rose-500' : over ? 'bg-amber-500' : 'bg-brand-500'
                      }`}
                      style={{ width: `${Math.min(100, meter.percentUsed)}%` }}
                    />
                  </div>

                  <p className="tnum text-2xs text-ink-muted">
                    {count(meter.used)} of {count(meter.included)} included this month
                    {meter.blocked > 0 ? ` · ${count(meter.blocked)} not sent` : ''}
                  </p>
                </div>
              );
            })}

          {usage.meters.every((m) => m.included === 0 && m.used === 0) ? (
            <p className="text-sm text-ink-muted">
              No message allowance on this plan yet. Ask us to add one and reminders will start going out.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {limits ? (
        <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Branches"
            value={`${count(limits.branches.current)} / ${limitLabel(limits.branches.limit)}`}
          />
          <StatTile label="Staff logins" value={`${count(limits.staff.current)} / ${limitLabel(limits.staff.limit)}`} />
          <StatTile
            label="Customers"
            value={`${count(limits.customers.current)} / ${limitLabel(limits.customers.limit)}`}
          />
        </section>
      ) : null}

      {packs && packs.length > 0 ? (
        <Card className="mt-5">
          <CardHeader
            title="Top-ups"
            subtitle="Credits carry over month to month and are only used once the included allowance runs out."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {packs.map((pack) => (
                <div key={pack.id} className="rounded-xl border border-stone-200 p-4">
                  <p className="text-sm font-medium text-ink">{pack.name}</p>
                  <p className="tnum mt-1 text-lg font-semibold text-ink">{money(pack.price)}</p>
                  <p className="tnum mt-0.5 text-2xs text-ink-muted">
                    ₹{(Number(pack.price) / pack.quantity).toFixed(2)} per message
                  </p>
                </div>
              ))}
            </div>

            <p className="rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-ink-muted">
              To add a top-up, pay by UPI or bank transfer and send us the reference — we activate the credits on your
              account. Nothing is charged automatically, and no card is ever stored.
            </p>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
