import type { PosContext } from '@/lib/types';

/**
 * WHAT A CUSTOMER'S PACKAGE COVERS ON THE BILL IN FRONT OF YOU.
 *
 * A package is sessions already paid for: three facials, two hair spas. The till
 * has to answer one question every time a service is added — "is this one of
 * them, or is it extra?" — and get it right, because getting it wrong means
 * charging somebody twice for something they have already bought.
 *
 * Why this is a module of its own rather than a few lines inside the till:
 *
 *   · THE CART IS PART OF THE SUM. A customer with one facial left who has
 *     already got a facial in the cart has nothing left for a second one. The
 *     remaining count that matters is the stored one MINUS what this unsaved bill
 *     is already claiming, and the server knows nothing about the cart yet.
 *   · QUANTITY, NOT JUST PRESENCE. Two facials on one line is two sessions. A
 *     check that only asks "is this service covered" over-claims the moment
 *     somebody presses the + button.
 *   · IT IS WORTH TESTING. This is the arithmetic between "free" and "₹1,800",
 *     and it is pure, so it is tested directly rather than through a screen.
 *
 * Deliberately NOT handled here: membership benefits. They look similar and are
 * not — a membership gives complimentary services against a subscription with
 * its own usage rows, and the backend consumes them through a different path.
 * Folding the two into one "entitlement" abstraction would read as tidier and
 * would make every change to either one risk the other.
 */

/** One service a held package still has sessions for. */
export type Entitlement = PosContext['packages'][number];

/** The minimum a cart line has to expose for the sum below to be right. */
export interface CoverableLine {
  itemType: string;
  refId: string;
  quantity: number;
  redeemFrom: 'NONE' | 'PACKAGE' | 'MEMBERSHIP';
  packagePurchaseItemId?: string;
}

export interface Credit {
  entitlement: Entitlement;
  /** Sessions still unclaimed once this cart is accounted for. May be 0. */
  left: number;
}

/**
 * What is still free to use, after the current cart has taken its share.
 *
 * Keyed by purchaseItemId — the entitlement row — not by service, because a
 * customer can hold the same service in two different packages and they expire
 * on different days.
 */
export function packageCredit(entitlements: Entitlement[], lines: CoverableLine[]): Credit[] {
  const credit = new Map<string, Credit>();
  for (const entitlement of entitlements) {
    credit.set(entitlement.purchaseItemId, { entitlement, left: entitlement.remaining });
  }

  for (const line of lines) {
    if (line.redeemFrom !== 'PACKAGE' || !line.packagePurchaseItemId) continue;
    const entry = credit.get(line.packagePurchaseItemId);
    // A line redeeming from a package that is no longer in the list (expired
    // between page load and now, or cancelled) is left alone rather than
    // silently re-charged. The server refuses it at save time with a reason the
    // front desk can read, which is better than a price changing by itself.
    if (entry) entry.left -= line.quantity;
  }

  return [...credit.values()];
}

/**
 * The entitlement to spend on one more of this service, or null.
 *
 * SOONEST TO EXPIRE WINS. With two packages covering the same service, using the
 * one that lapses first is the only choice that cannot lose the customer a
 * session — the other one is still there next month. Spending the longer-dated
 * one first is how somebody ends up with sessions they paid for and cannot use.
 */
export function coverFor(credit: Credit[], serviceId: string, quantity = 1): Credit | null {
  const usable = credit
    .filter((entry) => entry.entitlement.serviceId === serviceId && entry.left >= quantity)
    .sort((a, b) => Date.parse(a.entitlement.expiresAt) - Date.parse(b.entitlement.expiresAt));
  return usable[0] ?? null;
}

/**
 * Lines being charged for that the customer has in fact already paid for.
 *
 * This is the case the till cannot fix by itself. Services get added before the
 * customer is attached — the search box is right there and the catalogue is
 * right there — so by the time the packages are known, the cart is already
 * priced. Rewriting those lines unprompted would change totals under somebody's
 * hands mid-bill, which is worse than charging twice: at least the second one is
 * visible. So they are surfaced and applied on a click.
 *
 * Returned in cart order, and the running sum matters: three facials in the cart
 * against one session left reports only the first.
 */
export function overchargedLines<T extends CoverableLine>(entitlements: Entitlement[], lines: T[]): { line: T; credit: Credit }[] {
  const credit = packageCredit(entitlements, lines);
  const found: { line: T; credit: Credit }[] = [];

  for (const line of lines) {
    if (line.itemType !== 'SERVICE' || line.redeemFrom !== 'NONE') continue;
    const cover = coverFor(credit, line.refId, line.quantity);
    if (!cover) continue;
    cover.left -= line.quantity;
    found.push({ line, credit: cover });
  }

  return found;
}

/** The held packages, grouped for display: one card per package, its services under it. */
export function heldPackages(entitlements: Entitlement[]) {
  const byPurchase = new Map<
    string,
    { purchaseId: string; packageName: string; expiresAt: string; services: Entitlement[] }
  >();

  for (const entitlement of entitlements) {
    const existing = byPurchase.get(entitlement.purchaseId);
    if (existing) existing.services.push(entitlement);
    else
      byPurchase.set(entitlement.purchaseId, {
        purchaseId: entitlement.purchaseId,
        packageName: entitlement.packageName,
        expiresAt: entitlement.expiresAt,
        services: [entitlement],
      });
  }

  // Soonest to expire first, for the same reason coverFor spends it first.
  return [...byPurchase.values()].sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
}
