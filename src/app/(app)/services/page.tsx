import type { Metadata } from 'next';
import { Scissors } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { ServiceEditor } from './service-editor';
import { CategoryEditor } from './category-editor';
import { duration, money, percent } from '@/lib/format';
import type { BillingDefaults, Service, ServiceCategory, SessionUser } from '@/lib/types';

export const metadata: Metadata = { title: 'Services' };
export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const [{ data: services }, categories, user, billing] = await Promise.all([
    apiFetchList<Service>('/services', { query: { pageSize: 200, sortBy: 'name', sortDir: 'asc' } }),
    apiFetchSafe<ServiceCategory[]>('/services/categories'),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
    // Only to label the "same as the salon" option on the price editor. A 403
    // for somebody who may edit services but not bill falls back to the common
    // case rather than taking the page down.
    apiFetchSafe<BillingDefaults>('/invoices/billing-defaults', { noBranch: true }),
  ]);

  const salonPricesIncludeTax = billing?.pricesIncludeTax ?? true;

  const canManage = user?.permissions.includes('service.manage') ?? false;

  /**
   * Built from the CATEGORIES, not from the services.
   *
   * Grouping the services was simpler and had one bad consequence: a category
   * with nothing in it did not exist on this page. So somebody who had just
   * made "Bridal" saw no sign of it, and the obvious conclusion — that adding
   * it had failed — is the wrong one. A category is a thing the salon owns
   * whether or not it has been filled in yet.
   *
   * Uncategorised comes last, and only when there is something in it, because
   * it is not a category anybody chose.
   */
  const uncategorised = services.filter((service) => !service.category);
  const groups: { category: ServiceCategory | null; list: Service[] }[] = [
    ...(categories ?? []).map((category) => ({
      category,
      list: services.filter((service) => service.category?.id === category.id),
    })),
    ...(uncategorised.length > 0 ? [{ category: null, list: uncategorised }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Services"
        description={`${services.length} services across ${(categories ?? []).length} categories`}
        action={
          canManage ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <CategoryEditor />
              <ServiceEditor categories={categories ?? []} salonPricesIncludeTax={salonPricesIncludeTax} />
            </div>
          ) : null
        }
      />

      {services.length === 0 && (categories ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={Scissors}
            title="No services yet"
            description="Add your menu — prices, duration and commission drive the calendar, the bill and staff payouts."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map(({ category, list }) => (
            <Card key={category?.id ?? 'uncategorised'}>
              <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3">
                <div className="flex min-w-0 items-center gap-1">
                  <h2 className="truncate text-sm font-semibold text-ink">
                    {category?.name ?? 'Uncategorised'}
                  </h2>
                  {/* Renaming a category renames the section on the salon's
                      own website, so the control belongs beside the name
                      rather than on a settings screen somewhere else. */}
                  {canManage && category ? <CategoryEditor category={category} compact /> : null}
                  {category && !category.isActive ? (
                    <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-2xs text-ink-muted">Hidden</span>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-ink-subtle">
                  {list.length === 1 ? '1 service' : `${list.length} services`}
                </span>
              </div>
              {list.length === 0 ? (
                /* A category somebody has just made. A bare table of headers
                   reads as a fault; a sentence reads as a next step. */
                <p className="px-5 py-4 text-xs text-ink-muted">
                  Nothing in here yet. Add a service and choose{' '}
                  <span className="font-medium text-ink">{category?.name}</span> as its category.
                </p>
              ) : (
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
                          <ServiceEditor
                            categories={categories ?? []}
                            service={service}
                            salonPricesIncludeTax={salonPricesIncludeTax}
                            compact
                          />
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
