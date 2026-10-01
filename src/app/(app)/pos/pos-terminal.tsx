'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  Heart,
  Info,
  Minus,
  Package,
  Plus,
  Search,
  Star,
  Ticket,
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
import type { Appointment, BillingDefaults, Customer, Invoice, MembershipPlan, PackageTemplate, PaymentMode, PosContext, Product, Service, Staff } from '@/lib/types';
import { coverFor, overchargedLines, packageCredit } from './package-matching';
import { PackageCatalogue, PackageHoldings } from './pos-packages';
import { StaffPicker } from '@/components/staff-picker';

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
  itemType: 'SERVICE' | 'PRODUCT' | 'MEMBERSHIP' | 'PACKAGE';
  refId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  listPrice: number;
  discount: number;
  taxRatePct: number;
  /** Everyone who performed it, primary first. Empty means nobody is credited. */
  staffIds: string[];
  redeemFrom: 'NONE' | 'PACKAGE' | 'MEMBERSHIP';
  packagePurchaseItemId?: string;
}

interface PaymentLine {
  key: string;
  mode: PaymentMode;
  amount: number;
  reference: string;
}

/** What the API says about a discount code, checked against this bill. */
interface CouponCheck {
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FLAT';
  value: string | number;
  maxDiscount: string | number | null;
  minBillAmount: string | number;
  validTo: string;
  appliesTo: string | number;
  discount: string | number;
}

export function PosTerminal({
  serviceGroups,
  products,
  membershipPlans,
  packageTemplates,
  staff,
  appointment,
  initialCustomerId,
  canDiscount,
  billing,
}: {
  serviceGroups: { id: string; name: string; services: Service[] }[];
  products: Product[];
  membershipPlans: MembershipPlan[];
  packageTemplates: PackageTemplate[];
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
  const [tab, setTab] = useState<'services' | 'products' | 'packages' | 'memberships'>('services');
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
          // An appointment books one stylist per service. A second person who
          // ends up on it is added at the till, which is where it becomes true.
          staffIds: line.staffId ? [line.staffId] : [],
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

  /**
   * The two figures a coupon is judged against, worked out before it is checked.
   *
   * Split out of `totals` only because of the order things have to happen in: the
   * coupon's worth depends on the subtotal, and the total depends on the coupon's
   * worth. Computing these first breaks the circle without either one guessing at
   * the other.
   */
  const basis = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Math.max(0, line.unitPrice * line.quantity - line.discount), 0);
    const manual =
      billDiscountValue > 0
        ? billDiscountType === 'PERCENT'
          ? Math.min((subtotal * billDiscountValue) / 100, subtotal)
          : Math.min(billDiscountValue, subtotal)
        : 0;
    return { subtotal, manual };
  }, [lines, billDiscountType, billDiscountValue]);

  /**
   * WHAT IS LEFT OF THE CUSTOMER'S PACKAGES, THIS BILL INCLUDED.
   *
   * Recomputed from the cart on every change rather than held as state, because
   * the only honest answer to "how many facials are left" counts the ones already
   * sitting in front of you. The arithmetic is in ./package-matching, where it is
   * tested.
   */
  const credit = useMemo(() => packageCredit(context?.packages ?? [], lines), [context, lines]);

  /**
   * Services in the cart being charged for that the customer has already bought.
   *
   * It happens because of the order people work in: the catalogue is right there,
   * so services go in before the customer is attached, and by the time the
   * packages are known the lines are already priced. The till will not rewrite
   * them by itself — a total that changes under somebody's hands mid-bill is
   * worse than one that is simply too high, because at least the high one is
   * visible — so it says so and offers the fix on a click.
   */
  const overcharged = useMemo(() => overchargedLines(context?.packages ?? [], lines), [context, lines]);

  /**
   * IS THIS DISCOUNT CODE ANY GOOD, AND WHAT IS IT WORTH HERE?
   *
   * Checked against the API rather than worked out locally. The rules — expiry,
   * usage limits, per-customer limits, a minimum bill, a cap on the discount —
   * live on the server and are enforced there when the bill is saved, so a second
   * copy of them in the browser would only ever be a copy that disagreed.
   *
   * Re-checked whenever the bill changes, which is the point: a code that needs a
   * ₹2,000 minimum says so at ₹1,800 and goes green when the next service is
   * added, instead of failing the whole save at the end.
   */
  const couponQuery = useQuery({
    queryKey: ['pos-coupon', couponCode.trim(), basis.subtotal, basis.manual, customerId],
    queryFn: () =>
      apiPost<CouponCheck>('invoices/validate-coupon', {
        code: couponCode.trim(),
        subtotal: basis.subtotal,
        billDiscount: basis.manual,
        customerId: customerId ?? undefined,
      }),
    enabled: couponCode.trim().length >= 3 && lines.length > 0,
    retry: false,
    // Nothing here is worth re-fetching in the background mid-bill.
    refetchOnWindowFocus: false,
  });

  /**
   * Only a code the server has approved comes off the total, and only the amount
   * the server said. Showing a discount the bill then refuses is how a customer
   * ends up being quoted one figure and charged another.
   */
  const coupon = couponQuery.data ?? null;
  const couponDiscount = coupon ? Number(coupon.discount) : 0;

  // ------------------------------------------------------------- totals ---
  const totals = useMemo(() => {
    const { subtotal, manual: manualDiscount } = basis;
    /**
     * Manual discount and coupon, added and then clamped — the same order the API
     * uses, so the figure on the screen is the figure on the bill. The coupon was
     * already worked out against (subtotal − manual), which is why it is added
     * rather than taken off the gross.
     */
    const billDiscount = Math.min(manualDiscount + couponDiscount, subtotal);

    const netTotal = Math.max(0, subtotal - billDiscount);

    /**
     * Tax, four ways — the same four the API computes, because the till and the
     * bill disagreeing is the one thing nobody forgives:
     *
     *   GST on,  inclusive prices  tax sits inside the menu price; shown, not added.
     *   GST on,  exclusive prices  tax goes on top of the menu price.
     *   GST off, exclusive prices  nothing to do; the menu price is the base.
     *   GST off, INCLUSIVE prices  the tax comes OUT and the total drops.
     *
     * That last one used to behave like the third: ₹2,800 stayed ₹2,800 with the
     * GST line simply hidden. But on inclusive pricing ₹2,800 is ₹2,372.88 of
     * service and ₹427.12 of tax, so charging ₹2,800 without GST did not remove
     * the tax — it kept it and stopped declaring it. The customer paid a
     * tax-inclusive price for a bill that cannot support a claim, and the salon
     * was holding ₹427.12 it had not accounted for.
     */
    const embedded = (net: number, ratePct: number) => net - (net * 100) / (100 + ratePct);

    const taxByLine = lines.map((line) => {
      const lineNet = Math.max(0, line.unitPrice * line.quantity - line.discount);
      const share = subtotal > 0 ? lineNet / subtotal : 0;
      const afterBillDiscount = lineNet - billDiscount * share;
      return billing.pricesIncludeTax
        ? embedded(afterBillDiscount, line.taxRatePct)
        : (afterBillDiscount * line.taxRatePct) / 100;
    });
    const tax = taxByLine.reduce((sum, t) => sum + t, 0);

    const taxIncluded = gst && billing.pricesIncludeTax ? tax : 0;
    const taxAdded = gst && !billing.pricesIncludeTax ? tax : 0;
    // Taken off the bill rather than pocketed. Shown as its own line, because a
    // total that quietly shrinks is a total the person at the counter distrusts.
    const taxRemoved = !gst && billing.pricesIncludeTax ? tax : 0;

    const beforeRounding = netTotal + taxAdded - taxRemoved;
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
      manualDiscount: Math.min(manualDiscount, subtotal),
      /** What the package covered, at what it would have cost. */
      coveredValue: lines.reduce(
        (sum, line) => (line.redeemFrom === 'NONE' ? sum : sum + line.listPrice * line.quantity),
        0,
      ),
      taxIncluded,
      taxAdded,
      taxRemoved,
      grandTotal,
      roundOff,
      loyaltyValue,
      wallet,
      manual,
      paid,
      due: Math.max(0, grandTotal - paid),
      change: Math.max(0, paid - grandTotal),
    };
  }, [lines, basis, couponDiscount, context, pointsToRedeem, walletAmount, payments, gst, billing.pricesIncludeTax]);

  // --------------------------------------------------------------- cart ---
  /**
   * ADDING A SERVICE — AND MATCHING IT TO A PACKAGE IF IT IS ONE THEY OWN.
   *
   * The second argument is for the cases where the caller has already decided:
   * the chips in the "already paid for" card, and the per-line toggles in the
   * cart. Left off, this looks for itself, and that is what stops the commonest
   * way a salon charges twice — the service is in a package, but it was added
   * from the catalogue like anything else, so nobody noticed.
   *
   * Matching only ever makes a line CHEAPER, which is why it is safe to do
   * without asking. The reverse — deciding on somebody's behalf to charge for
   * something — is never automatic.
   */
  function addService(
    service: Service,
    redeem?: { from: 'PACKAGE' | 'MEMBERSHIP'; purchaseItemId?: string; packageName?: string },
  ) {
    const matched = redeem ?? matchToPackage(service.id);

    const memberPrice = context?.membership && service.memberPrice ? Number(service.memberPrice) : Number(service.price);
    const discountPct = context?.membership ? Number(context.membership.plan.serviceDiscountPct) : 0;
    const price = matched ? 0 : service.memberPrice && context?.membership ? memberPrice : Number(service.price);
    const autoDiscount = matched || (service.memberPrice && context?.membership) ? 0 : (price * discountPct) / 100;

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
        staffIds: [],
        redeemFrom: matched?.from ?? 'NONE',
        packagePurchaseItemId: matched?.purchaseItemId,
      },
    ]);

    if (!redeem && matched) {
      toast.success(`${service.name} covered by ${matched.packageName ?? 'their package'} — not charged`);
    }
  }

  /**
   * A package session free to spend on this service, or nothing.
   *
   * Read off the memo, which is one render behind if two chips are clicked
   * inside the same frame. Left that way rather than defended here: the server
   * counts the sessions again inside the invoice transaction and refuses with
   * "Only 1 session(s) remain in this package", rolling the whole bill back. A
   * second allocator in the browser to catch a double-click would be more code
   * than the thing it guards and would be the copy that drifts.
   */
  function matchToPackage(serviceId: string) {
    const cover = coverFor(credit, serviceId);
    return cover
      ? { from: 'PACKAGE' as const, purchaseItemId: cover.entitlement.purchaseItemId, packageName: cover.entitlement.packageName }
      : null;
  }

  /**
   * Charge for a line the package was covering.
   *
   * The session goes back to the customer's balance by itself — `credit` is
   * derived from the cart, so dropping the redemption restores it. The menu price
   * comes back from `listPrice`, which is held on every line for exactly this.
   */
  function chargeInstead(key: string) {
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? { ...line, redeemFrom: 'NONE' as const, packagePurchaseItemId: undefined, unitPrice: line.listPrice, discount: 0 }
          : line,
      ),
    );
  }

  /** Take a charged line off the customer's package instead. */
  function useOnePackage(key: string) {
    const line = lines.find((candidate) => candidate.key === key);
    if (!line) return;
    const cover = coverFor(credit, line.refId, line.quantity);
    if (!cover) return;
    setLines((current) =>
      current.map((candidate) =>
        candidate.key === key
          ? {
              ...candidate,
              redeemFrom: 'PACKAGE' as const,
              packagePurchaseItemId: cover.entitlement.purchaseItemId,
              unitPrice: 0,
              discount: 0,
            }
          : candidate,
      ),
    );
  }

  /**
   * Apply every match at once.
   *
   * Recomputed inside the updater rather than read from the memo above, so the
   * allocation is made against the cart as it is at this instant — two facials in
   * the cart with one session left must take one, not two.
   */
  function useAllPackages() {
    setLines((current) => {
      const byKey = new Map(
        overchargedLines(context?.packages ?? [], current).map((match) => [
          match.line.key,
          match.credit.entitlement.purchaseItemId,
        ]),
      );
      return current.map((line) => {
        const purchaseItemId = byKey.get(line.key);
        return purchaseItemId
          ? { ...line, redeemFrom: 'PACKAGE' as const, packagePurchaseItemId: purchaseItemId, unitPrice: 0, discount: 0 }
          : line;
      });
    });
  }

  /**
   * SELLING A PACKAGE.
   *
   * A bill line like any other: priced, taxed at the salon's rate, and the
   * sessions are created when the invoice is saved — not now, because nothing is
   * owed until the bill exists. It needs a customer, and the API refuses without
   * one rather than taking the money and quietly creating nothing.
   */
  function addPackage(template: PackageTemplate) {
    if (!customerId) {
      setError('Attach a customer first — the sessions in a package have to belong to somebody.');
      return;
    }
    setError(null);
    setLines((current) => [
      ...current,
      {
        key: `${template.id}-${Date.now()}`,
        itemType: 'PACKAGE',
        refId: template.id,
        name: `${template.name} package`,
        quantity: 1,
        unitPrice: Number(template.price),
        listPrice: Number(template.price),
        discount: 0,
        taxRatePct: billing.defaultGstRate,
        staffIds: [],
        redeemFrom: 'NONE',
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
        staffIds: [],
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
        staffIds: [],
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
  /**
   * Service lines with nobody against them. Products are excluded on purpose:
   * commission here is earned on services, and a bottle of shampoo has no
   * performer to name.
   */
  const unassigned = lines.filter((line) => line.itemType === 'SERVICE' && line.staffIds.length === 0).length;

  async function submit() {
    setError(null);
    if (lines.length === 0) {
      setError('Add at least one service or product.');
      return;
    }
    if (lines.some((line) => line.itemType === 'MEMBERSHIP' || line.itemType === 'PACKAGE') && !customerId) {
      setError('Attach a customer before selling a package or a membership — the sessions have to belong to somebody.');
      return;
    }
    /**
     * A code that did not check out is not sent. Letting it through would fail
     * the whole save on the server for a reason already on the screen, losing the
     * bill over a field that is optional.
     */
    if (couponCode.trim().length >= 3 && !coupon) {
      setError(
        couponQuery.isFetching
          ? 'Still checking that discount code — one moment.'
          : `${errorMessage(couponQuery.error) || 'That discount code cannot be used on this bill'}. Clear the code to carry on without it.`,
      );
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
          staffIds: line.staffIds,
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
        // The code the API approved, not the raw box — so a half-typed code can
        // never reach the invoice.
        couponCode: coupon?.code,
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

        {/* Already paid for — what each package holds, and what is left of it */}
        <PackageHoldings
          credit={credit}
          services={allServices}
          onRedeem={(service, purchaseItemId) => addService(service, { from: 'PACKAGE', purchaseItemId })}
        />

        {/* Complimentary services from a membership. Kept separate from the
            packages above on purpose: they come from a subscription rather than
            from sessions bought up front, they are consumed through a different
            path in the API, and a front desk that is told they are the same thing
            will ask why one of them ran out. */}
        {(context?.membership?.freeServices.length ?? 0) > 0 ? (
          <Card className="border-brand-200 bg-brand-50/40">
            <CardBody className="py-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-900">
                <Heart className="h-3.5 w-3.5" />
                Complimentary on {context?.membership?.plan.name}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {context?.membership?.freeServices.map((benefit) => {
                  const service = allServices.find((s) => s.id === benefit.serviceId);
                  return (
                    <button
                      key={benefit.usageId}
                      type="button"
                      disabled={!service}
                      onClick={() => service && addService(service, { from: 'MEMBERSHIP' })}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-white px-2.5 py-1 text-xs text-brand-800 hover:bg-brand-100 disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      {benefit.serviceName}
                      <span className="tnum text-2xs">{benefit.remaining} of {benefit.totalQty} free</span>
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        ) : null}

        {/**
          * CHARGING FOR SOMETHING THEY HAVE ALREADY BOUGHT.
          *
          * Not corrected silently. The lines are already priced and somebody may
          * be reading the total out loud, so the till says what it found and
          * leaves the decision — there are real reasons to charge anyway, like
          * saving the session for an appointment later in the week.
          */}
        {overcharged.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="flex-1 text-xs leading-relaxed text-amber-900">
              {overcharged.length === 1
                ? `${overcharged[0]!.line.name} is being charged for, and it is already in ${overcharged[0]!.credit.entitlement.packageName}.`
                : `${overcharged.length} services on this bill are already paid for in a package.`}
            </p>
            <button
              type="button"
              onClick={useAllPackages}
              className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
            >
              Use the package
            </button>
          </div>
        ) : null}

        {/* Catalogue */}
        <Card>
          <div className="flex items-center gap-2 border-b border-stone-200 p-3">
            <div className="flex rounded-lg border border-stone-300 bg-white p-0.5">
              {/* Tabs for what the salon actually sells. A packages tab with no
                  packages, or a memberships tab with no plans, is a dead end that
                  makes the till look broken. */}
              {(
                [
                  'services',
                  'products',
                  ...(packageTemplates.length > 0 ? (['packages'] as const) : []),
                  ...(membershipPlans.length > 0 ? (['memberships'] as const) : []),
                ] as const
              ).map((value) => (
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
            ) : tab === 'packages' ? (
              <PackageCatalogue
                templates={packageTemplates}
                services={allServices}
                search={catalogueSearch}
                hasCustomer={Boolean(customerId)}
                held={context?.packages ?? []}
                onSell={addPackage}
              />
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
          {/* The split, in the subtitle. "6 line items" does not tell the front
              desk the thing they are about to be asked: how much of this is she
              actually paying for? */}
          <CardHeader
            title="Bill"
            subtitle={
              lines.length === 0
                ? 'Nothing added yet'
                : (() => {
                    const covered = lines.filter((line) => line.redeemFrom !== 'NONE').length;
                    const charged = lines.length - covered;
                    if (covered === 0) return `${lines.length} line items`;
                    if (charged === 0) return `${covered} covered, nothing to pay`;
                    return `${charged} charged · ${covered} covered by what they already own`;
                  })()
            }
          />
          {lines.length === 0 ? (
            <CardBody>
              <p className="py-6 text-center text-sm text-ink-subtle">Tap a service above to start the bill.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-stone-100">
              {lines.map((line) => {
                const covered = line.redeemFrom !== 'NONE';
                /** A charged service this customer could take off a package instead. */
                const coverable =
                  !covered && line.itemType === 'SERVICE'
                    ? overcharged.some((match) => match.line.key === line.key)
                    : false;
                const fromPackage = line.packagePurchaseItemId
                  ? credit.find((entry) => entry.entitlement.purchaseItemId === line.packagePurchaseItemId)
                  : undefined;

                return (
                <li key={line.key} className={cn('p-3', covered && 'bg-brand-50/50')}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                        {line.name}
                        {covered ? (
                          <Badge tone="brand">
                            <Check className="h-3 w-3" />
                            {line.redeemFrom === 'PACKAGE'
                              ? fromPackage?.entitlement.packageName ?? 'Package'
                              : 'Membership'}
                          </Badge>
                        ) : null}
                        {line.itemType === 'PACKAGE' ? (
                          <Badge tone="neutral">
                            <Package className="h-3 w-3" />
                            Selling
                          </Badge>
                        ) : null}
                      </p>

                      {/* The two one-click reversals. Both are reversible and
                          neither needs confirming; what they must do is say what
                          the money does, because "Charge instead" with no figure
                          beside it is a button nobody presses. */}
                      {covered && line.redeemFrom === 'PACKAGE' ? (
                        <button
                          type="button"
                          onClick={() => chargeInstead(line.key)}
                          className="mt-0.5 text-2xs text-ink-subtle underline underline-offset-2 hover:text-ink"
                        >
                          Charge {money(line.listPrice * line.quantity)} instead and keep the session
                        </button>
                      ) : null}
                      {coverable ? (
                        <button
                          type="button"
                          onClick={() => useOnePackage(line.key)}
                          className="mt-0.5 text-2xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                        >
                          Already in their package — use it instead of charging {money(line.unitPrice * line.quantity - line.discount)}
                        </button>
                      ) : null}
                      {/* Everyone on this service. Lives here and nowhere else:
                          the saved invoice is a document for the customer and
                          carries no stylist's name at all. */}
                      {line.itemType === 'SERVICE' ? (
                        <div className="mt-1">
                          <StaffPicker
                            value={line.staffIds}
                            staff={staff}
                            onChange={(staffIds) => updateLine(line.key, { staffIds })}
                          />
                        </div>
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
                );
              })}
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
                {/**
                  * A DISCOUNT CODE THAT SAYS WHETHER IT WORKS, BEFORE THE SAVE.
                  *
                  * This box used to take a code and tell you nothing. It went out
                  * with the invoice, and an expired or used-up code failed the
                  * whole save — in front of the customer, with no bill raised.
                  * Now the code is checked as it is typed and the answer sits
                  * under the field, in the API's own words.
                  */}
                <div>
                  <div className="relative">
                    <Ticket className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                    <Input
                      value={couponCode}
                      onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                      placeholder="Discount code (optional)"
                      className="pl-8 pr-16 uppercase"
                      aria-describedby="coupon-status"
                    />
                    {couponCode ? (
                      <button
                        type="button"
                        onClick={() => setCouponCode('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-2xs text-ink-subtle hover:text-ink"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  <p id="coupon-status" aria-live="polite" className="mt-1 text-2xs leading-relaxed">
                    {couponCode.trim().length === 0 ? null : couponCode.trim().length < 3 ? (
                      <span className="text-ink-subtle">Keep typing…</span>
                    ) : lines.length === 0 ? (
                      <span className="text-ink-subtle">Add something to the bill to check this code.</span>
                    ) : couponQuery.isFetching ? (
                      <span className="text-ink-subtle">Checking {couponCode.trim()}…</span>
                    ) : coupon ? (
                      <span className="flex items-start gap-1 font-medium text-emerald-700">
                        <Check className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          {coupon.code} applied — {money(coupon.discount)} off
                          {coupon.description ? ` · ${coupon.description}` : ''}
                          {/* Named when it bites, because "20% off" and "₹500
                              off" look identical on the total when the cap is
                              what decided it. */}
                          {coupon.maxDiscount && Number(coupon.discount) >= Number(coupon.maxDiscount)
                            ? ` · capped at ${money(coupon.maxDiscount)}`
                            : ''}
                        </span>
                      </span>
                    ) : couponQuery.isError ? (
                      <span className="flex items-start gap-1 text-rose-700">
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        {errorMessage(couponQuery.error)}
                      </span>
                    ) : null}
                  </p>
                </div>
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
                      : billing.pricesIncludeTax
                        ? 'The GST inside the menu price is taken off, so the customer pays less. Not counted in the GST report.'
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
              {/* What the package covered, named and valued. It is ₹0 on the
                  bill, so without this row the only trace of it is a subtotal
                  that looks suspiciously low — and the salon never sees the value
                  it handed over against money it took months ago. */}
              {totals.coveredValue > 0 ? (
                <Row label="Covered by what they own" value={`${moneyExact(totals.coveredValue)} at no charge`} muted />
              ) : null}
              {/* The manual discount and the code shown apart. Added together
                  they are an amount nobody can account for, and the code is the
                  half somebody will be asked to justify. */}
              {totals.manualDiscount > 0 ? (
                <Row label="Bill discount" value={`− ${moneyExact(totals.manualDiscount)}`} tone="negative" />
              ) : null}
              {couponDiscount > 0 ? (
                <Row label={`Code ${coupon?.code ?? ''}`} value={`− ${moneyExact(couponDiscount)}`} tone="negative" />
              ) : null}
              {totals.taxAdded > 0 ? <Row label="GST" value={moneyExact(totals.taxAdded)} /> : null}
              {/* The reduction, named. Without this row the total simply drops
                  by an unexplained amount when the switch is flipped. */}
              {totals.taxRemoved > 0 ? (
                <Row label="GST removed" value={`− ${moneyExact(totals.taxRemoved)}`} tone="negative" />
              ) : null}
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
                  : totals.taxRemoved > 0
                    ? `${moneyExact(totals.taxRemoved)} GST taken off — the customer pays less`
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

            {/**
              * NOBODY ATTACHED TO A SERVICE MEANS NOBODY EARNS ON IT.
              *
              * The staff box on each service line is optional, and it is the
              * easiest thing on this screen to skip at a busy counter. What it
              * costs is invisible until payday: no staffId, no commission
              * entry, and the stylist's total is quietly short with no record
              * of which bill it was.
              *
              * Said here rather than enforced. A salon that pays salary only
              * has no reason to fill it in, and a till that refuses to take
              * money over a reporting field is a till that gets worked around.
              */}
            {unassigned > 0 ? (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-2xs leading-relaxed text-amber-900">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {unassigned === 1 ? 'One service has' : `${unassigned} services have`} nobody assigned, so no
                  commission will be recorded for {unassigned === 1 ? 'it' : 'them'}. Pick who performed{' '}
                  {unassigned === 1 ? 'it' : 'each'} above, or carry on if you do not pay commission.
                </span>
              </p>
            ) : null}

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
