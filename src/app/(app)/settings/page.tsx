import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, MapPin, Users } from 'lucide-react';
import { apiFetchList, apiFetchSafe } from '@/lib/api';
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui/display';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { NewUserButton } from './new-user-button';
import { ProfileLayoutEditor } from './profile-layout-editor';
import { BillingDefaultsCard } from './billing-defaults-card';
import { GoogleReviewCard } from './google-review-card';
import { BookingEmbedCard } from './booking-embed-card';
import { BookingCapacityCard } from './booking-capacity-card';
import { UserPermissionsButton } from './user-permissions-button';
import { date, fromNow, phone as formatPhone } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/permissions';
import { bookingPageUrl, embedScriptUrl } from '@/lib/public-urls';
import type { BranchSummary, PageLayout, SessionUser, UserRole } from '@/lib/types';
import { LogoCard } from './logo-card';
import { WebsiteCard } from './website-card';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

interface Tenant {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  slug: string;
  legalName: string | null;
  gstin: string | null;
  phone: string;
  email: string;
  city: string | null;
  state: string | null;
  currency: string;
  timezone: string;
  status: string;
  plan: { name: string; code: string } | null;
  settings: Record<string, unknown>;
  _count?: { branches: number; users: number; customers: number };
}

interface Branch extends BranchSummary {
  city: string | null;
  phone: string | null;
  gstin: string | null;
  isActive: boolean;
  invoicePrefix: string;
  googleReviewUrl: string | null;
  maxConcurrentBookings: number | null;
  _count?: { staff: number; resources: number };
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  avatarUrl: string | null;
  branches: { branch: BranchSummary }[];
}

const TABS = [
  { key: 'salon', label: 'Salon' },
  { key: 'branches', label: 'Branches' },
  { key: 'team', label: 'Team' },
  { key: 'profile', label: 'Who sees what' },
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = TABS.find((item) => item.key === params.tab)?.key ?? 'salon';

  const [tenant, branches, team, user, layouts] = await Promise.all([
    apiFetchSafe<Tenant>('/tenant', { noBranch: true }),
    apiFetchList<Branch>('/branches', { query: { pageSize: 50 } }).catch(() => null),
    apiFetchList<TeamMember>('/users', { query: { pageSize: 50 } }).catch(() => null),
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
    tab === 'profile' ? apiFetchSafe<PageLayout[]>('/layouts', { noBranch: true }) : Promise.resolve(null),
  ]);

  const canManageUsers = user?.permissions.includes('user.manage') ?? false;
  const canManageBranches = user?.permissions.includes('branch.manage') ?? false;
  const tenantGoogleReviewUrl =
    typeof tenant?.settings?.googleReviewUrl === 'string' ? (tenant.settings.googleReviewUrl as string) : null;

  return (
    <>
      <PageHeader title="Settings" description={tenant?.name} />

      <div className="mb-5 flex w-fit rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/settings?tab=${item.key}`}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === item.key ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}

        {/* A separate route rather than a tab on this page, but it belongs in
            the same row: from a salon owner's point of view "how messages go
            out" is a setting like any other, and until this link existed the
            page was reachable only by typing the URL. */}
        <Link
          href="/settings/messaging"
          className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
        >
          Messaging
        </Link>

        {/* Owner only, and the page says so rather than the link hiding — an
            owner looking for where GST lives should not have to guess, and a
            manager should learn why they cannot change it rather than never
            find out it exists. */}
        <Link
          href="/settings/tax"
          className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
        >
          Tax &amp; invoices
        </Link>
      </div>

      {tab === 'salon' ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Salon details" subtitle="Used on every invoice and message" />
            <CardBody className="space-y-2.5">
              <Row label="Name" value={tenant?.name} />
              <Row label="Legal name" value={tenant?.legalName} />
              <Row label="GSTIN" value={tenant?.gstin} mono />
              <Row label="Phone" value={formatPhone(tenant?.phone)} />
              <Row label="Email" value={tenant?.email} />
              <Row label="City" value={[tenant?.city, tenant?.state].filter(Boolean).join(', ')} />
              <Row label="Currency" value={tenant?.currency} />
              <Row label="Timezone" value={tenant?.timezone} />
              <Row label="Plan" value={tenant?.plan?.name ?? 'No plan'} />
              <Row label="Status" value={tenant?.status} />
            </CardBody>
          </Card>

          <div className="space-y-5">
            {tenant ? (
              <LogoCard
                logoUrl={tenant.logoUrl}
                salonName={tenant.name}
                canEdit={user?.permissions.includes('tenant.manage') ?? false}
              />
            ) : null}

            {tenant ? (
              <BookingEmbedCard
                salonName={tenant.name}
                bookingUrl={bookingPageUrl(tenant.slug)}
                embedSrc={embedScriptUrl(tenant.slug)}
              />
            ) : null}

            <BookingCapacityCard
              branches={(branches?.data ?? []).map((branch) => ({
                id: branch.id,
                name: branch.name,
                city: branch.city,
                maxConcurrentBookings: branch.maxConcurrentBookings,
              }))}
              canEdit={user?.permissions.includes('branch.manage') ?? false}
            />

            <BillingDefaultsCard
              settings={tenant?.settings ?? {}}
              gstin={tenant?.gstin ?? null}
              canEdit={user?.permissions.includes('tenant.manage') ?? false}
            />
            <p className="px-1 text-2xs leading-relaxed text-ink-subtle">
              Payments are recorded by hand at the counter. There is no payment gateway connected to this system.
            </p>
          </div>
        </div>
      ) : null}

      {tab === 'branches' ? (
        <div className="space-y-5">
        <Card>
          <CardHeader title="Branches" subtitle={`${branches?.meta.total ?? 0} in this salon`} />
          {!branches || branches.data.length === 0 ? (
            <EmptyState icon={MapPin} title="No branches" description="Every salon needs at least one branch." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Branch</TH>
                  <TH>Code</TH>
                  <TH>City</TH>
                  <TH>Phone</TH>
                  <TH>Invoice prefix</TH>
                  <TH align="right">Staff</TH>
                  <TH align="right">Chairs</TH>
                  <TH>Reviews</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {branches.data.map((branch) => (
                  <TR key={branch.id}>
                    <TD className="font-medium text-ink">{branch.name}</TD>
                    <TD className="font-mono text-xs text-ink-muted">{branch.code}</TD>
                    <TD className="text-ink-muted">{branch.city ?? '—'}</TD>
                    <TD className="tnum text-ink-muted">{formatPhone(branch.phone)}</TD>
                    <TD className="font-mono text-xs text-ink-muted">{branch.invoicePrefix}</TD>
                    <TD align="right" className="text-ink-muted">{branch._count?.staff ?? 0}</TD>
                    <TD align="right" className="text-ink-muted">{branch._count?.resources ?? 0}</TD>
                    <TD>
                      {branch.googleReviewUrl ? (
                        <Badge tone="success">Google link set</Badge>
                      ) : tenantGoogleReviewUrl ? (
                        <Badge>Salon-wide link</Badge>
                      ) : (
                        <Badge tone="warning">No link</Badge>
                      )}
                    </TD>
                    <TD>{branch.isActive ? <Badge tone="success">Active</Badge> : <Badge>Closed</Badge>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <GoogleReviewCard
          branches={(branches?.data ?? []).map((branch) => ({
            id: branch.id,
            name: branch.name,
            city: branch.city,
            googleReviewUrl: branch.googleReviewUrl ?? null,
          }))}
          tenantFallback={tenantGoogleReviewUrl}
          canEdit={canManageBranches}
          canEditFallback={user?.permissions.includes('tenant.manage') ?? false}
        />

        <WebsiteCard
          initial={tenant?.websiteUrl ?? null}
          canEdit={user?.permissions.includes('tenant.manage') ?? false}
        />
        </div>
      ) : null}

      {tab === 'team' ? (
        <Card>
          <CardHeader
            title="Team logins"
            subtitle="What each person can see and do is decided by their role"
            action={canManageUsers ? <NewUserButton branches={user?.branches ?? []} /> : null}
          />
          {!team || team.data.length === 0 ? (
            <EmptyState icon={Users} title="No team logins yet" description="Add a login for each person who uses the software." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Branches</TH>
                  <TH>Last signed in</TH>
                  <TH>Status</TH>
                  {canManageUsers ? <TH align="right">&nbsp;</TH> : null}
                </TR>
              </THead>
              <TBody>
                {team.data.map((member) => (
                  <TR key={member.id}>
                    <TD>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={member.name} src={member.avatarUrl} id={member.id} size="sm" />
                        <span className="font-medium text-ink">{member.name}</span>
                      </span>
                    </TD>
                    <TD className="text-ink-muted">{member.email}</TD>
                    <TD>
                      <Badge tone={member.role === 'OWNER' ? 'brand' : 'neutral'}>
                        {ROLE_LABEL[member.role] ?? member.role}
                      </Badge>
                    </TD>
                    <TD className="text-xs text-ink-muted">
                      {member.branches.length === 0
                        ? 'All branches'
                        : member.branches.map((entry) => entry.branch.name).join(', ')}
                    </TD>
                    <TD className="text-xs text-ink-subtle">
                      {member.lastLoginAt ? fromNow(member.lastLoginAt) : 'never'}
                    </TD>
                    <TD>{member.isActive ? <Badge tone="success">Active</Badge> : <Badge>Disabled</Badge>}</TD>
                    {canManageUsers ? (
                      <TD align="right">
                        <UserPermissionsButton userId={member.id} name={member.name} role={member.role} />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === 'profile' ? (
        layouts && layouts.length > 0 ? (
          layouts[0]!.canManage ? (
            <div className="space-y-5">
              <p className="max-w-3xl text-xs leading-relaxed text-ink-muted">
                Two rules decide what a person sees: their role&rsquo;s permissions (what the system will serve them at all) and
                your choices here (what you want shown). You can narrow, never widen &mdash; to give someone more, change their
                permissions on the Team tab.
              </p>
              {layouts.map((layout) => (
                <ProfileLayoutEditor key={layout.page} layout={layout} />
              ))}
            </div>
          ) : (
            <Card>
              <CardBody>
                <p className="text-sm text-ink-muted">Only the owner can change what each role sees.</p>
              </CardBody>
            </Card>
          )
        ) : (
          <Card>
            <CardBody>
              <p className="text-sm text-ink-muted">Could not load the page layouts.</p>
            </CardBody>
          </Card>
        )
      ) : null}

      {tab === 'salon' && tenant?._count ? (
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-subtle">
          <Building2 className="h-3.5 w-3.5" />
          {tenant._count.branches} branches · {tenant._count.users} logins · {tenant._count.customers} customers
        </p>
      ) : null}
    </>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-2 last:border-b-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={`text-right text-sm text-ink ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</span>
    </div>
  );
}
