import type { SessionUser } from './types';

/**
 * Mirrors `src/core/permissions.ts` in the API. The server is still the
 * authority — this only decides what to *show*, so a stylist is not handed a
 * payroll link they would be refused anyway.
 */
export const P = {
  BRANCH_VIEW: 'branch.view',
  BRANCH_MANAGE: 'branch.manage',
  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  TENANT_MANAGE: 'tenant.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_VIEW: 'audit.view',

  CUSTOMER_VIEW: 'customer.view',
  CUSTOMER_MANAGE: 'customer.manage',
  CUSTOMER_EXPORT: 'customer.export',
  CUSTOMER_IMPORT: 'customer.import',

  SERVICE_VIEW: 'service.view',
  SERVICE_MANAGE: 'service.manage',

  STAFF_VIEW: 'staff.view',
  STAFF_MANAGE: 'staff.manage',
  STAFF_SELF: 'staff.self',
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MANAGE: 'attendance.manage',
  PAYROLL_VIEW: 'payroll.view',
  PAYROLL_MANAGE: 'payroll.manage',
  COMMISSION_VIEW: 'commission.view',
  COMMISSION_MANAGE: 'commission.manage',

  APPOINTMENT_VIEW: 'appointment.view',
  APPOINTMENT_VIEW_OWN: 'appointment.view_own',
  APPOINTMENT_MANAGE: 'appointment.manage',
  APPOINTMENT_CANCEL: 'appointment.cancel',

  INVOICE_VIEW: 'invoice.view',
  INVOICE_CREATE: 'invoice.create',
  INVOICE_VOID: 'invoice.void',
  INVOICE_DELETE: 'invoice.delete',
  INVOICE_DISCOUNT: 'invoice.discount',
  INVOICE_GST_CHOICE: 'invoice.gst_choice',
  PAYMENT_MANAGE: 'payment.manage',
  REFUND_MANAGE: 'refund.manage',
  COUPON_MANAGE: 'coupon.manage',

  PACKAGE_VIEW: 'package.view',
  PACKAGE_MANAGE: 'package.manage',
  MEMBERSHIP_VIEW: 'membership.view',
  MEMBERSHIP_MANAGE: 'membership.manage',
  LOYALTY_VIEW: 'loyalty.view',
  LOYALTY_MANAGE: 'loyalty.manage',

  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage',
  PURCHASE_MANAGE: 'purchase.manage',
  SUPPLIER_MANAGE: 'supplier.manage',

  EXPENSE_VIEW: 'expense.view',
  EXPENSE_MANAGE: 'expense.manage',

  LEAD_VIEW: 'lead.view',
  LEAD_MANAGE: 'lead.manage',
  CAMPAIGN_VIEW: 'campaign.view',
  CAMPAIGN_MANAGE: 'campaign.manage',
  SEGMENT_MANAGE: 'segment.manage',
  TEMPLATE_MANAGE: 'template.manage',
  JOURNEY_MANAGE: 'journey.manage',
  MESSAGE_SEND: 'message.send',
  FEEDBACK_VIEW: 'feedback.view',
  FEEDBACK_MANAGE: 'feedback.manage',
  GAMIFICATION_MANAGE: 'gamification.manage',

  REPORT_VIEW: 'report.view',
  REPORT_FINANCIAL: 'report.financial',
  DASHBOARD_VIEW: 'dashboard.view',
} as const;

export type Permission = (typeof P)[keyof typeof P];

export function can(user: Pick<SessionUser, 'permissions'> | null, ...permissions: Permission[]): boolean {
  if (!user) return false;
  return permissions.every((permission) => user.permissions.includes(permission));
}

export function canAny(user: Pick<SessionUser, 'permissions'> | null, ...permissions: Permission[]): boolean {
  if (!user) return false;
  return permissions.some((permission) => user.permissions.includes(permission));
}

export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  REGIONAL_MANAGER: 'Regional manager',
  MANAGER: 'Manager',
  RECEPTIONIST: 'Receptionist',
  STYLIST: 'Stylist',
  ACCOUNTANT: 'Accountant',
};

/**
 * Plain-language names for every permission, grouped the way an owner thinks
 * about the salon rather than the way the code is organised. Anything the API
 * adds that is missing here still shows, under its raw key.
 */
export const PERMISSION_GROUPS: { title: string; items: { key: string; label: string; note?: string }[] }[] = [
  {
    title: 'Customers',
    items: [
      { key: 'customer.view', label: 'See customers' },
      { key: 'customer.manage', label: 'Add and edit customers' },
      { key: 'customer.export', label: 'Export the customer list', note: 'Phone numbers leave the building' },
      { key: 'customer.import', label: 'Import customers' },
    ],
  },
  {
    title: 'Bookings',
    items: [
      { key: 'appointment.view', label: 'See every appointment' },
      { key: 'appointment.view_own', label: 'See their own appointments' },
      { key: 'appointment.manage', label: 'Book and reschedule' },
      { key: 'appointment.cancel', label: 'Cancel appointments' },
    ],
  },
  {
    title: 'Billing',
    items: [
      { key: 'invoice.view', label: 'See bills' },
      { key: 'invoice.create', label: 'Make a bill' },
      { key: 'invoice.discount', label: 'Give discounts' },
      { key: 'invoice.gst_choice', label: 'Choose GST or no-GST per bill', note: 'Otherwise the salon default applies' },
      { key: 'payment.manage', label: 'Record and remove payments', note: 'Can change a bill from paid to due' },
      { key: 'refund.manage', label: 'Refund' },
      { key: 'invoice.void', label: 'Void a bill' },
      { key: 'invoice.delete', label: 'Delete a voided bill', note: 'Leaves a gap in the invoice sequence' },
      { key: 'coupon.manage', label: 'Manage coupons' },
    ],
  },
  {
    title: 'Team',
    items: [
      { key: 'staff.view', label: 'See team members' },
      { key: 'staff.manage', label: 'Add and edit team members' },
      { key: 'staff.self', label: 'See their own record' },
      { key: 'attendance.view', label: 'See attendance' },
      { key: 'attendance.manage', label: 'Mark attendance and approve leave' },
      { key: 'commission.view', label: 'See commission' },
      { key: 'commission.manage', label: 'Pay out commission' },
      { key: 'payroll.view', label: 'See salaries and payslips' },
      { key: 'payroll.manage', label: 'Run payroll' },
    ],
  },
  {
    title: 'Products & packages',
    items: [
      { key: 'service.view', label: 'See the service menu' },
      { key: 'service.manage', label: 'Edit the service menu' },
      { key: 'package.view', label: 'See packages' },
      { key: 'package.manage', label: 'Manage packages' },
      { key: 'membership.view', label: 'See memberships' },
      { key: 'membership.manage', label: 'Manage membership plans' },
      { key: 'loyalty.view', label: 'See loyalty points' },
      { key: 'loyalty.manage', label: 'Adjust loyalty points' },
      { key: 'inventory.view', label: 'See stock' },
      { key: 'inventory.manage', label: 'Adjust stock' },
      { key: 'purchase.manage', label: 'Raise purchase orders' },
      { key: 'supplier.manage', label: 'Manage suppliers' },
      { key: 'expense.view', label: 'See expenses' },
      { key: 'expense.manage', label: 'Record expenses' },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { key: 'lead.view', label: 'See leads' },
      { key: 'lead.manage', label: 'Work leads' },
      { key: 'campaign.view', label: 'See campaigns' },
      { key: 'campaign.manage', label: 'Run campaigns' },
      { key: 'segment.manage', label: 'Build segments' },
      { key: 'template.manage', label: 'Edit message templates' },
      { key: 'journey.manage', label: 'Edit automations' },
      { key: 'message.send', label: 'Send messages' },
      { key: 'feedback.view', label: 'See feedback' },
      { key: 'feedback.manage', label: 'Reply to feedback' },
      { key: 'gamification.manage', label: 'Run challenges and referrals' },
    ],
  },
  {
    title: 'Reports & settings',
    items: [
      { key: 'dashboard.view', label: 'See the dashboard' },
      { key: 'report.view', label: 'See reports' },
      { key: 'report.financial', label: 'See financial reports' },
      { key: 'branch.view', label: 'See branches' },
      { key: 'branch.manage', label: 'Manage branches' },
      { key: 'user.view', label: 'See logins' },
      { key: 'user.manage', label: 'Add logins and change permissions', note: 'Can grant themselves anything' },
      { key: 'settings.manage', label: 'Change settings' },
      { key: 'tenant.manage', label: 'Change salon details' },
      { key: 'audit.view', label: 'See the activity log' },
    ],
  },
];
