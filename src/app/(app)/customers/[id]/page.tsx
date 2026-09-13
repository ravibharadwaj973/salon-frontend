import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  CalendarPlus,
  Camera,
  Gift,
  Heart,
  Mail,
  MessageCircle,
  Phone,
  Receipt,
  Scissors,
  ShoppingBag,
  Sparkles,
  Star,
} from 'lucide-react';
import { ApiError, apiFetch, apiFetchList, apiFetchSafe } from '@/lib/api';
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, StatusBadge } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { CustomerNotes } from './customer-notes';
import { EditCustomerButton } from './edit-customer-button';
import { date, dateTime, fromNow, fullName, money, phone as formatPhone, time } from '@/lib/format';
import type {
  Appointment,
  CustomerPhoto,
  CustomerProfile,
  Invoice,
  LoyaltyTransaction,
  ProfileSectionKey,
  SessionUser,
  Staff,
} from '@/lib/types';
import { ShareButton } from '@/components/share/share-sheet';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const customer = await apiFetch<CustomerProfile>(`/customers/${(await params).id}`);
    return { title: fullName(customer) };
  } catch {
    return { title: 'Customer' };
  }
}

const EMPTY_PAGE = { page: 1, pageSize: 10, total: 0, totalPages: 0, hasMore: false };

const SOURCE_LABEL: Record<string, string> = {
  WALK_IN: 'Walked in',
  INSTAGRAM: 'Instagram',
  REFERRAL: 'Referred by a customer',
  GOOGLE: 'Google',
  WHATSAPP: 'WhatsApp',
  WEBSITE: 'Website',
  PHONE: 'Phoned',
  OTHER: 'Other',
};

/**
 * One page, many sections — and which ones appear is decided by the API
 * (`customer.sections`), which weighs the person's permissions against the
 * layout the owner set in Settings → Customer profile. The page never
 * fetches data for a section it will not show, so a hidden section costs
 * nothing and leaks nothing.
 */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let customer: CustomerProfile;
  try {
    customer = await apiFetch<CustomerProfile>(`/customers/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const shows = (key: ProfileSectionKey) => customer.sections?.includes(key) ?? true;

  const [user, history, invoices, ledger, photos] = await Promise.all([
    apiFetchSafe<SessionUser>('/auth/me', { noBranch: true }),
    shows('visits')
      ? apiFetchList<Appointment>(`/customers/${id}/history`, { query: { pageSize: 12 } }).catch(() => ({ data: [], meta: EMPTY_PAGE }))
      : Promise.resolve(null),
    shows('purchases')
      ? apiFetchList<Invoice>(`/customers/${id}/invoices`, { query: { pageSize: 10 } }).catch(() => ({ data: [], meta: EMPTY_PAGE }))
      : Promise.resolve(null),
    shows('loyalty')
      ? apiFetchList<LoyaltyTransaction>(`/loyalty/customers/${id}/transactions`, { query: { pageSize: 8 } }).catch(() => null)
      : Promise.resolve(null),
    shows('photos') ? apiFetchSafe<CustomerPhoto[]>(`/customers/${id}/photos`) : Promise.resolve(null),
  ]);

  const canManage = user?.permissions.includes('customer.manage') ?? false;
  const canSetTier = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const staff = canManage
    ? await apiFetchList<Staff>('/staff', { query: { isActive: 'true', pageSize: 100 } }).then((r) => r.data).catch(() => [])
    : [];

  const name = fullName(customer);
  const membership = customer.memberships?.[0] ?? null;

  return (
    <>
      {/* Identity + the actions a receptionist reaches for */}
      <header className="mb-5 flex flex-wrap items-start gap-4">
        <Avatar name={name} id={customer.id} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{name}</h1>
            <StatusBadge status={customer.tier} />
            {customer.stats.isAtRisk ? (
              <Badge tone="warning">
                <AlertTriangle className="h-3 w-3" />
                At risk
              </Badge>
            ) : null}
            {membership ? (
              <Badge tone="brand">
                <Heart className="h-3 w-3" />
                {membership.plan.name}
              </Badge>
            ) : null}
            {customer.isBlacklisted ? (
              <Badge tone="danger">
                <Ban className="h-3 w-3" />
                Blacklisted
              </Badge>
            ) : null}
            {customer.isActive === false ? <Badge>Archived</Badge> : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="tnum flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {formatPhone(customer.phone)}
              {customer.altPhone ? ` · ${formatPhone(customer.altPhone)}` : ''}
            </span>
            {customer.email ? (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {customer.email}
              </span>
            ) : null}
            {customer.code ? <span>{customer.code}</span> : null}
            <span>Customer since {date(customer.createdAt, 'MMM YYYY')}</span>
            {customer.whatsappConsent !== 'OPTED_IN' ? <Badge tone="neutral">No marketing opt-in</Badge> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage ? <EditCustomerButton customer={customer} staff={staff} canSetTier={canSetTier} /> : null}
          <ShareButton target={{ customerId: customer.id, name: customer.firstName }} />
          <ButtonLink href={`/calendar?customer=${customer.id}`} variant="secondary" size="md">
            <CalendarPlus className="h-4 w-4" />
            Book
          </ButtonLink>
          <ButtonLink href={`/pos?customerId=${customer.id}`} size="md">
            <Receipt className="h-4 w-4" />
            New bill
          </ButtonLink>
        </div>
      </header>

      {/* The numbers that decide how you treat this person */}
      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Total visits" value={String(customer.stats.totalVisits)} />
        <Metric
          label="Last visit"
          value={customer.lastVisitAt ? fromNow(customer.lastVisitAt) : 'never'}
          tone={customer.stats.isAtRisk ? 'warning' : 'default'}
        />
        {shows('stats') ? (
          <>
            <Metric label="Total spent" value={money(customer.stats.totalSpent)} />
            <Metric label="Average bill" value={money(customer.stats.avgBill)} />
            <Metric
              label="Outstanding"
              value={money(customer.stats.outstanding)}
              tone={Number(customer.stats.outstanding ?? 0) > 0 ? 'warning' : 'default'}
            />
          </>
        ) : null}
        {shows('loyalty') ? <Metric label="Loyalty points" value={String(customer.stats.loyaltyPoints ?? 0)} /> : null}
        {customer.nextAppointment ? (
          <Metric
            label="Next visit"
            value={`${date(customer.nextAppointment.startAt, 'DD MMM')} · ${time(customer.nextAppointment.startAt)}`}
            tone="brand"
          />
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Visit history */}
          {shows('visits') && history ? (
            <Card>
              <CardHeader title="Visit history" subtitle={`${history.meta.total} appointments`} />
              {history.data.length === 0 ? (
                <EmptyState
                  icon={Scissors}
                  title="No visits recorded yet"
                  description="Once they are billed, every service, stylist and amount shows up here."
                />
              ) : (
                <ul className="divide-y divide-stone-100">
                  {history.data.map((appointment) => (
                    <li key={appointment.id} className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            {appointment.services.map((line) => line.service.name).join(', ') || 'No services'}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {dateTime(appointment.startAt)}
                            {appointment.services[0]?.staff ? ` · ${appointment.services[0].staff.displayName}` : ''}
                          </p>
                          {appointment.feedback ? (
                            <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                              <Star className="h-3 w-3 fill-current" />
                              {appointment.feedback.rating}/5
                              {appointment.feedback.comment ? ` — "${appointment.feedback.comment}"` : ''}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          {appointment.invoice && shows('stats') ? (
                            <Link
                              href={`/invoices/${appointment.invoice.id}`}
                              className="tnum block text-sm font-medium text-ink hover:text-brand-700"
                            >
                              {money(appointment.invoice.grandTotal)}
                            </Link>
                          ) : appointment.invoice ? (
                            <span className="text-xs text-ink-subtle">Billed</span>
                          ) : (
                            <span className="text-xs text-ink-subtle">Not billed</span>
                          )}
                          <StatusBadge status={appointment.status} className="mt-1" />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {/* Purchases — what they have actually bought, line by line */}
          {shows('purchases') && invoices ? (
            <Card>
              <CardHeader
                title="Purchases"
                subtitle={`${invoices.meta.total} bills · services, products, packages and memberships`}
                action={
                  invoices.meta.total > invoices.data.length ? (
                    <Link href={`/invoices?customerId=${customer.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                      All bills
                    </Link>
                  ) : null
                }
              />
              {invoices.data.length === 0 ? (
                <EmptyState icon={ShoppingBag} title="Nothing bought yet" description="Their first bill will appear here." />
              ) : (
                <ul className="divide-y divide-stone-100">
                  {invoices.data.map((invoice) => (
                    <li key={invoice.id} className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`/invoices/${invoice.id}`} className="text-sm font-medium text-ink hover:text-brand-700">
                            {invoice.invoiceNumber}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-muted">{date(invoice.invoiceDate)}</p>
                          <ul className="mt-1.5 space-y-0.5">
                            {invoice.items.map((item) => (
                              <li key={item.id} className="flex items-center justify-between gap-3 text-xs">
                                <span className="truncate text-ink-muted">
                                  <ItemKind kind={item.itemType} />
                                  {item.name}
                                  {Number(item.quantity) !== 1 ? ` × ${Number(item.quantity)}` : ''}
                                </span>
                                <span className="tnum shrink-0 text-ink">{money(item.taxableValue)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tnum text-sm font-semibold text-ink">{money(invoice.grandTotal)}</p>
                          <StatusBadge status={invoice.status} className="mt-1" />
                          {Number(invoice.dueAmount) > 0 ? (
                            <p className="tnum mt-1 text-2xs text-amber-700">{money(invoice.dueAmount)} due</p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {shows('notes') ? <CustomerNotes customerId={customer.id} initialNote={customer.notes} /> : null}

          {/* Photos */}
          {shows('photos') && photos && photos.length > 0 ? (
            <Card>
              <CardHeader title="Photos" subtitle={`${photos.length} on file`} />
              <CardBody>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {photos.map((photo) => (
                    <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="group relative block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={photo.caption ?? photo.kind} className="aspect-square w-full rounded-lg object-cover" />
                      <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-px text-2xs font-medium uppercase text-white">
                        {photo.kind.toLowerCase()}
                      </span>
                    </a>
                  ))}
                </div>
              </CardBody>
            </Card>
          ) : shows('photos') ? (
            <Card>
              <CardHeader title="Photos" />
              <EmptyState icon={Camera} title="No photos yet" description="Before-and-after shots are added from the appointment." />
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {/* Personal details — the person, not the transactions */}
          {shows('details') ? (
            <Card>
              <CardHeader title="Personal details" />
              <CardBody className="space-y-2.5 text-sm">
                <Detail label="Gender" value={customer.gender ? titleCase(customer.gender) : '—'} />
                <Detail label="Birthday" value={customer.dob ? date(customer.dob, 'DD MMM') : '—'} />
                <Detail label="Anniversary" value={customer.anniversary ? date(customer.anniversary, 'DD MMM') : '—'} />
                <Detail
                  label="Address"
                  value={[customer.addressLine, customer.city, customer.pincode].filter(Boolean).join(', ') || '—'}
                />
                <Detail
                  label="Found you via"
                  value={`${SOURCE_LABEL[customer.source] ?? titleCase(customer.source)}${customer.sourceDetail ? ` — ${customer.sourceDetail}` : ''}`}
                />
                {customer.referredBy ? (
                  <Detail
                    label="Referred by"
                    value={fullName(customer.referredBy)}
                    href={`/customers/${customer.referredBy.id}`}
                  />
                ) : null}
                <Detail label="Home branch" value={customer.branch?.name ?? '—'} />
                {customer.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {customer.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          {/* Membership + packages: what they have already paid for */}
          {shows('paidFor') && (membership || customer.packagePurchases.length > 0) ? (
            <Card>
              <CardHeader title="Already paid for" subtitle="Redeem these before charging again" />
              <CardBody className="space-y-3">
                {membership ? (
                  <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-brand-900">
                      <Heart className="h-3.5 w-3.5" />
                      {membership.plan.name}
                    </p>
                    <p className="mt-1 text-xs text-brand-700">
                      Expires {date(membership.endAt)} · {Number(membership.plan.serviceDiscountPct ?? 0)}% off services
                    </p>
                  </div>
                ) : null}

                {customer.packagePurchases.map((purchase) => (
                  <div key={purchase.id} className="rounded-lg border border-stone-200 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <Gift className="h-3.5 w-3.5 text-ink-subtle" />
                      {purchase.template.name}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {purchase.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between text-xs">
                          <span className="text-ink-muted">{item.service.name}</span>
                          <span className="tnum font-medium text-ink">
                            {item.totalQty - item.usedQty} of {item.totalQty} left
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-2xs text-ink-subtle">Expires {date(purchase.expiresAt)}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {/* Loyalty & wallet */}
          {shows('loyalty') ? (
            <Card>
              <CardHeader
                title="Loyalty & wallet"
                subtitle={`${customer.stats.loyaltyPoints ?? 0} points · ${money(customer.stats.walletBalance)} in wallet`}
              />
              {ledger && ledger.data.length > 0 ? (
                <ul className="divide-y divide-stone-100">
                  {ledger.data.map((txn) => (
                    <li key={txn.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs">
                      <div className="min-w-0">
                        <p className="truncate text-ink">{txn.reason}</p>
                        <p className="text-2xs text-ink-subtle">
                          {date(txn.createdAt)}
                          {txn.invoice ? ` · ${txn.invoice.invoiceNumber}` : ''}
                        </p>
                      </div>
                      <span className={`tnum shrink-0 font-medium ${txn.points >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {txn.points >= 0 ? '+' : ''}
                        {txn.points}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <CardBody>
                  <p className="text-xs text-ink-subtle">No points activity yet.</p>
                </CardBody>
              )}
            </Card>
          ) : null}

          {/* Preferences — the reason a salon keeps a customer */}
          {shows('preferences') ? (
            <Card>
              <CardHeader title="Preferences" subtitle="What the stylist needs to remember" />
              <CardBody className="space-y-2.5 text-sm">
                <Detail label="Favourite stylist" value={customer.favouriteStaff?.displayName ?? customer.preferredStaff?.displayName ?? '—'} />
                {customer.topServices.length > 0 ? (
                  <Detail label="Usual services" value={customer.topServices.map((s) => s.name).join(', ')} />
                ) : null}
                {customer.hairProfile ? (
                  <>
                    {customer.hairProfile.hairType ? <Detail label="Hair type" value={customer.hairProfile.hairType} /> : null}
                    {customer.hairProfile.colorFormula ? (
                      <Detail label="Colour formula" value={customer.hairProfile.colorFormula} mono />
                    ) : null}
                    {customer.hairProfile.hairCondition ? (
                      <Detail label="Hair condition" value={customer.hairProfile.hairCondition} />
                    ) : null}
                    {customer.hairProfile.preferredStyle ? (
                      <Detail label="Preferred style" value={customer.hairProfile.preferredStyle} />
                    ) : null}
                    {customer.hairProfile.allergies ? (
                      <div className="rounded-lg bg-rose-50 p-2.5">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-rose-700">Allergies</p>
                        <p className="mt-0.5 text-xs text-rose-900">{customer.hairProfile.allergies}</p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-ink-subtle">
                    No hair or skin profile recorded yet — worth filling in on the next visit.
                  </p>
                )}
              </CardBody>
            </Card>
          ) : null}

          {/* Feedback */}
          {shows('feedback') && customer.recentFeedback.length > 0 ? (
            <Card>
              <CardHeader title="Feedback" subtitle="Most recent first" />
              <ul className="divide-y divide-stone-100">
                {customer.recentFeedback.map((item) => (
                  <li key={item.id} className="px-5 py-2.5">
                    <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
                      <Star className="h-3 w-3 fill-current" />
                      {item.rating}/5
                      <span className="ml-auto font-normal text-ink-subtle">{date(item.createdAt)}</span>
                    </p>
                    {item.comment ? <p className="mt-1 text-xs text-ink">&ldquo;{item.comment}&rdquo;</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* Reachability */}
          {shows('contact') ? (
            <Card>
              <CardHeader title="Reachable on" />
              <CardBody className="space-y-2">
                <ConsentRow channel="WhatsApp" status={customer.whatsappConsent} icon={MessageCircle} />
                <ConsentRow channel="SMS" status={customer.smsConsent} icon={Phone} />
                <ConsentRow channel="Email" status={customer.emailConsent} icon={Mail} />
                <p className="pt-1 text-2xs leading-relaxed text-ink-subtle">
                  Marketing messages only go to customers who opted in. Reminders and invoices go to everyone who has not
                  opted out.
                </p>
              </CardBody>
            </Card>
          ) : null}

          {customer.sections && customer.sections.length < 11 && user?.role !== 'OWNER' ? (
            <p className="flex items-start gap-1.5 px-1 text-2xs leading-relaxed text-ink-subtle">
              <Sparkles className="mt-px h-3 w-3 shrink-0" />
              Some sections are hidden for your role. The owner chooses what each role sees in Settings → Customer profile.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

function ItemKind({ kind }: { kind: string }) {
  const label = { SERVICE: 'Service', PRODUCT: 'Product', PACKAGE: 'Package', MEMBERSHIP: 'Membership', ADJUSTMENT: 'Adj.' }[kind] ?? kind;
  return <span className="mr-1.5 rounded bg-stone-100 px-1 py-px text-2xs uppercase tracking-wide text-ink-subtle">{label}</span>;
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warning' | 'brand' }) {
  const color = tone === 'warning' ? 'text-amber-700' : tone === 'brand' ? 'text-brand-700' : 'text-ink';
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-card">
      <p className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={`tnum mt-1 text-base font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value, mono, href }: { label: string; value: string; mono?: boolean; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-ink-muted">{label}</span>
      {href ? (
        <Link href={href} className="text-right text-xs font-medium text-brand-700 hover:underline">
          {value}
        </Link>
      ) : (
        <span className={`text-right text-xs text-ink ${mono ? 'font-mono' : ''}`}>{value}</span>
      )}
    </div>
  );
}

function ConsentRow({
  channel,
  status,
  icon: Icon,
}: {
  channel: string;
  status: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tone = status === 'OPTED_IN' ? 'success' : status === 'OPTED_OUT' ? 'danger' : 'neutral';
  const label = status === 'OPTED_IN' ? 'Opted in' : status === 'OPTED_OUT' ? 'Opted out' : 'Not asked';

  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-xs text-ink">
        <Icon className="h-3.5 w-3.5 text-ink-subtle" />
        {channel}
      </span>
      <Badge tone={tone}>{label}</Badge>
    </div>
  );
}
