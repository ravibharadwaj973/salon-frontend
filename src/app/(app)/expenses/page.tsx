import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatTile } from '@/components/ui/display';
import { Pagination, TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { ExpenseEditor } from './expense-editor';
import { date, dayjs, money, percent } from '@/lib/format';
import type { Expense, Money, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Expenses' };
export const dynamic = 'force-dynamic';

interface ExpenseSummary {
  total: Money;
  fixed: Money;
  variable: Money;
  byCategory: { categoryId: string; name: string; isFixed: boolean; amount: Money; count: number }[];
}

interface Category {
  id: string;
  name: string;
  isFixed: boolean;
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string; categoryId?: string }>;
}) {
  const params = await searchParams;
  const from = params.from ?? dayjs().startOf('month').format('YYYY-MM-DD');
  const to = params.to ?? dayjs().format('YYYY-MM-DD');
  const page = Number(params.page ?? 1);

  const [{ data: expenses, meta }, summary, categories, user] = await Promise.all([
    apiFetchList<Expense>('/expenses', { query: { from, to, categoryId: params.categoryId, page, pageSize: 25 } }),
    apiFetchSafe<ExpenseSummary>('/expenses/summary', { query: { from, to } }),
    apiFetchSafe<Category[]>('/expenses/categories'),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  const canManage = user?.permissions.includes('expense.manage') ?? false;
  const total = Number(summary?.total ?? 0);

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`${date(from)} – ${date(to)}`}
        action={canManage ? <ExpenseEditor categories={categories ?? []} /> : null}
      />

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total spend" value={money(summary?.total)} />
        <StatTile label="Fixed costs" value={money(summary?.fixed)} hint="rent, salaries" />
        <StatTile label="Variable costs" value={money(summary?.variable)} hint="products, marketing" />
        <StatTile label="Entries" value={String(meta.total)} />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-3" action="/expenses">
            <input type="date" name="from" defaultValue={from} className="h-9 rounded-lg border border-stone-300 px-3 text-sm shadow-sm" />
            <input type="date" name="to" defaultValue={to} className="h-9 rounded-lg border border-stone-300 px-3 text-sm shadow-sm" />
            <select name="categoryId" defaultValue={params.categoryId ?? ''} className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm">
              <option value="">All categories</option>
              {(categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
              Apply
            </button>
          </form>

          {expenses.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No expenses recorded"
              description="Rent, salaries, product purchases and marketing all belong here — they are what turn revenue into profit."
            />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Category</TH>
                    <TH>Vendor</TH>
                    <TH>Paid by</TH>
                    <TH align="right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {expenses.map((expense) => (
                    <TR key={expense.id}>
                      <TD className="text-xs text-ink-muted">{date(expense.expenseDate, 'DD MMM')}</TD>
                      <TD>
                        <span className="text-ink">{expense.category.name}</span>
                        {expense.category.isFixed ? <Badge className="ml-2">Fixed</Badge> : null}
                      </TD>
                      <TD className="text-ink-muted">{expense.vendor ?? '—'}</TD>
                      <TD className="text-xs capitalize text-ink-muted">
                        {expense.paymentMode.replace(/_/g, ' ').toLowerCase()}
                      </TD>
                      <TD align="right" className="font-medium">
                        {money(expense.amount)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} basePath="/expenses" searchParams={params as Record<string, string | undefined>} />
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Where the money went" subtitle="Share of spend this period" />
          <CardBody>
            {summary && summary.byCategory.length > 0 ? (
              <ul className="space-y-3">
                {summary.byCategory.map((row) => {
                  const share = total > 0 ? (Number(row.amount) / total) * 100 : 0;
                  return (
                    <li key={row.categoryId}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-ink">{row.name}</span>
                        <span className="tnum font-medium text-ink">{money(row.amount)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                          <div
                            className={`h-full rounded-full ${row.isFixed ? 'bg-stone-400' : 'bg-brand-400'}`}
                            style={{ width: `${Math.max(2, share)}%` }}
                          />
                        </div>
                        <span className="tnum w-10 text-right text-2xs text-ink-subtle">{percent(share, 0)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-ink-subtle">Nothing recorded in this period.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
