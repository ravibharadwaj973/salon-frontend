/**
 * Shapes returned by the Parlon API. Kept hand-written and deliberately
 * partial — only what the UI actually reads — so the app is not coupled to
 * every field the backend happens to return.
 */

export interface Envelope<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** Money arrives as a decimal string from Prisma; never parse it as a float for maths. */
export type Money = string | number;

export type UserRole =
  | 'OWNER'
  | 'ADMIN'
  | 'REGIONAL_MANAGER'
  | 'MANAGER'
  | 'RECEPTIONIST'
  | 'STYLIST'
  | 'ACCOUNTANT';

export interface BranchSummary {
  id: string;
  name: string;
  code: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  avatarUrl: string | null;
  mustChangePassword: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    timezone: string;
    status: string;
    plan?: { code: string; name: string } | null;
  };
  branches: BranchSummary[];
  branchIds: string[] | null;
  permissions: string[];
  /**
   * What the salon's plan includes — a different question from `permissions`,
   * which is what this person may do. A screen needs both.
   */
  features?: string[];
  /** The salon may read everything and save nothing — account switched off. */
  readOnly?: boolean;
  readOnlyReason?: string | null;
  staffId: string | null;
}

export type CustomerTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'VIP';
export type ConsentStatus = 'UNKNOWN' | 'OPTED_IN' | 'OPTED_OUT';

export interface Customer {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNISEX' | null;
  dob?: string | null;
  tier: CustomerTier;
  tags: string[];
  totalVisits: number;
  totalSpent: Money;
  avgBill: Money;
  loyaltyPoints: number;
  walletBalance: Money;
  outstanding: Money;
  lastVisitAt: string | null;
  createdAt: string;
  branchId: string | null;
}

/** A row from GET /customers/lookup — the "have they been here before?" check. */
export interface CustomerMatch {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNISEX' | null;
  dob: string | null;
  tier: CustomerTier;
  totalVisits: number;
  totalSpent: Money;
  lastVisitAt: string | null;
  createdAt: string;
  /** The full phone number or email matched, not just a prefix. */
  exact: boolean;
}

export type ProfileSectionKey =
  | 'details'
  | 'stats'
  | 'visits'
  | 'purchases'
  | 'paidFor'
  | 'loyalty'
  | 'preferences'
  | 'notes'
  | 'photos'
  | 'feedback'
  | 'contact';

/** GET /layouts/:page — the sections of a page, and who sees them. */
export interface PageLayout {
  page: 'customer' | 'staff';
  title: string;
  description: string;
  canManage: boolean;
  sections: {
    key: string;
    label: string;
    description: string;
    permission: string;
    roles: UserRole[];
    /** Roles whose permissions include this section's data at all. */
    eligibleRoles: UserRole[];
    isDefault: boolean;
    visible: boolean;
  }[];
}

export type ProfileLayoutResponse = PageLayout;

export interface LoyaltyTransaction {
  id: string;
  type: 'EARN' | 'REDEEM' | 'BONUS' | 'ADJUST' | 'EXPIRE';
  points: number;
  balanceAfter: number;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  invoice?: { id: string; invoiceNumber: string } | null;
}

export interface CustomerPhoto {
  id: string;
  url: string;
  kind: 'BEFORE' | 'AFTER' | 'REFERENCE' | string;
  caption: string | null;
  appointmentId: string | null;
  createdAt: string;
}

export interface CustomerProfile extends Customer {
  /** Which sections the API decided this person may see — the page renders only these. */
  sections: ProfileSectionKey[];
  altPhone: string | null;
  source: string;
  sourceDetail: string | null;
  pincode: string | null;
  isActive: boolean;
  isBlacklisted: boolean;
  referredBy: { id: string; firstName: string; lastName: string | null } | null;
  notes: string | null;
  whatsappConsent: ConsentStatus;
  smsConsent: ConsentStatus;
  emailConsent: ConsentStatus;
  anniversary: string | null;
  addressLine: string | null;
  city: string | null;
  branch: { id: string; name: string } | null;
  preferredStaff: { id: string; displayName: string } | null;
  hairProfile: HairProfile | null;
  memberships: MembershipSubscription[];
  packagePurchases: PackagePurchase[];
  stats: {
    totalVisits: number;
    /** Null when the money section is hidden from this person. */
    totalSpent: Money | null;
    avgBill: Money | null;
    loyaltyPoints: number | null;
    walletBalance: Money | null;
    outstanding: Money | null;
    daysSinceLastVisit: number | null;
    isAtRisk: boolean;
  };
  nextAppointment: Appointment | null;
  lastInvoice: { id: string; invoiceNumber: string; grandTotal: Money; invoiceDate: string; dueAmount: Money } | null;
  favouriteStaff: { id: string; displayName: string } | null;
  topServices: { name: string; count: number; revenue: Money }[];
  recentFeedback: { id: string; rating: number; comment: string | null; createdAt: string }[];
}

export interface HairProfile {
  hairType: string | null;
  hairCondition: string | null;
  scalpCondition: string | null;
  colorBrand: string | null;
  colorFormula: string | null;
  preferredStyle: string | null;
  allergies: string | null;
  sensitivities: string | null;
  notes: string | null;
}

export interface ServiceCategory {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  services?: Service[];
  _count?: { services: number };
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNISEX';
  durationMin: number;
  bufferMin: number;
  price: Money;
  memberPrice: Money | null;
  taxRatePct: Money;
  commissionRate: Money;
  onlineBookable: boolean;
  isActive: boolean;
}

export interface Staff {
  id: string;
  displayName: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
  branchId: string;
  branch?: { id: string; name: string };
  colorHex: string | null;
  avatarUrl: string | null;
  avgRating: Money;
  ratingCount: number;
  isBookable: boolean;
  isActive: boolean;
  specialities: string[];
  /** Null when the salary section is hidden from this viewer. */
  baseSalary: Money | null;
  /** Null when the commission section is hidden from this viewer. */
  commissionRate: Money | null;
  /** Null alongside the rate — the arrangement gives the number away too. */
  commissionType?: 'NONE' | 'PERCENT_OF_SERVICE' | 'PERCENT_OF_TOTAL' | 'FLAT_PER_SERVICE' | 'SLAB' | null;
  code?: string | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNISEX' | null;
  joinedAt?: string | null;
  createdAt?: string;
  /** Sections the API decided this viewer may see (only on GET /staff/:id). */
  sections?: string[];
  /** The viewer is looking at their own record. */
  isSelf?: boolean;
  user?: { id: string; email: string; role: UserRole } | null;
  services?: { id: string; serviceId: string; service: { id: string; name: string; price?: Money } }[];
  availability?: { id: string; dayOfWeek: number; startTime: string; endTime: string }[];
  _count?: { services: number };
}

export type AppointmentStatus =
  | 'BOOKED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface AppointmentServiceLine {
  id: string;
  serviceId: string;
  staffId: string | null;
  resourceId: string | null;
  startAt: string;
  endAt: string;
  durationMin: number;
  price: Money;
  discount: Money;
  status: string;
  service: { id: string; name: string; durationMin?: number };
  staff: { id: string; displayName: string; colorHex?: string | null } | null;
  resource?: { id: string; name: string } | null;
}

export interface Appointment {
  id: string;
  branchId: string;
  customerId: string | null;
  walkInName: string | null;
  walkInPhone: string | null;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  source: string;
  /** Which page the online booking came from — "website", "insta", a hostname. */
  sourceRef: string | null;
  notes: string | null;
  totalDurationMin: number;
  estimatedAmount: Money;
  customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'phone' | 'tier' | 'loyaltyPoints' | 'totalVisits'> | null;
  branch: { id: string; name: string; timezone: string };
  services: AppointmentServiceLine[];
  invoice: { id: string; invoiceNumber: string; grandTotal: Money; status: string; dueAmount: Money } | null;
  feedback?: { id: string; rating: number; comment: string | null } | null;
}

export interface CalendarColumn {
  id: string;
  label: string;
  kind: 'staff' | 'resource';
  colorHex?: string | null;
  appointments: (AppointmentServiceLine & {
    appointmentId: string;
    appointment: {
      id: string;
      status: AppointmentStatus;
      source: string;
      notes: string | null;
      customerId: string | null;
      walkInName: string | null;
      walkInPhone: string | null;
      customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'phone' | 'tier'> | null;
      invoice: { id: string; status: string } | null;
    };
  })[];
}

export interface CalendarResponse {
  branch: { id: string; name: string; timezone: string; slotIntervalMin: number };
  range: { from: string; to: string };
  openingHours: Record<string, { open: string; close: string }[]>;
  columns: CalendarColumn[];
  unassigned: CalendarColumn['appointments'];
  totals: { appointments: number; services: number; bookedMinutes: number };
}

export interface SlotGroup {
  staffId: string;
  staffName: string;
  /** `available: false` means that stylist is already booked then. */
  slots: { start: string; end: string; label: string; available: boolean }[];
}

export type PaymentMode =
  | 'CASH'
  | 'CARD'
  | 'UPI'
  | 'CHEQUE'
  | 'BANK_TRANSFER'
  | 'WALLET'
  | 'MEMBERSHIP'
  | 'PACKAGE'
  | 'LOYALTY_POINTS'
  | 'ADVANCE'
  | 'CREDIT'
  | 'OTHER';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'REFUNDED';

export interface InvoiceItem {
  id: string;
  itemType: 'SERVICE' | 'PRODUCT' | 'PACKAGE' | 'MEMBERSHIP' | 'ADJUSTMENT';
  refId: string | null;
  name: string;
  hsnSac: string | null;
  staffId: string | null;
  staff?: { id: string; displayName: string } | null;
  quantity: Money;
  unitPrice: Money;
  discount: Money;
  taxableValue: Money;
  taxRatePct: Money;
  cgstAmount: Money;
  sgstAmount: Money;
  igstAmount: Money;
  lineTotal: Money;
  redeemedFrom: 'NONE' | 'PACKAGE' | 'MEMBERSHIP' | 'LOYALTY';
}

export interface Payment {
  id: string;
  mode: PaymentMode;
  amount: Money;
  reference: string | null;
  receivedAt: string;
  isAdvance: boolean;
  notes: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  branchId: string;
  customerId: string | null;
  appointmentId: string | null;
  invoiceDate: string;
  isGst: boolean;
  grossAmount: Money;
  itemDiscount: Money;
  billDiscount: Money;
  discountReason: string | null;
  taxableAmount: Money;
  cgstAmount: Money;
  sgstAmount: Money;
  igstAmount: Money;
  totalTax: Money;
  roundOff: Money;
  grandTotal: Money;
  paidAmount: Money;
  dueAmount: Money;
  refundedAmount: Money;
  status: InvoiceStatus;
  notes: string | null;
  customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'phone' | 'email' | 'tier' | 'loyaltyPoints'> | null;
  branch: { id: string; name: string; gstin: string | null; addressLine: string | null; city: string | null; stateCode: string | null; phone: string | null };
  items: InvoiceItem[];
  payments: Payment[];
  refunds: { id: string; amount: Money; mode: PaymentMode; reason: string | null; refundedAt: string }[];
  taxBreakup?: { hsnSac: string; taxRatePct: number; taxableValue: Money; cgst: Money; sgst: Money; igst: Money }[];
  _count?: { items: number };
}

export interface PosContext {
  customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'phone' | 'loyaltyPoints' | 'walletBalance' | 'outstanding' | 'tier'>;
  membership: {
    subscriptionId: string;
    plan: { id: string; name: string; serviceDiscountPct: Money; productDiscountPct: Money; loyaltyMultiplier: Money };
    expiresAt: string;
    daysLeft: number;
    freeServices: { usageId: string; serviceId: string; serviceName: string; remaining: number; totalQty: number }[];
  } | null;
  packages: {
    purchaseId: string;
    purchaseItemId: string;
    packageName: string;
    serviceId: string;
    serviceName: string;
    remaining: number;
    totalQty: number;
    usedQty: number;
    expiresAt: string;
  }[];
  loyalty: {
    points: number;
    value: Money;
    minRedeemPoints: number;
    maxRedeemPctOfBill: Money;
    pointValue: Money;
  };
  wallet: Money;
  outstanding: Money;
}

export interface PackageTemplate {
  id: string;
  name: string;
  description: string | null;
  price: Money;
  validityDays: number;
  isActive: boolean;
  items: { id: string; serviceId: string; quantity: number; service: { id: string; name: string; price?: Money } }[];
  _count?: { purchases: number };
}

export interface PackagePurchase {
  id: string;
  customerId: string;
  purchasedAt: string;
  expiresAt: string;
  price: Money;
  status: 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'CANCELLED';
  template: { id: string; name: string };
  customer?: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'phone'>;
  items: { id: string; serviceId: string; totalQty: number; usedQty: number; service: { id: string; name: string } }[];
}

export interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price: Money;
  taxRatePct?: Money;
  durationDays: number;
  serviceDiscountPct: Money;
  productDiscountPct: Money;
  priorityBooking: boolean;
  birthdayBenefit: string | null;
  loyaltyMultiplier: Money;
  isActive: boolean;
  benefits: { id: string; serviceId: string; quantity: number; service: { id: string; name: string } }[];
  _count?: { subscriptions: number };
}

export interface MembershipSubscription {
  id: string;
  customerId: string;
  startAt: string;
  endAt: string;
  price: Money;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  autoRenew: boolean;
  plan: { id: string; name: string; price?: Money; serviceDiscountPct?: Money };
  customer?: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'phone' | 'totalSpent'>;
}

export interface LoyaltyProgram {
  id: string;
  isActive: boolean;
  amountPerPoint: Money;
  pointValue: Money;
  referralPoints: number;
  birthdayPoints: number;
  reviewPoints: number;
  minRedeemPoints: number;
  maxRedeemPctOfBill: Money;
  expiryMonths: number;
}

export interface Reward {
  id: string;
  name: string;
  pointsCost: number;
  rewardType: string;
  value: Money;
  isActive: boolean;
  service?: { id: string; name: string } | null;
}

export interface Product {
  id: string;
  name: string;
  shade: string | null;
  sku: string | null;
  unit: string;
  costPrice: Money;
  sellingPrice: Money;
  taxRatePct: Money;
  reorderLevel: Money;
  isRetail: boolean;
  isConsumable: boolean;
  isActive: boolean;
  brand?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  totalQuantity?: Money;
  isLowStock?: boolean;
}

export interface StockRow {
  productId: string;
  productName: string;
  shade: string | null;
  brand: string | null;
  unit: string;
  branch: { id: string; name: string };
  quantity: Money;
  reorderLevel: Money;
  isLow: boolean;
  value: Money;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  paymentTerms: string | null;
  isActive: boolean;
  _count?: { purchaseOrders: number };
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  orderedAt: string;
  expectedAt: string | null;
  receivedAt: string | null;
  subTotal: Money;
  taxAmount: Money;
  totalAmount: Money;
  supplier: { id: string; name: string };
  branch?: { id: string; name: string };
  items?: {
    id: string;
    productId: string;
    quantity: Money;
    receivedQty: Money;
    unitCost: Money;
    lineTotal: Money;
    product: { id: string; name: string; shade: string | null; unit: string };
  }[];
  _count?: { items: number };
}

export type LeadStatus = 'NEW' | 'CONTACTED' | 'INTERESTED' | 'APPOINTMENT_BOOKED' | 'VISITED' | 'CONVERTED' | 'LOST';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  sourceDetail: string | null;
  status: LeadStatus;
  notes: string | null;
  followUpAt: string | null;
  convertedCustomerId: string | null;
  createdAt: string;
  assignedTo: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  activities?: { id: string; type: string; notes: string | null; createdAt: string }[];
  _count?: { activities: number };
}

export interface Segment {
  id: string;
  name: string;
  description: string | null;
  isDynamic: boolean;
  rules: { match?: 'all' | 'any'; conditions: { field: string; op: string; value?: unknown }[] };
  lastCount: number;
  lastComputedAt: string | null;
  _count?: { campaigns: number };
}

/**
 * Where a message got to. Mirrors the MessageStatus enum in the Prisma schema —
 * if you add one there, add it here and give it a tone in STATUS_TONES.
 *
 * The happy path climbs QUEUED → SENT → DELIVERED → READ → CLICKED and never
 * walks back down. READ covers both a WhatsApp read receipt and an email open.
 * DELAYED is still in flight; BOUNCED, COMPLAINED and FAILED are endings.
 */
export type MessageStatus =
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'CLICKED'
  | 'DELAYED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'FAILED'
  | 'SKIPPED';

/** One message, as the log records it — including why it did not arrive. */
export interface MessageLogEntry {
  id: string;
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL';
  status: MessageStatus;
  toAddress: string;
  renderedBody: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  clickedAt: string | null;
  customer: { id: string; firstName: string; lastName: string | null; phone: string } | null;
  template: { id: string; name: string; category: string } | null;
  /// Null for a one-off send from a customer's profile or the share sheet.
  campaign: { id: string; name: string } | null;
}

/**
 * Meta's verdict on a WhatsApp template.
 *
 * PAUSED and DISABLED come from Meta when a template's quality rating drops;
 * neither can carry a message, so neither may be folded into APPROVED.
 */
export type TemplateApprovalStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED';

/**
 * A button under a WhatsApp message.
 *
 * On a URL button, `url` is a fixed base and `variable` names the field whose
 * value Meta appends to it — never a field holding a whole link, or the address
 * arrives with its origin in it twice.
 */
export type TemplateButton =
  | { type: 'URL'; text: string; url: string; variable?: string | null }
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'PHONE_NUMBER'; text: string; phone: string };

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'SERVICE';

export interface MessageTemplate {
  id: string;
  name: string;
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'IN_APP';
  /** Meta's verdict once submitted, not necessarily what was asked for. */
  category: TemplateCategory;
  /** What was submitted. Null until the template has been sent to Meta. */
  requestedCategory: TemplateCategory | null;
  language: string;
  providerTemplateName: string | null;
  /** Meta's id, present only once the template exists on a WABA. */
  providerTemplateId: string | null;
  /** Meta's own words. Not paraphrased — the salon has to fix what Meta named. */
  rejectedReason: string | null;
  submittedAt: string | null;
  syncedAt: string | null;
  /** The email subject line, or WhatsApp's optional bold header. */
  headerText: string | null;
  bodyText: string;
  variables: string[];
  buttons: TemplateButton[];
  approvalStatus: TemplateApprovalStatus;
  isActive: boolean;
}

/** What came back from pressing Submit to Meta. */
export interface MetaSubmitOutcome {
  ok: boolean;
  /** Meta already had this name, so we linked to the existing one. */
  adopted?: boolean;
  /** Meta accepted it but we could not record that. The two sides disagree. */
  unsaved?: string;
  sent?: { name: string; language: string; category: string; body: string };
  meta?: { id?: string; status?: string; message?: string; code?: number; subcode?: number; hint?: string };
  /** Things we refused to send, so Meta never saw them. */
  problems?: string[];
  source?: string;
}

/** A template Meta holds that this app has no record of. */
export interface MetaOnlyTemplate {
  name: string;
  status: string;
  language: string;
  category: string;
  /** Meta's wording, with positions already turned into named placeholders. */
  body: string;
  parameters: number;
}

export interface MetaImportOutcome {
  ok: boolean;
  templateId?: string;
  name?: string;
  language?: string;
  status?: string;
  parameters?: number;
  unmapped?: number[];
  message: string;
}

export interface MetaSyncOutcome {
  ok: boolean;
  checked: number;
  updated: {
    name: string;
    from: string;
    to: string;
    rejectedReason: string | null;
    recategorised?: { from: string; to: string };
  }[];
  onlyOnMeta: MetaOnlyTemplate[];
  notSubmitted: string[];
  /** Meta held these once and no longer does. They cannot send. */
  removedOnMeta: { id: string; name: string; language: string; wasStatus: string }[];
  source?: string;
  error?: string;
}

export interface Campaign {
  id: string;
  name: string;
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'IN_APP';
  status: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  scheduledAt: string | null;
  startedAt: string | null;
  targetCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  clickedCount: number;
  /** Customers who wrote back. WhatsApp and SMS only — an email reply goes to the salon's inbox, not to us. */
  repliedCount: number;
  failedCount: number;
  bookingCount: number;
  revenue: Money;
  cost: Money;
  /** What it costs to send one, so a review can total it before anybody presses send. */
  costPerMessage?: Money;
  segment: { id: string; name: string; lastCount?: number } | null;
  template: { id: string; name: string; category?: string } | null;
  performance?: {
    sent: number;
    delivered: number;
    read: number;
    clicked: number;
    failed: number;
    bookings: number;
    revenue: Money;
    cost: Money;
    roi: number | null;
    deliveryRatePct: number;
    readRatePct: number;
    conversionRatePct: number;
  };
}

export interface Journey {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  triggerConfig: Record<string, unknown>;
  isActive: boolean;
  steps: {
    id: string;
    sortOrder: number;
    actionType: string;
    delayMinutes: number;
    channel: string | null;
    templateId: string | null;
    template?: { id: string; name: string } | null;
    config: Record<string, unknown>;
  }[];
  stats?: { runs: Record<string, number>; messages: Record<string, number> };
  _count?: { runs: number };
}

export interface Feedback {
  id: string;
  rating: number;
  serviceRating: number | null;
  npsScore: number | null;
  comment: string | null;
  isComplaint: boolean;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'phone'> | null;
  staff: { id: string; displayName: string } | null;
  appointment: { id: string; startAt: string } | null;
}

export interface Expense {
  id: string;
  expenseDate: string;
  amount: Money;
  paymentMode: PaymentMode;
  vendor: string | null;
  reference: string | null;
  notes: string | null;
  category: { id: string; name: string; isFixed: boolean };
  branch?: { id: string; name: string };
}

export interface BusinessAlert {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface DashboardSnapshot {
  period: { from: string; to: string };
  revenue: Money;
  collected: Money;
  invoices: number;
  averageBill: Money;
  tax: Money;
  discount: Money;
  appointments: number;
  completed: number;
  cancelled: number;
  noShows: number;
  upcoming: number;
  customersServed: number;
  newCustomers: number;
  returningCustomers: number;
  expenses: Money;
  grossProfit: Money;
  outstanding: Money;
}

export interface DashboardResponse {
  date: string;
  today: DashboardSnapshot;
  previous: DashboardSnapshot;
  comparison: {
    revenueChangePct: number;
    appointmentsChangePct: number;
    newCustomersChangePct: number;
    averageBillChangePct: number;
  };
}

export interface GrowthResponse {
  period: { from: string; to: string };
  current: GrowthSnapshot;
  previous: GrowthSnapshot;
  changes: {
    revenuePct: number;
    newCustomersPct: number;
    returningCustomersPct: number;
    retentionPct: number;
    averageBillPct: number;
  };
}

export interface GrowthSnapshot {
  revenue: Money;
  invoices: number;
  averageBill: Money;
  customersServed: number;
  newCustomers: number;
  returningCustomers: number;
  retentionPct: number;
  rebookingPct: number;
  revenuePerCustomer: Money;
  revenuePerStaff: Money;
  revenuePerBranch: Money;
}

export interface UnitEconomics {
  period: { from: string; to: string; days: number };
  revenue: Money;
  cogs: Money;
  grossProfit: Money;
  grossMarginPct: number;
  staffCommission: Money;
  operatingExpenses: Money;
  operatingProfit: Money;
  operatingMarginPct: number;
  averageTicketSize: Money;
  customersServed: number;
  newCustomers: number;
  repeatCustomers: number;
  repeatRatePct: number;
  visitsPerCustomer: number;
  averageCustomerValue: Money;
  customerAcquisitionCost: Money;
  estimatedLtv: Money;
  ltvToCacRatio: number | null;
  revenuePerChair: Money;
  revenuePerDay: Money;
}

export interface Insight {
  type: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  data?: unknown;
}

export interface ServicePerformanceRow {
  serviceId: string | null;
  name: string;
  bookings: number;
  quantity: Money;
  revenue: Money;
  averageTicket: Money;
  shareOfRevenuePct: number;
}

export interface StaffLeaderboardRow {
  staffId: string;
  name: string;
  branchId: string;
  avatarUrl: string | null;
  rating: Money;
  revenue: Money;
  servicesBilled: number;
  averageBill: Money;
  shareOfRevenuePct: number;
}

// ------------------------------------------------- plan usage & allowances --

export type MeterKey = 'WA_UTILITY' | 'WA_MARKETING' | 'WA_AUTHENTICATION' | 'SMS' | 'EMAIL';

export interface MeterSummary {
  meter: MeterKey;
  label: string;
  included: number;
  used: number;
  remaining: number;
  blocked: number;
  credits: number;
  available: number;
  percentUsed: number;
}

export interface SendingStatus {
  blocked: boolean;
  blockedAt: string | null;
  reason: string | null;
  owedMessages: number;
}

export interface UsageSummary {
  sending: SendingStatus;
  period: { start: string; end: string; label: string; daysLeft: number };
  plan: { code: string; name: string } | null;
  meters: MeterSummary[];
}

export interface LimitCheck {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
}

export interface LimitsSummary {
  plan: { code: string; name: string; extraBranchPrice: string | number | null } | null;
  branches: LimitCheck;
  staff: LimitCheck;
  customers: LimitCheck;
  campaigns?: LimitCheck;
}

export interface AddOnPack {
  id: string;
  code: string;
  name: string;
  meter: MeterKey;
  quantity: number;
  price: string | number;
}

/** Anything at or above this is shown as "unlimited" — a fair-use ceiling. */
export const FAIR_USE_UNLIMITED = 1_000_000;

// ------------------------------------------------------------ audit trail --

export interface AuditUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  branchId: string | null;
  user: AuditUser | null;
}

export interface AuditFacets {
  actions: { action: string; count: number }[];
  groups: string[];
  users: { id: string; name: string; role: string; count: number }[];
}

export interface AuditSummary {
  windowDays: number;
  total: number;
  today: number;
  /** Voids, refunds and points adjustments — where money leaves quietly. */
  needsAttention: number;
  topActions: { action: string; count: number }[];
}

// ------------------------------------------------- template library & setup --

export type Channel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'IN_APP';

export type LibraryOccasion =
  | 'appointment' | 'billing' | 'review' | 'winback' | 'birthday' | 'festival'
  | 'offer' | 'membership' | 'package' | 'loyalty' | 'referral' | 'lead'
  | 'otp' | 'operations';

export interface LibraryTemplate {
  key: string;
  title: string;
  purpose: string;
  occasion: LibraryOccasion;
  channel: Channel;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'SERVICE';
  language: string;
  bodyText: string;
  variables: string[];
  subject?: string;
  tip?: string;
  installed: boolean;
  installedId?: string;
}

export interface LibraryBrowse {
  occasions: { key: LibraryOccasion; label: string; description: string; count: number }[];
  items: LibraryTemplate[];
  total: number;
}

export interface AutomationStep {
  id: string;
  sortOrder: number;
  actionType: string;
  delayMinutes: number;
  channel: Channel | null;
  template: { id: string; name: string; channel: Channel; category: string } | null;
}

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  triggerLabel: string;
  /** Null when the automation has no adjustable delay. */
  timingLabel: string | null;
  help: string;
  isActive: boolean;
  days: number | null;
  sendAfterHour: number | null;
  sendBeforeHour: number | null;
  runs: number;
  steps: AutomationStep[];
}

export type SetupStatus = 'NOT_CONNECTED' | 'PENDING' | 'CONNECTED' | 'FAILED';

/**
 * Whether a channel can send this second, which is not the same as whether the
 * salon has filled the form in: the server may be sending through the
 * platform's own account. `status` describes the salon's row, `delivery`
 * describes reality — gate the Send test button on `delivery.live`.
 */
export interface ChannelDelivery {
  live: boolean;
  source: 'tenant' | 'environment' | 'none';
  /** When not live, what is actually absent — shown to whoever has to fix it. */
  missing: string | null;
  /** True when messages are recorded and tracked but nothing is delivered. */
  simulated: boolean;
}

export interface MessagingSetup {
  whatsapp: {
    delivery: ChannelDelivery;
    status: SetupStatus;
    phoneNumberId: string | null;
    businessId: string | null;
    displayNumber: string | null;
    accessToken: string | null;
    verifiedAt: string | null;
  };
  sms: {
    delivery: ChannelDelivery;
    status: SetupStatus;
    senderId: string | null;
    dltEntityId: string | null;
    route: string | null;
    apiKey: string | null;
  };
  email: {
    delivery: ChannelDelivery;
    status: SetupStatus;
    fromName: string | null;
    fromAddress: string | null;
    replyTo: string | null;
    apiKey: string | null;
  };
}

// ---------------------------------------------------------------- HR ----

export interface AttendanceRow {
  id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'WEEKLY_OFF' | 'HOLIDAY';
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  notes: string | null;
}

export interface AttendanceView {
  period: { from: string; to: string };
  totals: { daysMarked: number; daysPresent: number; daysAbsent: number; onLeave: number; hoursWorked: number };
  items: AttendanceRow[];
  total: number;
}

export interface CommissionEntry {
  id: string;
  baseAmount: Money;
  ratePct: Money;
  amount: Money;
  earnedOn: string;
  isPaid: boolean;
  invoice?: { id: string; invoiceNumber: string } | null;
}

export interface CommissionView {
  items: CommissionEntry[];
  total: number;
  totalAmount: Money;
  unpaidAmount: Money;
}

export interface Payslip {
  id: string;
  baseSalary: Money;
  commission: Money;
  incentive: Money;
  deductions: Money;
  netPay: Money;
  daysPresent: number;
  notes: string | null;
  payroll: { id: string; periodMonth: number; periodYear: number; status: string; paidAt: string | null };
}

export interface LeaveRequest {
  id: string;
  fromDate: string;
  toDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
}

/** GET /invoices/billing-defaults — what the counter needs before the first line goes on a bill. */
export interface BillingDefaults {
  gstByDefault: boolean;
  hasGstin: boolean;
  pricesIncludeTax: boolean;
  defaultGstRate: number;
  canChooseGst: boolean;
}
