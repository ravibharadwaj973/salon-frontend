import type { Metadata } from 'next';
import Link from 'next/link';
import { Gift } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { date, fullName, money } from '@/lib/format';
import type { PackagePurchase, PackageTemplate } from '@/lib/types';

export const metadata: Metadata = { title: 'Packages' };
export const dynamic = 'force-dynamic';

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === 'purchases' ? 'purchases' : 'templates';

  const [templates, purchases] = await Promise.all([
    apiFetchSafe<PackageTemplate[]>('/packages'),
    apiFetchList<PackagePurchase>('/packages/purchases', { query: { pageSize: 50, status: 'ACTIVE' } }).catch(() => null),
  ]);

  return (
    <>
      <PageHeader
        title="Packages"
        description="Prepaid bundles. Sessions are deducted automatically when they are redeemed on a bill."
      />

      <div className="mb-4 flex rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm w-fit">
        {[
          { key: 'templates', label: 'Packages on sale' },
          { key: 'purchases', label: 'Sold & in use' },
        ].map((item) => (
          <Link
            key={item.key}
            href={`/packages?tab=${item.key}`}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === item.key ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {tab === 'templates' ? (
        !templates || templates.length === 0 ? (
          <Card>
            <EmptyState
              icon={Gift}
              title="No packages yet"
              description="A package is money up front and a reason to come back — for example 5 haircuts + 2 spas for ₹5,000."
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardHeader
                  title={template.name}
                  subtitle={`Valid ${template.validityDays} days`}
                  action={template.isActive ? <Badge tone="success">On sale</Badge> : <Badge>Retired</Badge>}
                />
                <div className="p-5">
                  <p className="tnum text-2xl font-semibold text-ink">{money(template.price)}</p>
                  {template.description ? (
                    <p className="mt-1 text-xs text-ink-muted">{template.description}</p>
                  ) : null}

                  <ul className="mt-4 space-y-1.5">
                    {template.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-ink-muted">{item.service.name}</span>
                        <span className="tnum font-medium text-ink">×{item.quantity}</span>
                      </li>
                    ))}
                  </ul>

                  {template._count ? (
                    <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-ink-subtle">
                      Sold {template._count.purchases} times
                    </p>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card>
          {!purchases || purchases.data.length === 0 ? (
            <EmptyState icon={Gift} title="No active packages" description="Sell one from the POS screen when billing a customer." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>Package</TH>
                  <TH>Sessions left</TH>
                  <TH align="right">Paid</TH>
                  <TH>Expires</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {purchases.data.map((purchase) => {
                  const remaining = purchase.items.reduce((sum, item) => sum + (item.totalQty - item.usedQty), 0);
                  const total = purchase.items.reduce((sum, item) => sum + item.totalQty, 0);
                  const expiringSoon = new Date(purchase.expiresAt).getTime() - Date.now() < 15 * 24 * 60 * 60 * 1000;

                  return (
                    <TR key={purchase.id}>
                      <TD>
                        {purchase.customer ? (
                          <Link href={`/customers/${purchase.customer.id}`} className="font-medium text-ink hover:text-brand-700">
                            {fullName(purchase.customer)}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TD>
                      <TD className="text-ink-muted">{purchase.template.name}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-100">
                            <div
                              className="h-full rounded-full bg-brand-500"
                              style={{ width: `${total ? ((total - remaining) / total) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="tnum text-xs text-ink-muted">
                            {remaining} of {total}
                          </span>
                        </div>
                      </TD>
                      <TD align="right">{money(purchase.price)}</TD>
                      <TD className={`text-xs ${expiringSoon ? 'font-medium text-amber-700' : 'text-ink-muted'}`}>
                        {date(purchase.expiresAt)}
                      </TD>
                      <TD>
                        <StatusBadge status={purchase.status} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
