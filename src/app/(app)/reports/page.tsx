import type { Metadata } from 'next';
import { BarChart3, Lightbulb } from 'lucide-react';
import { apiFetchSafe } from '@/lib/api';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, StatTile } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { BranchPnl, RetentionGrid, RevenueTrend, ServiceRevenue } from './report-charts';
import { count, date, dayjs, money, percent } from '@/lib/format';
import type { GrowthResponse, Insight, Money, ServicePerformanceRow, UnitEconomics } from '@/lib/types';

export const metadata: Metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

interface TrendRow {
  period: string;
  revenue: Money;
  invoices: number;
  customers: number;
  averageBill: Money;
}

interface Pnl {
  branches: {
    branchId: string;
    branchName: string;
    city: string | null;
    revenue: Money;
    invoices: number;
    cogs: Money;
    staffCommission: Money;
    expenses: Money;
    operatingProfit: Money;
    marginPct: number;
  }[];
  totals: { revenue: Money; cogs: Money; commission: Money; expenses: Money; profit: Money; marginPct: number };
}

interface Cohorts {
  cohorts: { cohort: string; size: number; periods: { monthOffset: number; retained: number; retentionPct: number }[] }[];
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const from = params.from ?? dayjs().startOf('month').format('YYYY-MM-DD');
  const to = params.to ?? dayjs().format('YYYY-MM-DD');

  const [economics, growth, trend, services, pnl, cohorts, insights] = await Promise.all([
    apiFetchSafe<UnitEconomics>('/analytics/unit-economics', { query: { from, to } }),
    apiFetchSafe<GrowthResponse>('/analytics/growth', { query: { from, to } }),
    apiFetchSafe<TrendRow[]>('/analytics/revenue-trend', { query: { from, to, interval: 'day' } }),
    apiFetchSafe<ServicePerformanceRow[]>('/analytics/services', { query: { from, to, limit: 12 } }),
    apiFetchSafe<Pnl>('/analytics/branch-pnl', { query: { from, to } }),
    apiFetchSafe<Cohorts>('/analytics/retention', { query: { months: 6 } }),
    apiFetchSafe<{ insights: Insight[] }>('/analytics/insights'),
  ]);

  const anything = economics || growth || trend || services;

  return (
    <>
      <PageHeader title="Reports" description={`${date(from)} – ${date(to)}`} />

      {/* Period picker: a plain form, so any report view is a shareable URL. */}
      <form className="mb-5 flex flex-wrap items-center gap-2" action="/reports">
        <input type="date" name="from" defaultValue={from} className="h-9 rounded-lg border border-stone-300 px-3 text-sm shadow-sm" />
        <span className="text-xs text-ink-subtle">to</span>
        <input type="date" name="to" defaultValue={to} className="h-9 rounded-lg border border-stone-300 px-3 text-sm shadow-sm" />
        <button type="submit" className="h-9 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
          Update
        </button>
        <div className="ml-auto flex gap-1.5">
          {[
            { label: 'This month', from: dayjs().startOf('month').format('YYYY-MM-DD') },
            { label: 'Last 30 days', from: dayjs().subtract(30, 'day').format('YYYY-MM-DD') },
            { label: 'Last 90 days', from: dayjs().subtract(90, 'day').format('YYYY-MM-DD') },
          ].map((preset) => (
            <a
              key={preset.label}
              href={`/reports?from=${preset.from}&to=${dayjs().format('YYYY-MM-DD')}`}
              className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              {preset.label}
            </a>
          ))}
        </div>
      </form>

      {!anything ? (
        <Card>
          <EmptyState icon={BarChart3} title="No figures available" description="Check that the API is running and you have data in this period." />
        </Card>
      ) : null}

      {/* Unit economics — this is the part that turns software into visibility. */}
      {economics ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Revenue" value={money(economics.revenue)} hint={`${economics.period.days} days`} />
            <StatTile label="Gross profit" value={money(economics.grossProfit)} hint={percent(economics.grossMarginPct, 1)} tone="positive" />
            <StatTile
              label="Operating profit"
              value={money(economics.operatingProfit)}
              hint={percent(economics.operatingMarginPct, 1)}
              tone={Number(economics.operatingProfit) >= 0 ? 'positive' : 'negative'}
            />
            <StatTile label="Average ticket" value={money(economics.averageTicketSize)} />
          </section>

          <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Customers served" value={count(economics.customersServed)} hint={`${count(economics.newCustomers)} new`} />
            <StatTile label="Repeat rate" value={percent(economics.repeatRatePct, 0)} hint={`${economics.visitsPerCustomer} visits each`} />
            <StatTile
              label="Acquisition cost"
              value={money(economics.customerAcquisitionCost)}
              hint={economics.ltvToCacRatio ? `LTV:CAC ${economics.ltvToCacRatio}×` : 'no marketing spend recorded'}
            />
            <StatTile label="Estimated LTV" value={money(economics.estimatedLtv)} hint="2-year horizon" />
          </section>

          <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Revenue per chair" value={money(economics.revenuePerChair)} />
            <StatTile label="Revenue per day" value={money(economics.revenuePerDay)} />
            <StatTile label="Product cost" value={money(economics.cogs)} hint="consumed + sold" />
            <StatTile label="Staff commission" value={money(economics.staffCommission)} />
          </section>
        </>
      ) : null}

      {/* Growth */}
      {growth ? (
        <Card className="mt-5">
          <CardHeader title="Growth" subtitle="Against the previous period of the same length" />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Metric label="Revenue" value={money(growth.current.revenue)} change={growth.changes.revenuePct} />
              <Metric label="New customers" value={count(growth.current.newCustomers)} change={growth.changes.newCustomersPct} />
              <Metric label="Returning" value={count(growth.current.returningCustomers)} change={growth.changes.returningCustomersPct} />
              <Metric label="Retention" value={percent(growth.current.retentionPct, 0)} change={growth.changes.retentionPct} suffix="pts" />
              <Metric label="Rebooking" value={percent(growth.current.rebookingPct, 0)} />
            </div>
            <div className="mt-4 grid gap-4 border-t border-stone-100 pt-4 sm:grid-cols-3">
              <Metric label="Revenue per customer" value={money(growth.current.revenuePerCustomer)} />
              <Metric label="Revenue per stylist" value={money(growth.current.revenuePerStaff)} />
              <Metric label="Revenue per branch" value={money(growth.current.revenuePerBranch)} />
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue by day" subtitle="Billed, excluding voided invoices" />
          <CardBody>
            <RevenueTrend data={trend ?? []} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Revenue by service" subtitle="Top services in this period" />
          <CardBody>
            <ServiceRevenue data={services ?? []} />
          </CardBody>
        </Card>
      </div>

      {/* Branch P&L — chart plus the table it came from. */}
      {pnl && pnl.branches.length > 0 ? (
        <Card className="mt-5">
          <CardHeader
            title="Branch profit and loss"
            subtitle={`Total operating profit ${money(pnl.totals.profit)} at ${percent(pnl.totals.marginPct, 1)} margin`}
          />
          <CardBody>
            <BranchPnl data={pnl.branches} />
          </CardBody>
          <Table>
            <THead>
              <TR>
                <TH>Branch</TH>
                <TH align="right">Revenue</TH>
                <TH align="right">Product cost</TH>
                <TH align="right">Commission</TH>
                <TH align="right">Expenses</TH>
                <TH align="right">Operating profit</TH>
                <TH align="right">Margin</TH>
              </TR>
            </THead>
            <TBody>
              {pnl.branches.map((branch) => (
                <TR key={branch.branchId}>
                  <TD>
                    <span className="font-medium text-ink">{branch.branchName}</span>
                    {branch.city ? <span className="ml-1 text-xs text-ink-subtle">{branch.city}</span> : null}
                  </TD>
                  <TD align="right">{money(branch.revenue)}</TD>
                  <TD align="right" className="text-ink-muted">{money(branch.cogs)}</TD>
                  <TD align="right" className="text-ink-muted">{money(branch.staffCommission)}</TD>
                  <TD align="right" className="text-ink-muted">{money(branch.expenses)}</TD>
                  <TD align="right" className={Number(branch.operatingProfit) >= 0 ? 'font-medium text-emerald-700' : 'font-medium text-rose-600'}>
                    {money(branch.operatingProfit)}
                  </TD>
                  <TD align="right" className="text-ink-muted">{percent(branch.marginPct, 1)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      {/* Cohorts */}
      <Card className="mt-5">
        <CardHeader
          title="Customer retention by cohort"
          subtitle="Of the customers who first visited in a month, how many came back later"
        />
        <CardBody>
          <RetentionGrid cohorts={cohorts?.cohorts ?? []} />
        </CardBody>
      </Card>

      {/* Insights */}
      {insights && insights.insights.length > 0 ? (
        <Card className="mt-5">
          <CardHeader title="What stands out" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {insights.insights.map((insight, index) => (
              <div key={`${insight.type}-${index}`} className="flex items-start gap-2.5 rounded-lg bg-stone-50 p-3">
                <Lightbulb
                  className={`mt-0.5 h-4 w-4 shrink-0 ${insight.severity === 'WARNING' ? 'text-amber-500' : 'text-brand-500'}`}
                />
                <p className="text-xs leading-relaxed text-ink">{insight.message}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

function Metric({
  label,
  value,
  change,
  suffix,
}: {
  label: string;
  value: string;
  change?: number;
  suffix?: string;
}) {
  return (
    <div>
      <p className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="tnum mt-1 text-lg font-semibold text-ink">{value}</p>
      {change !== undefined ? (
        <p className={`tnum text-xs ${change > 0 ? 'text-emerald-600' : change < 0 ? 'text-rose-600' : 'text-ink-subtle'}`}>
          {change > 0 ? '+' : ''}
          {change.toFixed(1)}
          {suffix ?? '%'} vs previous
        </p>
      ) : null}
    </div>
  );
}
