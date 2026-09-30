import { PermissionGate } from '@/components/permission-gate';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Upload, UserPlus, Users, X } from 'lucide-react';
import { apiFetchListAllowed } from '@/lib/api';
import { Card, EmptyState, PageHeader, StatusBadge, Avatar } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { Pagination, TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { fromNow, fullName, money, phone as formatPhone } from '@/lib/format';
import { NewCustomerButton } from './new-customer-button';
import { CustomerFilters, lapsedCutoff } from './customer-filters';
import type { Customer } from '@/lib/types';

export const metadata: Metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; tier?: string; lapsed?: string; sortBy?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);

  // "Lapsed" is the win-back working list. The number of days lives beside the
  // label that promises it, so the list, the label and the CSV cannot disagree.
  const cutoff = lapsedCutoff();

  const result = await apiFetchListAllowed<Customer>('/customers', {
    query: {
      q: params.q,
      tier: params.tier,
      page,
      pageSize: 25,
      sortBy: params.sortBy ?? (params.lapsed === 'true' ? 'totalSpent' : 'createdAt'),
      sortDir: 'desc',
      ...(params.lapsed === 'true' ? { lastVisitBefore: cutoff, minVisits: 1 } : {}),
    },
  });

  if (!result) {
    return <PermissionGate permission="customer.view" what="The customer book is restricted." />;
  }

  const { data: customers, meta } = result;

  // A search, a tier or the lapsed toggle — any of them means this is a
  // filtered view rather than the whole book, and the empty state must say so.
  const filtered = Boolean(params.q || params.tier || params.lapsed === 'true');

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${meta.total.toLocaleString('en-IN')} in your book`}
        action={
          <>
            <ButtonLink href="/customers/import" variant="secondary" size="md">
              <Upload className="h-4 w-4" />
              Import
            </ButtonLink>
            <NewCustomerButton />
          </>
        }
      />

      <Card>
        <CustomerFilters q={params.q ?? ''} tier={params.tier ?? ''} lapsed={params.lapsed === 'true'} />

        {customers.length === 0 ? (
          /**
           * AN EMPTY RESULT WITH A FILTER ON IS NOT AN EMPTY BOOK.
           *
           * "No customer matches that" was shown whether the search had found
           * nothing or a tier and the lapsed checkbox were quietly excluding
           * everyone — and the only thing offered either way was Import, which
           * for somebody who already has ten thousand customers reads as the app
           * having lost them. Say which filters are running, and give the way
           * back out as the action.
           */
          <EmptyState
            icon={Users}
            title={filtered ? 'Nothing matches those filters' : 'No customers yet'}
            description={
              filtered
                ? `Nobody in the book matches ${describeFilters(params)}. Searching covers every branch you can see, so a customer registered at another shop will still turn up here.`
                : 'Add your first customer, or import your existing book from a CSV.'
            }
            action={
              filtered ? (
                <ButtonLink href="/customers" variant="secondary" size="sm">
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </ButtonLink>
              ) : (
                <ButtonLink href="/customers/import" variant="secondary" size="sm">
                  <Upload className="h-3.5 w-3.5" />
                  Import customers
                </ButtonLink>
              )
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>Phone</TH>
                  <TH>Tier</TH>
                  <TH align="right">Visits</TH>
                  <TH align="right">Lifetime</TH>
                  <TH align="right">Avg bill</TH>
                  <TH align="right">Points</TH>
                  <TH>Last visit</TH>
                </TR>
              </THead>
              <TBody>
                {customers.map((customer) => (
                  <TR key={customer.id}>
                    <TD>
                      <Link href={`/customers/${customer.id}`} className="flex items-center gap-2.5">
                        <Avatar name={fullName(customer)} id={customer.id} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink hover:text-brand-700">
                            {fullName(customer)}
                          </span>
                          {customer.code ? <span className="block text-2xs text-ink-subtle">{customer.code}</span> : null}
                        </span>
                      </Link>
                    </TD>
                    <TD className="tnum text-ink-muted">{formatPhone(customer.phone)}</TD>
                    <TD>
                      <StatusBadge status={customer.tier} />
                    </TD>
                    <TD align="right">{customer.totalVisits}</TD>
                    <TD align="right" className="font-medium">
                      {money(customer.totalSpent)}
                    </TD>
                    <TD align="right" className="text-ink-muted">
                      {money(customer.avgBill)}
                    </TD>
                    <TD align="right" className="text-ink-muted">
                      {customer.loyaltyPoints}
                    </TD>
                    <TD className="text-xs text-ink-muted">
                      {customer.lastVisitAt ? fromNow(customer.lastVisitAt) : 'never'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            <Pagination
              page={meta.page}
              pageSize={meta.pageSize}
              total={meta.total}
              basePath="/customers"
              searchParams={params as Record<string, string | undefined>}
            />
          </>
        )}
      </Card>

      {params.lapsed === 'true' && customers.length > 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <UserPlus className="h-4 w-4 shrink-0" />
          These customers have not been in for 45+ days. Build a segment from this list and send a win-back offer —{' '}
          <Link href="/segments" className="font-medium underline">
            create a segment
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}

/**
 * The running filters, in the words on the screen.
 *
 * Named rather than counted: "2 filters" tells somebody there is a problem
 * without telling them where it is, and the tier select in particular is easy
 * to leave set and never look at again.
 */
function describeFilters(params: { q?: string; tier?: string; lapsed?: string }): string {
  const parts: string[] = [];
  if (params.q) parts.push(`“${params.q}”`);
  if (params.tier) parts.push(`${params.tier[0]}${params.tier.slice(1).toLowerCase()} tier`);
  if (params.lapsed === 'true') parts.push('lapsed');
  if (parts.length <= 1) return parts[0] ?? 'those filters';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
