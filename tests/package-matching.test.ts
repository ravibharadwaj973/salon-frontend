import { describe, expect, it } from 'vitest';
import {
  type CoverableLine,
  type Entitlement,
  coverFor,
  heldPackages,
  overchargedLines,
  packageCredit,
} from '../src/app/(app)/pos/package-matching';

/**
 * THE DIFFERENCE BETWEEN FREE AND ₹1,800.
 *
 * A package is sessions already paid for. Every one of these cases is a way the
 * till can get that wrong, and each wrong answer is a real complaint: charging
 * somebody twice for a facial they bought in March, or giving away a session they
 * do not have.
 *
 * Pure functions, so they are tested directly. The till has no tests of its own
 * and will not get any soon; this is the part of it that touches money.
 */

const day = 86_400_000;
const iso = (inDays: number) => new Date(Date.now() + inDays * day).toISOString();

function entitlement(over: Partial<Entitlement> & { purchaseItemId: string; serviceId: string }): Entitlement {
  return {
    purchaseId: `purchase-${over.purchaseItemId}`,
    packageName: 'Glow Package',
    serviceName: 'Facial',
    remaining: 1,
    totalQty: 3,
    usedQty: 2,
    expiresAt: iso(30),
    ...over,
  } as Entitlement;
}

function line(over: Partial<CoverableLine> & { refId: string }): CoverableLine {
  return { itemType: 'SERVICE', quantity: 1, redeemFrom: 'NONE', ...over };
}

describe('what is left, counting the cart', () => {
  it('starts from what the customer has', () => {
    const credit = packageCredit([entitlement({ purchaseItemId: 'e1', serviceId: 'facial', remaining: 3 })], []);
    expect(credit[0]!.left).toBe(3);
  });

  it('subtracts sessions this unsaved bill is already claiming', () => {
    // The server has no idea about the cart yet. If this is not counted, a
    // customer with one session left gets two services free.
    const credit = packageCredit(
      [entitlement({ purchaseItemId: 'e1', serviceId: 'facial', remaining: 2 })],
      [line({ refId: 'facial', redeemFrom: 'PACKAGE', packagePurchaseItemId: 'e1' })],
    );
    expect(credit[0]!.left).toBe(1);
  });

  it('counts quantity, not lines', () => {
    // Two facials on one line is two sessions. A presence check over-claims the
    // moment somebody presses the + button.
    const credit = packageCredit(
      [entitlement({ purchaseItemId: 'e1', serviceId: 'facial', remaining: 3 })],
      [line({ refId: 'facial', quantity: 2, redeemFrom: 'PACKAGE', packagePurchaseItemId: 'e1' })],
    );
    expect(credit[0]!.left).toBe(1);
  });

  it('ignores lines redeemed from a membership', () => {
    // A membership benefit is a different thing with its own usage rows. Counting
    // it against a package would eat a session nobody spent.
    const credit = packageCredit(
      [entitlement({ purchaseItemId: 'e1', serviceId: 'facial', remaining: 1 })],
      [line({ refId: 'facial', redeemFrom: 'MEMBERSHIP' })],
    );
    expect(credit[0]!.left).toBe(1);
  });
});

describe('which package to spend', () => {
  it('offers nothing once the cart has used it all up', () => {
    const credit = packageCredit(
      [entitlement({ purchaseItemId: 'e1', serviceId: 'facial', remaining: 1 })],
      [line({ refId: 'facial', redeemFrom: 'PACKAGE', packagePurchaseItemId: 'e1' })],
    );
    expect(coverFor(credit, 'facial')).toBeNull();
  });

  it('offers nothing for a service no package covers', () => {
    const credit = packageCredit([entitlement({ purchaseItemId: 'e1', serviceId: 'facial' })], []);
    expect(coverFor(credit, 'hair-spa')).toBeNull();
  });

  it('spends the package that expires soonest', () => {
    // The other one is still there next month. Spending the longer-dated one
    // first is how a customer loses a session they paid for.
    const credit = packageCredit(
      [
        entitlement({ purchaseItemId: 'later', serviceId: 'facial', packageName: 'Annual', expiresAt: iso(300) }),
        entitlement({ purchaseItemId: 'sooner', serviceId: 'facial', packageName: 'Trial', expiresAt: iso(5) }),
      ],
      [],
    );
    expect(coverFor(credit, 'facial')?.entitlement.purchaseItemId).toBe('sooner');
  });

  it('will not split a quantity across two packages', () => {
    // Three facials on one line against two packages with one session each is not
    // covered: the line is one redemption against one entitlement, and claiming it
    // anyway would send the server a redemption it has to refuse.
    const credit = packageCredit(
      [
        entitlement({ purchaseItemId: 'e1', serviceId: 'facial', remaining: 1 }),
        entitlement({ purchaseItemId: 'e2', serviceId: 'facial', remaining: 1 }),
      ],
      [],
    );
    expect(coverFor(credit, 'facial', 3)).toBeNull();
    expect(coverFor(credit, 'facial', 1)).not.toBeNull();
  });
});

describe('services being charged for that are already paid for', () => {
  it('finds a charged line the customer owns', () => {
    const found = overchargedLines(
      [entitlement({ purchaseItemId: 'e1', serviceId: 'facial', remaining: 2 })],
      [line({ refId: 'facial' })],
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.credit.entitlement.purchaseItemId).toBe('e1');
  });

  it('stops at what is actually left', () => {
    // Three facials in the cart, one session owned: exactly one is reported, or
    // the "use the package" button would claim three and the save would fail.
    const found = overchargedLines(
      [entitlement({ purchaseItemId: 'e1', serviceId: 'facial', remaining: 1 })],
      [line({ refId: 'facial' }), line({ refId: 'facial' }), line({ refId: 'facial' })],
    );
    expect(found).toHaveLength(1);
  });

  it('leaves lines already redeeming alone', () => {
    const found = overchargedLines(
      [entitlement({ purchaseItemId: 'e1', serviceId: 'facial', remaining: 2 })],
      [line({ refId: 'facial', redeemFrom: 'PACKAGE', packagePurchaseItemId: 'e1' })],
    );
    expect(found).toHaveLength(0);
  });

  it('never reports a product', () => {
    // A package holds services. A retail bottle with the same id would otherwise
    // be given away.
    const found = overchargedLines(
      [entitlement({ purchaseItemId: 'e1', serviceId: 'facial', remaining: 2 })],
      [line({ refId: 'facial', itemType: 'PRODUCT' })],
    );
    expect(found).toHaveLength(0);
  });

  it('reports nothing when the customer holds nothing', () => {
    expect(overchargedLines([], [line({ refId: 'facial' })])).toHaveLength(0);
  });
});

describe('grouping for display', () => {
  it('puts each package on one card with its services under it', () => {
    const grouped = heldPackages([
      entitlement({ purchaseItemId: 'a1', serviceId: 'facial', serviceName: 'Facial' }),
      entitlement({ purchaseItemId: 'a2', serviceId: 'spa', serviceName: 'Hair Spa' }),
    ].map((e) => ({ ...e, purchaseId: 'bridal' })));

    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.services.map((s) => s.serviceName)).toEqual(['Facial', 'Hair Spa']);
  });

  it('keeps two packages apart even when they hold the same service', () => {
    const grouped = heldPackages([
      entitlement({ purchaseItemId: 'a1', serviceId: 'facial', packageName: 'Trial' }),
      { ...entitlement({ purchaseItemId: 'b1', serviceId: 'facial', packageName: 'Annual' }), purchaseId: 'second' },
    ]);
    expect(grouped).toHaveLength(2);
  });

  it('shows the one expiring soonest first', () => {
    const grouped = heldPackages([
      { ...entitlement({ purchaseItemId: 'a1', serviceId: 'facial', packageName: 'Annual', expiresAt: iso(300) }), purchaseId: 'annual' },
      { ...entitlement({ purchaseItemId: 'b1', serviceId: 'facial', packageName: 'Trial', expiresAt: iso(5) }), purchaseId: 'trial' },
    ]);
    expect(grouped.map((pack) => pack.packageName)).toEqual(['Trial', 'Annual']);
  });
});
