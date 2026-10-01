'use client';

import { CalendarClock, Check, Gift, Package, Plus } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/display';
import { date, money } from '@/lib/format';
import type { PackageTemplate, PosContext, Service } from '@/lib/types';
import { type Credit, heldPackages } from './package-matching';

/**
 * PACKAGES AT THE TILL — THE TWO HALVES.
 *
 * `PackageHoldings` is what the customer already owns: what each package
 * includes, how much of it is left, and when it lapses.
 * `PackageCatalogue` is the packages for sale, each showing what is in it.
 *
 * Both exist because a package is the one thing on this screen the front desk
 * cannot see from the bill. A membership shows as a badge, loyalty points show as
 * a number, but "three facials, one used, expires in nine days" is invisible —
 * and a package nobody can see is a package that gets charged for twice and then
 * expires unused.
 */

function daysUntil(iso: string): number {
  return Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
}

/**
 * WHAT THEY ALREADY PAID FOR, AND WHAT IS LEFT OF IT.
 *
 * One card per package rather than a flat row of service chips, which is what
 * this used to be. The flat list could not answer the question the front desk
 * actually asks — "what is in her package?" — and with two packages held at once
 * it could not even say which service belonged to which.
 *
 * `n of m left` rather than `n left`, so a package barely touched and one nearly
 * finished do not look the same. Expiry is shown in days when it is close, and
 * tinted when it is very close: an unused session is money the salon has already
 * taken and will keep, which sounds like a win and is how a customer decides not
 * to come back.
 */
export function PackageHoldings({
  credit,
  services,
  onRedeem,
}: {
  credit: Credit[];
  services: Service[];
  onRedeem: (service: Service, purchaseItemId: string) => void;
}) {
  const packages = heldPackages(credit.map((entry) => entry.entitlement));
  if (packages.length === 0) return null;

  /** Sessions left on this bill, not sessions left in the database. */
  const leftOn = new Map(credit.map((entry) => [entry.entitlement.purchaseItemId, entry.left]));

  return (
    <Card className="border-brand-200 bg-brand-50/40">
      <CardBody className="space-y-3 py-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-900">
          <Gift className="h-3.5 w-3.5" />
          Already paid for — add these free before charging for anything
        </p>

        {packages.map((pack) => {
          const days = daysUntil(pack.expiresAt);
          return (
            <div key={pack.purchaseId} className="rounded-lg border border-brand-200 bg-white p-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
                  <Package className="h-3.5 w-3.5 text-brand-600" />
                  {pack.packageName}
                </p>
                <p
                  className={`flex items-center gap-1 text-2xs ${
                    days <= 14 ? 'font-medium text-amber-700' : 'text-ink-subtle'
                  }`}
                >
                  <CalendarClock className="h-3 w-3" />
                  {/* Days while that is the useful unit, a date once it is not.
                      "valid" said nothing, and "193 days left" is a number
                      nobody converts into a month in their head. */}
                  {days <= 0 ? 'expires today' : days <= 45 ? `${days} days left` : `until ${date(pack.expiresAt, 'DD MMM')}`}
                </p>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {pack.services.map((entitlement) => {
                  const service = services.find((candidate) => candidate.id === entitlement.serviceId);
                  const left = leftOn.get(entitlement.purchaseItemId) ?? 0;
                  const spent = left <= 0;

                  return (
                    <button
                      key={entitlement.purchaseItemId}
                      type="button"
                      disabled={!service || spent}
                      onClick={() => service && onRedeem(service, entitlement.purchaseItemId)}
                      title={
                        !service
                          ? 'This service is no longer on the menu — bill it by hand or put the service back'
                          : spent
                            ? 'All of these are already on this bill'
                            : `Add ${entitlement.serviceName} at no charge`
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 enabled:border-brand-300 enabled:bg-white enabled:text-brand-800 enabled:hover:bg-brand-100 disabled:border-stone-200 disabled:bg-stone-50 disabled:text-ink-subtle"
                    >
                      {spent ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {entitlement.serviceName}
                      <span className="tnum text-2xs">
                        {spent ? 'all on this bill' : `${left} of ${entitlement.totalQty} left`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

/**
 * PACKAGES FOR SALE, WITH WHAT IS IN EACH ONE.
 *
 * The contents are the whole product. "Bridal Package · ₹12,000" tells the
 * customer standing at the counter nothing, and the person selling it has to
 * remember — so the services and their quantities are listed on the card, with
 * what the same services would cost bought one at a time. A package that is not
 * cheaper than its parts is one nobody should be selling, and this makes that
 * visible to the salon as well as to the customer.
 *
 * Needs a customer attached, like a membership: sessions have to belong to
 * somebody or there is nothing to redeem them against later.
 */
export function PackageCatalogue({
  templates,
  services,
  search,
  hasCustomer,
  held,
  onSell,
}: {
  templates: PackageTemplate[];
  services: Service[];
  search: string;
  hasCustomer: boolean;
  held: PosContext['packages'];
  onSell: (template: PackageTemplate) => void;
}) {
  const shown = search
    ? templates.filter((template) => template.name.toLowerCase().includes(search.toLowerCase()))
    : templates;

  if (templates.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-ink-subtle">
        No packages set up yet. Build them in Packages, then they can be sold here.
      </p>
    );
  }

  return (
    <div>
      {!hasCustomer ? (
        <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          Attach a customer first — the sessions in a package have to belong to somebody.
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((template) => {
          /**
           * What the same services cost bought separately. Taken from the service
           * menu rather than from the package, because that is the comparison the
           * customer is making. Missing a price is left out of the sum rather than
           * counted as zero, which would invent a saving that is not there.
           */
          const separately = template.items.reduce((sum, item) => {
            const price = Number(services.find((candidate) => candidate.id === item.serviceId)?.price ?? 0);
            return sum + price * item.quantity;
          }, 0);
          const saving = separately - Number(template.price);
          const alreadyHolds = held.some((entitlement) => entitlement.packageName === template.name);

          return (
            <button
              key={template.id}
              type="button"
              disabled={!hasCustomer}
              onClick={() => onSell(template)}
              className="rounded-lg border border-stone-200 bg-white p-3 text-left hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">{template.name}</span>
                <span className="tnum text-sm font-semibold text-ink">{money(template.price)}</span>
              </div>

              <ul className="mt-1.5 space-y-0.5">
                {template.items.map((item) => (
                  <li key={item.id} className="flex items-baseline gap-1.5 text-2xs text-ink-muted">
                    <span className="tnum font-medium text-ink">{item.quantity}×</span>
                    {item.service.name}
                  </li>
                ))}
              </ul>

              <p className="mt-1.5 text-2xs text-ink-subtle">
                Valid {template.validityDays} days
                {saving > 0 ? ` · ${money(saving)} less than booking them one by one` : ''}
              </p>

              {/* Not blocked — a customer may buy a second one, and topping up
                  before the first lapses is the normal way it happens. Said
                  plainly so it is a decision rather than an accident. */}
              {alreadyHolds ? (
                <p className="mt-1.5 text-2xs font-medium text-amber-700">
                  Already has one of these with sessions left — selling it adds a second.
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
