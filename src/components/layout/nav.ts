import {
  BadgePercent,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Gauge,
  Gift,
  Heart,
  History,
  LayoutDashboard,
  MessageSquareHeart,
  Megaphone,
  Receipt,
  Scissors,
  Settings,
  Sparkles,
  Star,
  Target,
  Users,
  Wallet,
  Send,
  Workflow,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { P, type Permission } from '@/lib/permissions';

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Shown when the user holds at least one of these. */
  permissions?: Permission[];
  /**
   * Shown only when the salon's plan includes this. Two different questions:
   * `permissions` is what this person may do, `feature` is what the salon
   * bought. Both must pass, and hiding the link beats letting them walk into
   * a 402.
   */
  feature?: string;
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Grouped the way the spec frames the product: operate the salon, handle the
 * money, grow the business, then understand it.
 */
export const NAV: NavGroup[] = [
  {
    label: 'Operate',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard, permissions: [P.DASHBOARD_VIEW], exact: true },
      {
        href: '/calendar',
        label: 'Calendar',
        icon: CalendarDays,
        permissions: [P.APPOINTMENT_VIEW, P.APPOINTMENT_VIEW_OWN],
      },
      { href: '/customers', label: 'Customers', icon: Users, permissions: [P.CUSTOMER_VIEW] },
      { href: '/services', label: 'Services', icon: Scissors, permissions: [P.SERVICE_VIEW] },
      { href: '/staff', label: 'Staff', icon: Sparkles, permissions: [P.STAFF_VIEW, P.STAFF_SELF] },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/pos', label: 'New bill', icon: CreditCard, permissions: [P.INVOICE_CREATE] },
      { href: '/invoices', label: 'Invoices', icon: Receipt, permissions: [P.INVOICE_VIEW] },
      { href: '/packages', label: 'Packages', icon: Gift, permissions: [P.PACKAGE_VIEW] },
      { href: '/memberships', label: 'Memberships', icon: Heart, permissions: [P.MEMBERSHIP_VIEW] },
      { href: '/loyalty', label: 'Loyalty', icon: Star, permissions: [P.LOYALTY_VIEW] },
      { href: '/expenses', label: 'Expenses', icon: Wallet, permissions: [P.EXPENSE_VIEW] },
      { href: '/inventory', label: 'Inventory', icon: Boxes, permissions: [P.INVENTORY_VIEW] },
    ],
  },
  {
    label: 'Grow',
    items: [
      { href: '/leads', label: 'Leads', icon: Target, permissions: [P.LEAD_VIEW], feature: 'leads' },
      { href: '/segments', label: 'Segments', icon: ClipboardList, permissions: [P.CAMPAIGN_VIEW], feature: 'segments' },
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone, permissions: [P.CAMPAIGN_VIEW], feature: 'marketing' },
      { href: '/journeys', label: 'Journeys', icon: Workflow, permissions: [P.CAMPAIGN_VIEW], feature: 'journeys' },
      { href: '/templates', label: 'Templates', icon: BadgePercent, permissions: [P.CAMPAIGN_VIEW] },
      { href: '/automations', label: 'Automations', icon: Workflow, permissions: [P.CAMPAIGN_VIEW] },
      // Sits next to the things that send, because it is where you find out
      // whether they did.
      { href: '/messages', label: 'Messages', icon: Send, permissions: [P.CAMPAIGN_VIEW] },
      { href: '/feedback', label: 'Feedback', icon: MessageSquareHeart, permissions: [P.FEEDBACK_VIEW] },
    ],
  },
  {
    label: 'Understand',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3, permissions: [P.REPORT_VIEW] },
      { href: '/usage', label: 'Usage', icon: Gauge, permissions: [P.SETTINGS_MANAGE] },
      { href: '/activity', label: 'Activity', icon: History, permissions: [P.AUDIT_VIEW] },
      { href: '/settings', label: 'Settings', icon: Settings, permissions: [P.SETTINGS_MANAGE, P.USER_VIEW, P.BRANCH_VIEW] },
    ],
  },
];

export function visibleNav(permissions: string[], features: string[] = []): NavGroup[] {
  const held = new Set(permissions);
  const bought = new Set(features);
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (!item.permissions || item.permissions.some((p) => held.has(p))) &&
        (!item.feature || bought.has(item.feature)),
    ),
  })).filter((group) => group.items.length > 0);
}
