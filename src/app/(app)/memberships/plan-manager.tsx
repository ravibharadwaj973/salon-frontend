'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiPatch, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader } from '@/components/ui/display';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { money, percent } from '@/lib/format';
import type { MembershipPlan, Service } from '@/lib/types';

/**
 * Membership plans are the salon's own product — "Gold: ₹4,999 a year, 15% off
 * every service, two free haircuts and priority booking". Every number here is
 * the owner's to set; the platform only enforces what they chose.
 *
 * Plans that have been sold are never deleted, only retired: the members who
 * bought them keep their benefits until expiry, and the plan simply disappears
 * from the counter.
 */

const DURATIONS = [
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '12 months' },
];

interface BenefitDraft {
  serviceId: string;
  quantity: number;
}

interface PlanDraft {
  name: string;
  description: string;
  price: string;
  durationDays: number;
  serviceDiscountPct: string;
  productDiscountPct: string;
  priorityBooking: boolean;
  birthdayBenefit: string;
  loyaltyMultiplier: string;
  benefits: BenefitDraft[];
}

const EMPTY: PlanDraft = {
  name: '',
  description: '',
  price: '',
  durationDays: 365,
  serviceDiscountPct: '10',
  productDiscountPct: '0',
  priorityBooking: false,
  birthdayBenefit: '',
  loyaltyMultiplier: '1',
  benefits: [],
};

function toDraft(plan: MembershipPlan): PlanDraft {
  return {
    name: plan.name,
    description: plan.description ?? '',
    price: String(Number(plan.price)),
    durationDays: plan.durationDays,
    serviceDiscountPct: String(Number(plan.serviceDiscountPct)),
    productDiscountPct: String(Number(plan.productDiscountPct)),
    priorityBooking: plan.priorityBooking,
    birthdayBenefit: plan.birthdayBenefit ?? '',
    loyaltyMultiplier: String(Number(plan.loyaltyMultiplier)),
    benefits: plan.benefits.map((b) => ({ serviceId: b.serviceId, quantity: b.quantity })),
  };
}

export function durationLabel(days: number): string {
  const preset = DURATIONS.find((d) => d.days === days);
  return preset ? preset.label : `${days} days`;
}

export function PlanManager({
  plans,
  services,
  canManage,
}: {
  plans: MembershipPlan[];
  services: Service[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<string | null>(null);

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function startNew() {
    setEditing(null);
    setDraft(EMPTY);
    setError(null);
    setOpen(true);
  }

  function startEdit(plan: MembershipPlan) {
    setEditing(plan);
    setDraft(toDraft(plan));
    setError(null);
    setOpen(true);
  }

  /** What the member gets back in a year, so the owner can see the plan pays for itself — or doesn't. */
  const worth = useMemo(() => {
    return draft.benefits.reduce((sum, b) => {
      const service = serviceById.get(b.serviceId);
      return sum + (service ? Number(service.price) * b.quantity : 0);
    }, 0);
  }, [draft.benefits, serviceById]);

  async function save() {
    setError(null);
    const price = Number(draft.price);
    if (!draft.name.trim()) return setError('Give the plan a name — it is what the customer will see on their bill.');
    if (!Number.isFinite(price) || price < 0) return setError('Enter the price of the plan.');
    if (draft.benefits.some((b) => !b.serviceId)) return setError('Pick a service for every complimentary line, or remove it.');

    const body = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      price,
      durationDays: draft.durationDays,
      serviceDiscountPct: Number(draft.serviceDiscountPct) || 0,
      productDiscountPct: Number(draft.productDiscountPct) || 0,
      priorityBooking: draft.priorityBooking,
      birthdayBenefit: draft.birthdayBenefit.trim() || undefined,
      loyaltyMultiplier: Number(draft.loyaltyMultiplier) || 1,
      benefits: draft.benefits.map((b) => ({ serviceId: b.serviceId, quantity: Math.max(1, b.quantity) })),
    };

    setSaving(true);
    try {
      if (editing) {
        await apiPatch(`memberships/plans/${editing.id}`, body);
        toast.success('Plan updated');
      } else {
        await apiPost('memberships/plans', body);
        toast.success('Plan created — it is on sale at the counter now');
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(plan: MembershipPlan, isActive: boolean) {
    setRetiring(plan.id);
    try {
      await apiPatch(`memberships/plans/${plan.id}`, { isActive });
      toast.success(isActive ? `${plan.name} is back on sale` : `${plan.name} retired — existing members keep their benefits`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRetiring(null);
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Plans</h2>
          <p className="text-xs text-ink-muted">What you sell, at your prices. Sold at the counter like any other item.</p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={startNew}>
            <Plus className="h-4 w-4" />
            New plan
          </Button>
        ) : null}
      </div>

      {plans.length === 0 ? (
        <Card className="mb-5">
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-ink">No membership plans yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-ink-muted">
              A membership is a reason to come back: a yearly fee in exchange for a discount on every visit and a few
              services thrown in. Members visit more often and are far cheaper to keep than new customers are to find.
            </p>
            {canManage ? (
              <Button size="sm" className="mt-4" onClick={startNew}>
                <Plus className="h-4 w-4" />
                Create your first plan
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.isActive ? 'opacity-70' : undefined}>
              <CardHeader
                title={plan.name}
                subtitle={durationLabel(plan.durationDays)}
                action={plan.isActive ? <Badge tone="success">On sale</Badge> : <Badge>Retired</Badge>}
              />
              <div className="p-5">
                <p className="tnum text-2xl font-semibold text-ink">
                  {money(plan.price)}
                  <span className="text-xs font-normal text-ink-subtle"> + GST</span>
                </p>
                {plan.description ? <p className="mt-1 text-xs text-ink-muted">{plan.description}</p> : null}
                <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
                  {Number(plan.serviceDiscountPct) > 0 ? <li>{percent(Number(plan.serviceDiscountPct), 0)} off all services</li> : null}
                  {Number(plan.productDiscountPct) > 0 ? <li>{percent(Number(plan.productDiscountPct), 0)} off products</li> : null}
                  {plan.benefits.map((benefit) => (
                    <li key={benefit.id}>
                      {benefit.quantity}× complimentary {benefit.service.name}
                    </li>
                  ))}
                  {Number(plan.loyaltyMultiplier) > 1 ? <li>{Number(plan.loyaltyMultiplier)}× loyalty points</li> : null}
                  {plan.priorityBooking ? <li>Priority booking</li> : null}
                  {plan.birthdayBenefit ? <li>Birthday: {plan.birthdayBenefit}</li> : null}
                  {Number(plan.serviceDiscountPct) === 0 &&
                  Number(plan.productDiscountPct) === 0 &&
                  plan.benefits.length === 0 &&
                  !plan.priorityBooking ? (
                    <li className="text-ink-subtle">No benefits set yet</li>
                  ) : null}
                </ul>
                <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                  <p className="text-xs text-ink-subtle">{plan._count?.subscriptions ?? 0} sold</p>
                  {canManage ? (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(plan)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={retiring === plan.id}
                        onClick={() => setActive(plan, !plan.isActive)}
                      >
                        {plan.isActive ? 'Retire' : 'Put on sale'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New membership plan'}
        description={
          editing && (editing._count?.subscriptions ?? 0) > 0
            ? `${editing._count?.subscriptions} people hold this plan. Changes apply to new sales; existing members keep what they bought.`
            : 'Set the price and what members get. You can change any of this later.'
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? 'Save changes' : 'Create plan'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {error ? <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan name" required>
              {({ id }) => <Input id={id} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Gold" autoFocus />}
            </Field>
            <Field label="Valid for">
              {({ id }) => (
                <Select id={id} value={draft.durationDays} onChange={(e) => set('durationDays', Number(e.target.value))}>
                  {DURATIONS.map((d) => (
                    <option key={d.days} value={d.days}>
                      {d.label}
                    </option>
                  ))}
                  {!DURATIONS.some((d) => d.days === draft.durationDays) ? (
                    <option value={draft.durationDays}>{draft.durationDays} days</option>
                  ) : null}
                </Select>
              )}
            </Field>
            <Field label="Price" required hint="Before GST">
              {({ id }) => (
                <Input id={id} type="number" min={0} step="1" inputMode="decimal" value={draft.price} onChange={(e) => set('price', e.target.value)} placeholder="4999" />
              )}
            </Field>
          </div>

          <Field label="One line the customer sees" hint="Optional">
            {({ id }) => (
              <Textarea id={id} rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Our best value for regulars — every visit costs less." />
            )}
          </Field>

          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Discounts on every visit</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Off services" hint="Percent">
                {({ id }) => (
                  <Input id={id} type="number" min={0} max={100} value={draft.serviceDiscountPct} onChange={(e) => set('serviceDiscountPct', e.target.value)} />
                )}
              </Field>
              <Field label="Off products" hint="Percent">
                {({ id }) => (
                  <Input id={id} type="number" min={0} max={100} value={draft.productDiscountPct} onChange={(e) => set('productDiscountPct', e.target.value)} />
                )}
              </Field>
              <Field label="Loyalty points" hint="2 = double">
                {({ id }) => (
                  <Input id={id} type="number" min={0.1} max={10} step="0.5" value={draft.loyaltyMultiplier} onChange={(e) => set('loyaltyMultiplier', e.target.value)} />
                )}
              </Field>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink">Complimentary services</p>
                <p className="text-2xs text-ink-muted">Included in the price — redeemed at the counter until used up.</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => set('benefits', [...draft.benefits, { serviceId: services[0]?.id ?? '', quantity: 1 }])}
                disabled={services.length === 0}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>

            {draft.benefits.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-200 p-3 text-center text-xs text-ink-subtle">
                {services.length === 0 ? 'Add services to your menu first.' : 'None yet — a free haircut or two is the classic sweetener.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {draft.benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={benefit.quantity}
                      onChange={(e) =>
                        set(
                          'benefits',
                          draft.benefits.map((b, i) => (i === index ? { ...b, quantity: Number(e.target.value) || 1 } : b)),
                        )
                      }
                      className="w-16"
                      aria-label="Quantity"
                    />
                    <span className="text-xs text-ink-subtle">×</span>
                    <Select
                      value={benefit.serviceId}
                      onChange={(e) =>
                        set(
                          'benefits',
                          draft.benefits.map((b, i) => (i === index ? { ...b, serviceId: e.target.value } : b)),
                        )
                      }
                      className="flex-1"
                      aria-label="Service"
                    >
                      <option value="">Choose a service…</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} — {money(service.price)}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => set('benefits', draft.benefits.filter((_, i) => i !== index))}
                      className="rounded-md p-1.5 text-ink-subtle hover:bg-stone-100 hover:text-rose-600"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {worth > 0 ? (
              <p className="tnum mt-2 text-2xs text-ink-muted">
                Complimentary services are worth {money(worth)} at menu price
                {Number(draft.price) > 0 ? ` — ${percent((worth / Number(draft.price)) * 100, 0)} of the plan price` : ''}.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Birthday treat" hint="Front desk sees it">
              {({ id }) => (
                <Input id={id} value={draft.birthdayBenefit} onChange={(e) => set('birthdayBenefit', e.target.value)} placeholder="Free hair spa" />
              )}
            </Field>
            <div className="flex items-end pb-1">
              <Checkbox
                label="Priority booking"
                description="Members are offered slots before walk-ins."
                checked={draft.priorityBooking}
                onChange={(e) => set('priorityBooking', e.target.checked)}
              />
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
