import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Boxes, PackageSearch } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatTile } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { StockAdjuster } from './stock-adjuster';
import { date, money } from '@/lib/format';
import type { Money, Product, PurchaseOrder, SessionUser, StockRow } from '@/lib/types';

export const metadata: Metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

interface Valuation {
  lines: number;
  costValue: Money;
  retailValue: Money;
  potentialMargin: Money;
}

interface LowStock {
  productId: string;
  name: string;
  branch: { id: string; name: string };
  quantity: Money;
  unit: string;
  reorderLevel: Money;
  shortfall: Money;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ lowOnly?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === 'orders' ? 'orders' : 'stock';

  const [stock, valuation, lowStock, orders, products, user] = await Promise.all([
    apiFetchList<StockRow>('/inventory/stock', { query: { pageSize: 100, lowOnly: params.lowOnly } }).catch(() => null),
    apiFetchSafe<Valuation>('/inventory/stock/valuation'),
    apiFetchSafe<LowStock[]>('/inventory/stock/low'),
    apiFetchList<PurchaseOrder>('/inventory/purchase-orders', { query: { pageSize: 25 } }).catch(() => null),
    apiFetchList<Product>('/inventory/products', { query: { pageSize: 200 } }).catch(() => null),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  const canManage = user?.permissions.includes('inventory.manage') ?? false;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Colour, developer and retail stock. Service consumption is deducted automatically when a bill is created."
        action={canManage ? <StockAdjuster products={products?.data ?? []} /> : null}
      />

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Stock value (cost)" value={money(valuation?.costValue)} hint={`${valuation?.lines ?? 0} lines`} />
        <StatTile label="Retail value" value={money(valuation?.retailValue)} />
        <StatTile label="Potential margin" value={money(valuation?.potentialMargin)} tone="positive" />
        <StatTile
          label="Below reorder level"
          value={String(lowStock?.length ?? 0)}
          tone={(lowStock?.length ?? 0) > 0 ? 'negative' : 'neutral'}
          href="/inventory?lowOnly=true"
        />
      </section>

      {lowStock && lowStock.length > 0 && params.lowOnly !== 'true' ? (
        <Card className="mb-5 border-amber-200 bg-amber-50/50">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5" />
              Running low
            </span>
            {lowStock.slice(0, 6).map((item) => (
              <span key={`${item.productId}-${item.branch.id}`} className="text-xs text-amber-800">
                {item.name}{' '}
                <span className="tnum font-medium">
                  {Number(item.quantity)}
                  {item.unit}
                </span>
              </span>
            ))}
            {lowStock.length > 6 ? (
              <Link href="/inventory?lowOnly=true" className="text-xs font-medium text-amber-900 underline">
                +{lowStock.length - 6} more
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="mb-4 flex w-fit rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm">
        {[
          { key: 'stock', label: 'Stock on hand' },
          { key: 'orders', label: 'Purchase orders' },
        ].map((item) => (
          <Link
            key={item.key}
            href={`/inventory?tab=${item.key}`}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === item.key ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {tab === 'stock' ? (
        <Card>
          <CardHeader
            title={params.lowOnly === 'true' ? 'Products below reorder level' : 'Stock on hand'}
            action={
              params.lowOnly === 'true' ? (
                <Link href="/inventory" className="text-xs font-medium text-brand-700 hover:underline">
                  Show all
                </Link>
              ) : null
            }
          />
          {!stock || stock.data.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No stock recorded"
              description="Add products, then receive a purchase order to bring stock in."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Brand</TH>
                  <TH>Branch</TH>
                  <TH align="right">On hand</TH>
                  <TH align="right">Reorder at</TH>
                  <TH align="right">Value</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {stock.data.map((row) => (
                  <TR key={`${row.productId}-${row.branch.id}`}>
                    <TD>
                      <span className="font-medium text-ink">{row.productName}</span>
                      {row.shade ? <span className="ml-1 text-xs text-ink-subtle">({row.shade})</span> : null}
                    </TD>
                    <TD className="text-xs text-ink-muted">{row.brand ?? '—'}</TD>
                    <TD className="text-xs text-ink-muted">{row.branch.name}</TD>
                    <TD align="right" className={row.isLow ? 'font-medium text-amber-700' : ''}>
                      {Number(row.quantity)} {row.unit}
                    </TD>
                    <TD align="right" className="text-ink-subtle">
                      {Number(row.reorderLevel) || '—'}
                    </TD>
                    <TD align="right" className="text-ink-muted">
                      {money(row.value)}
                    </TD>
                    <TD>{row.isLow ? <Badge tone="warning">Low</Badge> : null}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="Purchase orders" subtitle="Receiving an order is what moves stock in" />
          {!orders || orders.data.length === 0 ? (
            <EmptyState icon={PackageSearch} title="No purchase orders yet" description="Raise one against a supplier to restock." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>PO number</TH>
                  <TH>Supplier</TH>
                  <TH>Ordered</TH>
                  <TH align="right">Items</TH>
                  <TH align="right">Value</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {orders.data.map((order) => (
                  <TR key={order.id}>
                    <TD className="font-mono text-xs font-medium text-ink">{order.poNumber}</TD>
                    <TD className="text-ink-muted">{order.supplier.name}</TD>
                    <TD className="text-xs text-ink-muted">{date(order.orderedAt, 'DD MMM')}</TD>
                    <TD align="right" className="text-ink-muted">
                      {order._count?.items ?? order.items?.length ?? 0}
                    </TD>
                    <TD align="right" className="font-medium">
                      {money(order.totalAmount)}
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          order.status === 'RECEIVED'
                            ? 'success'
                            : order.status === 'CANCELLED'
                              ? 'neutral'
                              : order.status === 'PARTIALLY_RECEIVED'
                                ? 'warning'
                                : 'info'
                        }
                      >
                        {order.status.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
