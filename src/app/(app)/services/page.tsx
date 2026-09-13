import type { Metadata } from 'next';
import { Scissors } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { ServiceEditor } from './service-editor';
import { duration, money, percent } from '@/lib/format';
import type { Service, ServiceCategory, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Services' };
export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const [{ data: services }, categories, user] = await Promise.all([
    apiFetchList<Service>('/services', { query: { pageSize: 200, sortBy: 'name', sortDir: 'asc' } }),
    apiFetchSafe<ServiceCategory[]>('/services/categories'),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
  ]);

  const canManage = user?.permissions.includes('service.manage') ?? false;
  const grouped = new Map<string, Service[]>();
  for (const service of services) {
    const key = service.category?.name ?? 'Uncategorised';
    grouped.set(key, [...(grouped.get(key) ?? []), service]);
  }

  return (
    <>
      <PageHeader
        title="Services"
        description={`${services.length} services across ${grouped.size} categories`}
        action={canManage ? <ServiceEditor categories={categories ?? []} /> : null}
      />

      {services.length === 0 ? (
        <Card>
          <EmptyState
            icon={Scissors}
            title="No services yet"
            description="Add your menu — prices, duration and commission drive the calendar, the bill and staff payouts."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {[...grouped.entries()].map(([category, list]) => (
            <Card key={category}>
              <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
                <h2 className="text-sm font-semibold text-ink">{category}</h2>
                <span className="text-xs text-ink-subtle">{list.length} services</span>
              </div>
              <Table>
                <THead>
                  <TR>
                    <TH>Service</TH>
                    <TH>For</TH>
                    <TH align="right">Duration</TH>
                    <TH align="right">Price</TH>
                    <TH align="right">Member price</TH>
                    <TH align="right">Commission</TH>
                    <TH>Online</TH>
                    {canManage ? <TH /> : null}
                  </TR>
                </THead>
                <TBody>
                  {list.map((service) => (
                    <TR key={service.id}>
                      <TD>
                        <span className="font-medium text-ink">{service.name}</span>
                        {!service.isActive ? <Badge className="ml-2">Inactive</Badge> : null}
                      </TD>
                      <TD className="text-xs capitalize text-ink-muted">{service.gender.toLowerCase()}</TD>
                      <TD align="right" className="text-ink-muted">
                        {duration(service.durationMin)}
                        {service.bufferMin > 0 ? <span className="text-ink-subtle"> +{service.bufferMin}m</span> : null}
                      </TD>
                      <TD align="right" className="font-medium">
                        {money(service.price)}
                      </TD>
                      <TD align="right" className="text-ink-muted">
                        {service.memberPrice ? money(service.memberPrice) : '—'}
                      </TD>
                      <TD align="right" className="text-ink-muted">
                        {Number(service.commissionRate) > 0 ? percent(Number(service.commissionRate), 0) : '—'}
                      </TD>
                      <TD>
                        {service.onlineBookable ? <Badge tone="success">Bookable</Badge> : <Badge>In-salon only</Badge>}
                      </TD>
                      {canManage ? (
                        <TD align="right">
                          <ServiceEditor categories={categories ?? []} service={service} compact />
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
