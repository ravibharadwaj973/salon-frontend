import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Card, EmptyState, PageHeader, StatTile, StatusBadge } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { Pagination, TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { date, fullName, money, time } from '@/lib/format';
import type { Invoice, Money } from '@/lib/types';
import { InvoiceFilters } from './invoice-filters';

export const metadata: Metadata = { title: 'Invoices' };
export const dynamic = 'force-dynamic';

interface Collections {
  invoices: number;
  billed: Money;
  collected: Money;
  outstanding: Money;
  refunds: Money;
  byMode: { mode: string; amount: Money; count: number }[];
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; unpaidOnly?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);

  const [{ data: invoices, meta }, collections] = await Promise.all([
    apiFetchList<Invoice & { _count?: { items: number } }>('/invoices', {
      query: {
        q: params.q,
        status: params.status,
        unpaidOnly: params.unpaidOnly,
        from: params.from,
        to: params.to,
        page,
        pageSize: 25,
      },
    }),
    apiFetchSafe<Collections>('/invoices/collections'),
  ]);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every bill, and what has actually been collected against it"
        action={
          <ButtonLink href="/pos">
            <Receipt className="h-4 w-4" />
            New bill
          </ButtonLink>
        }
      />

      {collections ? (
        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Billed today" value={money(collections.billed)} hint={`${collections.invoices} bills`} />
          <StatTile label="Collected today" value={money(collections.collected)} tone="positive" />
          <StatTile
            label="Outstanding today"
            value={money(collections.outstanding)}
            tone={Number(collections.outstanding) > 0 ? 'negative' : 'neutral'}
          />
          <StatTile label="Refunds today" value={money(collections.refunds)} />
        </section>
      ) : null}

      {collections && collections.byMode.length > 0 ? (
        <Card className="mb-5">
          <div className="flex flex-wrap gap-x-6 gap-y-2 p-4">
            <span className="text-xs font-semibold text-ink">Cash-up today</span>
            {collections.byMode.map((row) => (
              <span key={row.mode} className="text-xs text-ink-muted">
                {row.mode.replace(/_/g, ' ').toLowerCase()}:{' '}
                <span className="tnum font-medium text-ink">{money(row.amount)}</span>
                <span className="text-ink-subtle"> ({row.count})</span>
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <InvoiceFilters
          q={params.q ?? ''}
          status={params.status ?? ''}
          from={params.from ?? ''}
          to={params.to ?? ''}
          unpaidOnly={params.unpaidOnly === 'true'}
        />

        {invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No invoices here"
            description={params.unpaidOnly === 'true' ? 'Nothing outstanding — everything has been settled.' : 'Bills you create will appear here.'}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Customer</TH>
                  <TH>Date</TH>
                  <TH align="right">Total</TH>
                  <TH align="right">Paid</TH>
                  <TH align="right">Due</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.map((invoice) => (
                  <TR key={invoice.id}>
                    <TD>
                      <Link href={`/invoices/${invoice.id}`} className="font-mono text-xs font-medium text-ink hover:text-brand-700">
                        {invoice.invoiceNumber}
                      </Link>
                    </TD>
                    <TD>
                      {invoice.customer ? (
                        <Link href={`/customers/${invoice.customer.id}`} className="text-ink hover:text-brand-700">
                          {fullName(invoice.customer)}
                        </Link>
                      ) : (
                        <span className="text-ink-subtle">Cash sale</span>
                      )}
                    </TD>
                    <TD className="text-xs text-ink-muted">
                      {date(invoice.invoiceDate, 'DD MMM')} · {time(invoice.invoiceDate)}
                    </TD>
                    <TD align="right" className="font-medium">
                      {money(invoice.grandTotal)}
                    </TD>
                    <TD align="right" className="text-ink-muted">
                      {money(invoice.paidAmount)}
                    </TD>
                    <TD align="right" className={Number(invoice.dueAmount) > 0 ? 'font-medium text-rose-600' : 'text-ink-subtle'}>
                      {Number(invoice.dueAmount) > 0 ? money(invoice.dueAmount) : '—'}
                    </TD>
                    <TD>
                      <StatusBadge status={invoice.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            <Pagination
              page={meta.page}
              pageSize={meta.pageSize}
              total={meta.total}
              basePath="/invoices"
              searchParams={params as Record<string, string | undefined>}
            />
          </>
        )}
      </Card>
    </>
  );
}
