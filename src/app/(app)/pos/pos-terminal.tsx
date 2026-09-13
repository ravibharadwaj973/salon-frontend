'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Gift,
  Heart,
  Info,
  Minus,
  Plus,
  Search,
  Star,
  Trash2,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { apiGet, apiList, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { fullName, money, moneyExact, phone as formatPhone } from '@/lib/format';
import type { Appointment, BillingDefaults, Customer, Invoice, MembershipPlan, PaymentMode, PosContext, Product, Service, Staff } from '@/lib/types';

/**
 * Every payment mode here is a *record* of money already taken at the counter.
 * There is no gateway: nothing on this screen charges a card or opens a
 * checkout. `reference` is where the UPI ref / card slip / cheque number goes.
 */
const PAYMENT_MODES: { value: PaymentMode; label: string; hint?: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI', hint: 'Your own QR' },
  { value: 'CARD', label: 'Card', hint: 'Your own machine' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CREDIT', label: 'Pay later', hint: 'Leaves an outstanding balance' },
];

interface CartLine {
  key: string;
  itemType: 'SERVICE' | 'PRODUCT' | 'MEMBERSHIP';
  refId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  listPrice: number;
  discount: number;
  taxRatePct: number;
  staffId?: string;
  redeemFrom: 'NONE' | 'PACKAGE' | 'MEMBERSHIP';
  packagePurchaseItemId?: string;
}

interface PaymentLine {
  key: string;
  mode: PaymentMode;
  amount: number;
  reference: string;
}

export function PosTerminal({
  serviceGroups,
  products,
  membershipPlans,
  staff,
  appointment,
  initialCustomerId,
  canDiscount,
  billing,
}: {
  serviceGroups: { id: string; name: string; services: Service[] }[];
  products: Product[];
  membershipPlans: MembershipPlan[];
  staff: Staff[];
  appointment: Appointment | null;
  initialCustomerId: string | null;
  canDiscount: boolean;
  billing: BillingDefaults;
}) {
  const router = useRouter();
  const toast = useToast();

  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);
  const [search, setSearch] = useState('');
  const [catalogueSearch, setCatalogueSearch] = useState('');
  const [tab, setTab] = useState<'services' | 'products' | 'memberships'>('services');
  /**
   * GST on this bill. Starts from the salon default; the front desk may flip it
   * per bill when they hold invoice.gst_choice, and never to "on" without a
   * GSTIN — there is no such thing as a tax invoice without one.
   */
  const [gst, setGst] = useState(billing.gstByDefault && billing.hasGstin);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [billDiscountType, setBillDiscountType] = useState<'PERCENT' | 'FLAT'>('PERCENT');
  const [billDiscountValue, setBillDiscountValue] = useState(0);
  const [couponCode, setCouponCode] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [walletAmount, setWalletAmount] = useState(0);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allServices = useMemo(() => serviceGroups.flatMap((group) => group.services), [serviceGroups]);

  // Prefill the cart from the appointment being billed.
  useEffect(() => {
    if (!appointment) return;
    setLines(
      appointment.services
        .filter((line) => line.status !== 'CANCELLED')
        .map((line) => ({
          key: `${line.id}`,
          itemType: 'SERVICE' as const,
          refId: line.serviceId,
          name: line.service.name,
          quantity: 1,
          unitPrice: Number(line.price),
          listPrice: Number(line.price),
          discount: Number(line.discount),
          taxRatePct: billing.defaultGstRate,
          staffId: line.staffId ?? undefined,
          redeemFrom: 'NONE' as const,
        })),
    );
  }, [appointment, billing.defaultGstRate]);

  const { data: results } = useQuery({
    queryKey: ['pos-customer-search', search],
    queryFn: () => apiList<Customer>('customers', { query: { q: search, pageSize: 6 } }),
    enabled: search.trim().length >= 2,
  });

  const { data: context } = useQuery({
    queryKey: ['pos-context', customerId],
    queryFn: () => apiGet<PosContext>(`invoices/pos-context/${customerId}`),
    enabled: Boolean(customerId),
  });

  // ------------------------------------------------------------- totals ---
  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Math.max(0, line.unitPrice * line.quantity - line.discount), 0);
    const billDiscount =
      billDiscountValue > 0
        ? billDiscountType === 'PERCENT'
          ? Math.min((subtotal * billDiscountValue) / 100, subtotal)
          : Math.min(billDiscountValue, subtotal)
        : 0;

    const netTotal = Math.max(0, subtotal - billDiscount);

    // Tax, three ways — the same three the API knows:
    //   GST off:                 nothing charged, nothing shown.
    //   GST on, prices inclusive: tax is inside the menu price; back it out for display.
    //   GST on, prices exclusive: tax goes on top of the menu price.
    const taxByLine = lines.map((line) => {
      const lineNet = Math.max(0, line.unitPrice * line.quantity - line.discount);
      const share = subtotal > 0 ? lineNet / subtotal : 0;
      const afterBillDiscount = lineNet - billDiscount * share;
      if (!gst) return 0;
      return billing.pricesIncludeTax
        ? afterBillDiscount - (afterBillDiscount * 100) / (100 + line.taxRatePct)
        : (afterBillDiscount * line.taxRatePct) / 100;
    });
    const tax = taxByLine.reduce((sum, t) => sum + t, 0);
    const taxIncluded = gst && billing.pricesIncludeTax ? tax : 0;
    const taxAdded = gst && !billing.pricesIncludeTax ? tax : 0;

    const beforeRounding = netTotal + taxAdded;
    const grandTotal = Math.round(beforeRounding);
    const roundOff = grandTotal - beforeRounding;

    const pointValue = Number(context?.loyalty.pointValue ?? 0);
    const loyaltyValue = Math.min(pointsToRedeem * pointValue, (grandTotal * Number(context?.loyalty.maxRedeemPctOfBill ?? 0)) / 100);
    const wallet = Math.min(walletAmount, Number(context?.wallet ?? 0));
    const manual = payments.reduce((sum, payment) => sum + (Number.isFinite(payment.amount) ? payment.amount : 0), 0);

    const paid = loyaltyValue + wallet + manual;

    return {
      subtotal,
      billDiscount,
      taxIncluded,
      taxAdded,
      grandTotal,
      roundOff,
      loyaltyValue,
      wallet,
      manual,
      paid,
      due: Math.max(0, grandTotal - paid),
      change: Math.max(0, paid - grandTotal),
    };
  }, [lines, billDiscountType, billDiscountValue, context, pointsToRedeem, walletAmount, payments, gst, billing.pricesIncludeTax]);

  // --------------------------------------------------------------- cart ---
  function addService(service: Service, redeem?: { from: 'PACKAGE' | 'MEMBERSHIP'; purchaseItemId?: string }) {
    const memberPrice = context?.membership && service.memberPrice ? Number(service.memberPrice) : Number(service.price);
    const discountPct = context?.membership ? Number(context.membership.plan.serviceDiscountPct) : 0;
    const price = redeem ? 0 : service.memberPrice && context?.membership ? memberPrice : Number(service.price);
    const autoDiscount = redeem || (service.memberPrice && context?.membership) ? 0 : (price * discountPct) / 100;

    setLines((current) => [
      ...current,
      {
        key: `${service.id}-${Date.now()}`,
        itemType: 'SERVICE',
        refId: service.id,
        name: service.name,
        quantity: 1,
        unitPrice: price,
        listPrice: Number(service.price),
        discount: Math.round(autoDiscount * 100) / 100,
        taxRatePct: billing.defaultGstRate,
        redeemFrom: redeem?.from ?? 'NONE',
        packagePurchaseItemId: redeem?.purchaseItemId,
      },
    ]);
  }

  function addProduct(product: Product) {
    setLines((current) => [
      ...current,
      {
        key: `${product.id}-${Date.now()}`,
        itemType: 'PRODUCT',
        refId: product.id,
        name: `${product.name}${product.shade ? ` (${product.shade})` : ''}`,
        quantity: 1,
        unitPrice: Number(product.sellingPrice),
        listPrice: Number(product.sellingPrice),
        discount: 0,
        taxRatePct: Number(product.taxRatePct),
        redeemFrom: 'NONE',
      },
    ]);
  }

  /**
   * Selling a membership is a bill line like any other: GST is applied, the
   * money is recorded by hand, and the subscription is created when the
   * invoice is saved. It needs a customer — a membership has to belong to
   * someone.
   */
  function addMembership(plan: MembershipPlan) {
    if (lines.some((line) => line.itemType === 'MEMBERSHIP')) {
      setError('One membership per bill — a customer can only hold one at a time.');
      return;
    }
    setError(null);
    setLines((current) => [
      ...current,
      {
        key: `${plan.id}-${Date.now()}`,
        itemType: 'MEMBERSHIP',
        refId: plan.id,
        name: `${plan.name} membership`,
        quantity: 1,
        unitPrice: Number(plan.price),
        listPrice: Number(plan.price),
        discount: 0,
        taxRatePct: billing.defaultGstRate,
        redeemFrom: 'NONE',
      },
    ]);
  }

  const updateLine = (key: string, patch: Partial<CartLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const removeLine = (key: string) => setLines((current) => current.filter((line) => line.key !== key));

  const addPayment = (mode: PaymentMode) =>
    setPayments((current) => [
      ...current,
      { key: `${mode}-${Date.now()}`, mode, amount: current.length === 0 ? totals.due : 0, reference: '' },
    ]);

  // ------------------------------------------------------------- submit ---
  async function submit() {
    setError(null);
    if (lines.length === 0) {
      setError('Add at least one service or product.');
      return;
    }
    if (lines.some((line) => line.itemType === 'MEMBERSHIP') && !customerId) {
      setError('Attach a customer before selling a membership — it has to belong to someone.');
      return;
    }

    setSaving(true);
    try {
      const invoice = await apiPost<Invoice>('invoices', {
        customerId: customerId ?? undefined,
        appointmentId: appointment?.id,
        isGst: gst,
        items: lines.map((line) => ({
          itemType: line.itemType,
          refId: line.refId,
          staffId: line.staffId,
          quantity: line.quantity,
          unitPrice: line.redeemFrom === 'NONE' ? line.unitPrice : 0,
          discount: line.discount || undefined,
          redeemFrom: line.redeemFrom,
          packagePurchaseItemId: line.packagePurchaseItemId,
          membershipSubscriptionId:
            line.redeemFrom === 'MEMBERSHIP' ? context?.membership?.subscriptionId : undefined,
        })),
        billDiscountType: billDiscountValue > 0 ? billDiscountType : undefined,
        billDiscountValue: billDiscountValue > 0 ? billDiscountValue : undefined,
        couponCode: couponCode.trim() || undefined,
        loyaltyPointsToRedeem: pointsToRedeem > 0 ? pointsToRedeem : undefined,
        useWalletAmount: walletAmount > 0 ? walletAmount : undefined,
        payments: payments
          .filter((payment) => payment.amount > 0)
          .map((payment) => ({
            mode: payment.mode,
            amount: payment.amount,
            reference: payment.reference.trim() || undefined,
          })),
        notes: notes.trim() || undefined,
      });

      toast.success(`Invoice ${invoice.invoiceNumber} created`);
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const filteredServices = catalogueSearch
    ? allServices.filter((service) => service.name.toLowerCase().includes(catalogueSearch.toLowerCase()))
    : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr,380px]">
      {/* ------------------------------------------------ catalogue + cart */}
      <div className="space-y-5">
        {/* Customer */}
        <Card>
          <CardBody className="py-3">
            {context ? (
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={fullName(context.customer)} id={context.customer.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={`/customers/${context.customer.id}`} className="text-sm font-medium text-ink hover:text-brand-700">
                    {fullName(context.customer)}
                  </Link>
                  <p className="tnum text-xs text-ink-muted">{formatPhone(context.customer.phone)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {context.membership ? (
                    <Badge tone="brand">
                      <Heart className="h-3 w-3" />
                      {context.membership.plan.name}
                    </Badge>
                  ) : null}
                  {context.loyalty.points > 0 ? (
                    <Badge tone="warning">
                      <Star className="h-3 w-3" />
                      {context.loyalty.points} pts
                    </Badge>
                  ) : null}
                  {Number(context.wallet) > 0 ? (
                    <Badge tone="success">
                      <Wallet className="h-3 w-3" />
                      {money(context.wallet)}
                    </Badge>
                  ) : null}
                  {Number(context.outstanding) > 0 ? (
                    <Badge tone="danger">{money(context.outstanding)} due</Badge>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCustomerId(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search customer by name or phone — or leave blank for a cash sale"
                    className="pl-8"
                  />
                </div>
                {search.trim().length >= 2 && results?.data.length ? (
                  <div className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-200">
                    {results.data.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => {
                          setCustomerId(row.id);
                          setSearch('');
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-stone-50"
                      >
                        <Avatar name={fullName(row)} id={row.id} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{fullName(row)}</span>
                          <span className="tnum block text-xs text-ink-muted">{formatPhone(row.phone)}</span>
                        </span>
                        <Badge>{row.tier}</Badge>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Already paid for — redeem before charging again */}
        {context && (context.packages.length > 0 || (context.membership?.freeServices.length ?? 0) > 0) ? (
          <Card className="border-brand-200 bg-brand-50/40">
            <CardBody className="py-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-900">
                <Gift className="h-3.5 w-3.5" />
                They have already paid for these — add them free
              </p>
              <div className="flex flex-wrap gap-1.5">
                {context.packages.map((pack) => {
                  const service = allServices.find((s) => s.id === pack.serviceId);
                  return (
                    <button
                      key={pack.purchaseItemId}
                      type="button"
                      disabled={!service}
                      onClick={() =>
                        service && addService(service, { from: 'PACKAGE', purchaseItemId: pack.purchaseItemId })
                      }
                      className="rounded-full border border-brand-300 bg-white px-2.5 py-1 text-xs text-brand-800 hover:bg-brand-100 disabled:opacity-50"
                    >
                      {pack.serviceName} · {pack.remaining} left
                    </button>
                  );
                })}
                {context.membership?.freeServices.map((benefit) => {
                  const service = allServices.find((s) => s.id === benefit.serviceId);
                  return (
                    <button
                      key={benefit.usageId}
                      type="button"
                      disabled={!service}
                      onClick={() => service && addService(service, { from: 'MEMBERSHIP' })}
                      className="rounded-full border border-brand-300 bg-white px-2.5 py-1 text-xs text-brand-800 hover:bg-brand-100 disabled:opacity-50"
                    >
                      {benefit.serviceName} · {benefit.remaining} free
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        ) : null}

        {/* Catalogue */}
        <Card>
          <div className="flex items-center gap-2 border-b border-stone-200 p-3">
            <div className="flex rounded-lg border border-stone-300 bg-white p-0.5">
              {(membershipPlans.length > 0 ? (['services', 'products', 'memberships'] as const) : (['services', 'products'] as const)).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium capitalize',
                    tab === value ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
              <Input
                value={catalogueSearch}
                onChange={(event) => setCatalogueSearch(event.target.value)}
                placeholder={`Search ${tab}…`}
                className="pl-8"
              />
            </div>
          </div>

          <CardBody className="max-h-[420px] overflow-y-auto">
            {tab === 'services' ? (
              filteredServices ? (
                <div className="flex flex-wrap gap-1.5">
                  {filteredServices.map((service) => (
                    <ServiceChip key={service.id} service={service} onAdd={() => addService(service)} />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {serviceGroups.map((group) => (
                    <div key={group.id}>
                      <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{group.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.services.map((service) => (
                          <ServiceChip key={service.id} service={service} onAdd={() => addService(service)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : tab === 'memberships' ? (
              <div>
                {!customerId ? (
                  <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                    Attach a customer first — a membership has to belong to someone.
                  </p>
                ) : context?.membership ? (
                  <p className="mb-3 rounded-lg bg-stone-50 p-2.5 text-xs text-ink-muted">
                    Already on <strong>{context.membership.plan.name}</strong> with {context.membership.daysLeft} days left.
                    Selling the same plan again renews it from the current expiry.
                  </p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  {membershipPlans
                    .filter((plan) => (catalogueSearch ? plan.name.toLowerCase().includes(catalogueSearch.toLowerCase()) : true))
                    .map((plan) => (
                      <button
                        key={plan.id}
                        type="button"
                        disabled={!customerId}
                        onClick={() => addMembership(plan)}
                        className="rounded-lg border border-stone-200 bg-white p-3 text-left hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-ink">{plan.name}</span>
                          <span className="tnum text-sm font-semibold text-ink">{money(plan.price)}</span>
                        </div>
                        <p className="mt-0.5 text-2xs text-ink-muted">
                          {plan.durationDays >= 365 ? `${Math.round(plan.durationDays / 365)} year` : `${plan.durationDays} days`}
                          {Number(plan.serviceDiscountPct) > 0 ? ` · ${Number(plan.serviceDiscountPct)}% off services` : ''}
                          {plan.benefits.length > 0
                            ? ` · ${plan.benefits.reduce((n, b) => n + b.quantity, 0)} complimentary`
                            : ''}
                        </p>
                      </button>
                    ))}
                </div>
              </div>
            ) : products.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink-subtle">No retail products set up yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {products
                  .filter((product) =>
                    catalogueSearch ? product.name.toLowerCase().includes(catalogueSearch.toLowerCase()) : true,
                  )
                  .map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-ink-muted hover:border-brand-300 hover:text-ink"
                    >
                      <Plus className="h-3 w-3" />
                      {product.name}
                      {product.shade ? ` (${product.shade})` : ''}
                      <span className="tnum text-ink-subtle">{money(product.sellingPrice)}</span>
                    </button>
                  ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Cart */}
        <Card>
          <CardHeader title="Bill" subtitle={lines.length === 0 ? 'Nothing added yet' : `${lines.length} line items`} />
          {lines.length === 0 ? (
            <CardBody>
              <p className="py-6 text-center text-sm text-ink-subtle">Tap a service above to start the bill.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-stone-100">
              {lines.map((line) => (
                <li key={line.key} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                        {line.name}
                        {line.redeemFrom !== 'NONE' ? (
                          <Badge tone="brand">{line.redeemFrom === 'PACKAGE' ? 'Package' : 'Membership'}</Badge>
                        ) : null}
                      </p>
                      {line.itemType === 'SERVICE' ? (
                        <select
                          value={line.staffId ?? ''}
                          onChange={(event) => updateLine(line.key, { staffId: event.target.value || undefined })}
                          className="mt-1 h-7 rounded-md border border-stone-300 bg-white px-2 text-xs text-ink-muted"
                        >
                          <option value="">Who performed this?</option>
                          {staff.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.displayName}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateLine(line.key, { quantity: Math.max(1, line.quantity - 1) })}
                        className="rounded border border-stone-300 p-1 text-ink-muted hover:bg-stone-50"
                        aria-label="Decrease"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="tnum w-6 text-center text-sm">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateLine(line.key, { quantity: line.quantity + 1 })}
                        className="rounded border border-stone-300 p-1 text-ink-muted hover:bg-stone-50"
                        aria-label="Increase"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <input
                      type="number"
                      value={line.unitPrice}
                      onChange={(event) => updateLine(line.key, { unitPrice: Number(event.target.value) })}
                      disabled={line.redeemFrom !== 'NONE'}
                      className="tnum h-8 w-20 rounded-md border border-stone-300 px-2 text-right text-sm disabled:bg-stone-50"
                    />

                    {canDiscount ? (
                      <input
                        type="number"
                        value={line.discount}
                        onChange={(event) => updateLine(line.key, { discount: Number(event.target.value) })}
                        placeholder="0"
                        title="Line discount"
                        className="tnum h-8 w-16 rounded-md border border-stone-300 px-2 text-right text-sm text-rose-600"
                      />
                    ) : null}

                    <span className="tnum w-20 text-right text-sm font-medium text-ink">
                      {money(Math.max(0, line.unitPrice * line.quantity - line.discount))}
                    </span>

                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="rounded p-1 text-ink-subtle hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------ settlement */}
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader title="Settle" />
          <CardBody className="space-y-4">
            {/* Discounts */}
            {canDiscount ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Select
                    value={billDiscountType}
                    onChange={(event) => setBillDiscountType(event.target.value as 'PERCENT' | 'FLAT')}
                    className="w-24"
                  >
                    <option value="PERCENT">%</option>
                    <option value="FLAT">₹</option>
                  </Select>
                  <Input
                    type="number"
                    value={billDiscountValue || ''}
                    onChange={(event) => setBillDiscountValue(Number(event.target.value))}
                    placeholder="Bill discount"
                    className="tnum text-right"
                  />
                </div>
                <Input
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  placeholder="Coupon code (optional)"
                  className="uppercase"
                />
              </div>
            ) : null}

            {/* Loyalty + wallet */}
            {context && context.loyalty.points >= context.loyalty.minRedeemPoints ? (
              <Field
                label="Redeem points"
                hint={`${context.loyalty.points} available · max ${Number(context.loyalty.maxRedeemPctOfBill)}% of bill`}
              >
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    value={pointsToRedeem || ''}
                    onChange={(event) => setPointsToRedeem(Number(event.target.value))}
                    max={context.loyalty.points}
                    placeholder="0"
                    className="tnum text-right"
                  />
                )}
              </Field>
            ) : null}

            {context && Number(context.wallet) > 0 ? (
              <Field label="Use wallet balance" hint={`${money(context.wallet)} available`}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    value={walletAmount || ''}
                    onChange={(event) => setWalletAmount(Number(event.target.value))}
                    placeholder="0"
                    className="tnum text-right"
                  />
                )}
              </Field>
            ) : null}

            {/* Totals */}
            {/* GST on or off — a per-bill choice for those allowed to make it */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-3">
              <div>
                <p className="text-xs font-semibold text-ink">{gst ? 'Tax invoice' : 'Bill without GST'}</p>
                <p className="text-2xs text-ink-subtle">
                  {!billing.hasGstin
                    ? 'No GSTIN on file — add it in Settings → Salon to make tax invoices.'
                    : gst
                      ? billing.pricesIncludeTax
                        ? 'GST is inside the menu price and shown on the bill.'
                        : 'GST is added on top of the menu price.'
                      : 'No GST charged or shown. Not counted in the GST report.'}
                </p>
              </div>
              {billing.canChooseGst && billing.hasGstin ? (
                <div className="flex rounded-lg border border-stone-300 bg-white p-0.5" role="group" aria-label="GST on this bill">
                  <button
                    type="button"
                    onClick={() => setGst(true)}
                    className={cn('rounded-md px-2.5 py-1 text-xs font-medium', gst ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink')}
                    aria-pressed={gst}
                  >
                    With GST
                  </button>
                  <button
                    type="button"
                    onClick={() => setGst(false)}
                    className={cn('rounded-md px-2.5 py-1 text-xs font-medium', !gst ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink')}
                    aria-pressed={!gst}
                  >
                    Without GST
                  </button>
                </div>
              ) : null}
            </div>

            <dl className="space-y-1.5 border-t border-stone-200 pt-3 text-sm">
              <Row label="Subtotal" value={moneyExact(totals.subtotal)} />
              {totals.billDiscount > 0 ? (
                <Row label="Bill discount" value={`− ${moneyExact(totals.billDiscount)}`} tone="negative" />
              ) : null}
              {totals.taxAdded > 0 ? <Row label="GST" value={moneyExact(totals.taxAdded)} /> : null}
              {totals.roundOff !== 0 ? <Row label="Round off" value={moneyExact(totals.roundOff)} muted /> : null}
              <div className="flex items-baseline justify-between border-t border-stone-200 pt-2">
                <dt className="text-sm font-semibold text-ink">Total</dt>
                <dd className="tnum text-xl font-semibold text-ink">{money(totals.grandTotal)}</dd>
              </div>
              <p className="text-2xs text-ink-subtle">
                {gst
                  ? totals.taxIncluded > 0
                    ? `Includes ${moneyExact(totals.taxIncluded)} GST`
                    : 'GST shown above'
                  : 'No GST on this bill'}
              </p>
            </dl>

            {/* Payments — manual, always */}
            <div className="border-t border-stone-200 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-ink">Money received</p>
                <span className="tnum text-xs text-ink-muted">{money(totals.paid)} of {money(totals.grandTotal)}</span>
              </div>

              {totals.loyaltyValue > 0 ? (
                <p className="mb-1.5 flex justify-between rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  <span>{pointsToRedeem} loyalty points</span>
                  <span className="tnum">{money(totals.loyaltyValue)}</span>
                </p>
              ) : null}
              {totals.wallet > 0 ? (
                <p className="mb-1.5 flex justify-between rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                  <span>Wallet</span>
                  <span className="tnum">{money(totals.wallet)}</span>
                </p>
              ) : null}

              <ul className="space-y-2">
                {payments.map((payment) => (
                  <li key={payment.key} className="flex items-center gap-1.5">
                    <Select
                      value={payment.mode}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((p) => (p.key === payment.key ? { ...p, mode: event.target.value as PaymentMode } : p)),
                        )
                      }
                      className="w-32"
                    >
                      {PAYMENT_MODES.map((mode) => (
                        <option key={mode.value} value={mode.value}>
                          {mode.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      value={payment.amount || ''}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((p) => (p.key === payment.key ? { ...p, amount: Number(event.target.value) } : p)),
                        )
                      }
                      className="tnum text-right"
                      placeholder="0"
                    />
                    <button
                      type="button"
                      onClick={() => setPayments((current) => current.filter((p) => p.key !== payment.key))}
                      className="rounded p-1.5 text-ink-subtle hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Remove payment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {payments.map((payment) =>
                  payment.mode === 'UPI' || payment.mode === 'CARD' || payment.mode === 'CHEQUE' ? (
                    <li key={`${payment.key}-ref`}>
                      <Input
                        value={payment.reference}
                        onChange={(event) =>
                          setPayments((current) =>
                            current.map((p) => (p.key === payment.key ? { ...p, reference: event.target.value } : p)),
                          )
                        }
                        placeholder={
                          payment.mode === 'UPI' ? 'UPI reference no.' : payment.mode === 'CARD' ? 'Card slip / last 4' : 'Cheque number'
                        }
                        className="text-xs"
                      />
                    </li>
                  ) : null,
                )}
              </ul>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {PAYMENT_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => addPayment(mode.value)}
                    className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-ink-muted hover:border-brand-300 hover:text-ink"
                    title={mode.hint}
                  >
                    + {mode.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-baseline justify-between border-t border-stone-200 pt-2">
                <span className="text-sm font-medium text-ink">{totals.change > 0 ? 'Change to give' : 'Balance due'}</span>
                <span
                  className={cn(
                    'tnum text-lg font-semibold',
                    totals.change > 0 ? 'text-sky-700' : totals.due > 0 ? 'text-rose-600' : 'text-emerald-600',
                  )}
                >
                  {money(totals.change > 0 ? totals.change : totals.due)}
                </span>
              </div>

              {totals.due > 0 && payments.length > 0 ? (
                <p className="mt-1.5 flex items-start gap-1.5 text-2xs text-ink-muted">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  Leaving a balance records it as outstanding against the customer.
                </p>
              ) : null}
            </div>

            <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Note on the bill (optional)" />

            {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

            <Button onClick={submit} loading={saving} size="lg" className="w-full" disabled={lines.length === 0}>
              Create invoice · {money(totals.grandTotal)}
            </Button>

            {!customerId ? (
              <p className="flex items-start gap-1.5 text-2xs text-ink-subtle">
                <UserRound className="mt-0.5 h-3 w-3 shrink-0" />
                No customer attached — this will be a cash sale with no visit history or loyalty points.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ServiceChip({ service, onAdd }: { service: Service; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-brand-300 hover:text-ink"
    >
      <Plus className="h-3 w-3" />
      {service.name}
      <span className="tnum text-ink-subtle">{money(service.price)}</span>
    </button>
  );
}

function Row({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: 'negative';
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={cn('text-xs', muted ? 'text-ink-subtle' : 'text-ink-muted')}>{label}</dt>
      <dd className={cn('tnum text-sm', tone === 'negative' ? 'text-rose-600' : muted ? 'text-ink-subtle' : 'text-ink')}>
        {value}
      </dd>
    </div>
  );
}
