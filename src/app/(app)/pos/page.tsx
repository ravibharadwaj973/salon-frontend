import type { Metadata } from 'next';
import { apiFetch, apiFetchList, apiFetchSafe } from '@/lib/api';
import { PageHeader } from '@/components/ui/display';
import { PosTerminal } from './pos-terminal';
import type { Appointment, BillingDefaults, MembershipPlan, Product, Service, SessionUser, Staff } from '@/lib/types';

export const metadata: Metadata = { title: 'New bill' };
export const dynamic = 'force-dynamic';

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; appointmentId?: string }>;
}) {
  const params = await searchParams;

  const [user, serviceGroups, products, membershipPlans, staff, appointment, billing] = await Promise.all([
    apiFetch<SessionUser>('/auth/me', { noBranch: true }),
    apiFetchSafe<{ id: string; name: string; services: Service[] }[]>('/services/menu'),
    apiFetchList<Product>('/inventory/products', { query: { isRetail: 'true', pageSize: 100 } }).catch(() => null),
    // Plans on a feature the salon's plan does not include come back as a 403 → null → no tab.
    apiFetchSafe<MembershipPlan[]>('/memberships/plans', { query: { activeOnly: 'true' } }),
    apiFetchList<Staff>('/staff', { query: { isActive: 'true', pageSize: 100 } }).catch(() => null),
    params.appointmentId
      ? apiFetchSafe<Appointment>(`/appointments/${params.appointmentId}`)
      : Promise.resolve(null),
    apiFetchSafe<BillingDefaults>('/invoices/billing-defaults', { noBranch: true }),
  ]);

  return (
    <>
      <PageHeader
        title="New bill"
        description="Take the money at the counter, then record it here. Nothing is charged automatically."
      />
      <PosTerminal
        serviceGroups={serviceGroups ?? []}
        products={products?.data ?? []}
        membershipPlans={membershipPlans ?? []}
        staff={staff?.data ?? []}
        appointment={appointment}
        initialCustomerId={params.customerId ?? appointment?.customerId ?? null}
        canDiscount={user.permissions.includes('invoice.discount')}
        billing={billing ?? { gstByDefault: true, hasGstin: true, pricesIncludeTax: true, defaultGstRate: 18, canChooseGst: false }}
      />
    </>
  );
}
