import type { Metadata } from 'next';
import Link from 'next/link';
import { Target, TrendingUp } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Card, CardHeader, EmptyState, PageHeader, StatTile, StatusBadge } from '@/components/ui/display';
import { Pagination, TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { LeadActions, NewLeadButton } from './lead-actions';
import { date, dayjs, fromNow, money, percent, phone as formatPhone } from '@/lib/format';
import type { Lead, Money, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

interface Funnel {
  totalLeads: number;
  overallConversionRatePct: number;
  byStatus: Record<string, number>;
  bySource: {
    source: string;
    leads: number;
    converted: number;
    conversionRatePct: number;
    visits: number;
    revenue: Money;
    revenuePerLead: Money;
  }[];
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string; page?: string; dueOnly?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const monthStart = dayjs().subtract(90, 'day').format('YYYY-MM-DD');
  const today = dayjs().format('YYYY-MM-DD');

  const [{ data: leads, meta }, funnel, user] = await Promise.all([
    apiFetchList<Lead>('/leads', {
      query: { status: params.status, source: params.source, dueOnly: params.dueOnly, page, pageSize: 25 },
    }),
    apiFetchSafe<Funnel>('/leads/funnel', { query: { from: monthStart, to: today } }),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  const canManage = user?.permissions.includes('lead.manage') ?? false;

  return (
    <>
      <PageHeader
        title="Leads"
        description="Enquiries before they become customers — and which channel actually produced revenue"
        action={canManage ? <NewLeadButton /> : null}
      />

      {funnel ? (
        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Leads (90 days)" value={String(funnel.totalLeads)} />
          <StatTile label="Converted" value={String(funnel.byStatus.CONVERTED ?? 0)} tone="positive" />
          <StatTile label="Conversion rate" value={percent(funnel.overallConversionRatePct, 0)} />
          <StatTile label="Needs follow-up" value={String(funnel.byStatus.NEW ?? 0)} href="/leads?dueOnly=true" />
        </section>
      ) : null}

      {funnel && funnel.bySource.length > 0 ? (
        <Card className="mb-5">
          <CardHeader
            title="Where your customers come from"
            subtitle="Leads are easy to count; this is what they were worth"
          />
          <Table>
            <THead>
              <TR>
                <TH>Source</TH>
                <TH align="right">Leads</TH>
                <TH align="right">Converted</TH>
                <TH align="right">Rate</TH>
                <TH align="right">Visits</TH>
                <TH align="right">Revenue</TH>
                <TH align="right">Per lead</TH>
              </TR>
            </THead>
            <TBody>
              {funnel.bySource.map((row) => (
                <TR key={row.source}>
                  <TD className="capitalize text-ink">{row.source.replace(/_/g, ' ').toLowerCase()}</TD>
                  <TD align="right" className="text-ink-muted">{row.leads}</TD>
                  <TD align="right">{row.converted}</TD>
                  <TD align="right" className="text-ink-muted">{percent(row.conversionRatePct, 0)}</TD>
                  <TD align="right" className="text-ink-muted">{row.visits}</TD>
                  <TD align="right" className="font-medium">{money(row.revenue)}</TD>
                  <TD align="right" className="text-ink-muted">{money(row.revenuePerLead)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="flex items-center gap-1.5 border-t border-stone-200 px-4 py-2.5 text-xs text-ink-subtle">
            <TrendingUp className="h-3.5 w-3.5" />
            Spend where the revenue is, not where the leads are.
          </p>
        </Card>
      ) : null}

      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-3" action="/leads">
          <select name="status" defaultValue={params.status ?? ''} className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm">
            <option value="">All statuses</option>
            {['NEW', 'CONTACTED', 'INTERESTED', 'APPOINTMENT_BOOKED', 'VISITED', 'CONVERTED', 'LOST'].map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </select>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm">
            <input type="checkbox" name="dueOnly" value="true" defaultChecked={params.dueOnly === 'true'} className="h-3.5 w-3.5 rounded border-stone-300 text-brand-600" />
            Follow-up due
          </label>
          <button type="submit" className="h-9 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
            Apply
          </button>
        </form>

        {leads.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No leads here"
            description="Enquiries from Instagram, WhatsApp or a phone call belong here, so you can see which channel pays."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Phone</TH>
                  <TH>Source</TH>
                  <TH>Status</TH>
                  <TH>Follow up</TH>
                  <TH>Added</TH>
                  {canManage ? <TH /> : null}
                </TR>
              </THead>
              <TBody>
                {leads.map((lead) => {
                  const overdue = lead.followUpAt ? new Date(lead.followUpAt) < new Date() : false;
                  return (
                    <TR key={lead.id}>
                      <TD>
                        {lead.convertedCustomerId ? (
                          <Link href={`/customers/${lead.convertedCustomerId}`} className="font-medium text-ink hover:text-brand-700">
                            {lead.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">{lead.name}</span>
                        )}
                      </TD>
                      <TD className="tnum text-ink-muted">{formatPhone(lead.phone)}</TD>
                      <TD className="text-xs capitalize text-ink-muted">{lead.source.replace(/_/g, ' ').toLowerCase()}</TD>
                      <TD>
                        <StatusBadge status={lead.status} />
                      </TD>
                      <TD className={`text-xs ${overdue ? 'font-medium text-rose-600' : 'text-ink-muted'}`}>
                        {lead.followUpAt ? date(lead.followUpAt, 'DD MMM') : '—'}
                      </TD>
                      <TD className="text-xs text-ink-subtle">{fromNow(lead.createdAt)}</TD>
                      {canManage ? (
                        <TD align="right">
                          <LeadActions lead={lead} />
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} basePath="/leads" searchParams={params as Record<string, string | undefined>} />
          </>
        )}
      </Card>
    </>
  );
}
