'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, Clock, PartyPopper, Scissors, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { dayjs, duration, money, time } from '@/lib/format';
import type { Service, SlotGroup } from '@/lib/types';

interface Branch {
  id: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  phone: string | null;
}

interface BookableStaff {
  id: string;
  displayName: string;
  designation: string | null;
  avatarUrl: string | null;
  avgRating: string | number;
  specialities: string[];
}

interface Confirmation {
  appointmentId: string;
  startAt: string;
  endAt: string;
  branch: { name: string };
  services: { name: string; staff: string | null; startAt: string }[];
  customer: { firstName: string };
}

type Step = 'services' | 'stylist' | 'time' | 'details' | 'done';

/**
 * A four-step booking flow, deliberately in this order: what you want, who with,
 * when, and only then who you are. Asking for a phone number first is the
 * fastest way to lose a booking.
 */
export function BookingFlow({
  slug,
  salonName,
  branches,
  menu,
}: {
  slug: string;
  salonName: string;
  branches: Branch[];
  menu: { id: string; name: string; services: Service[] }[];
}) {
  const [step, setStep] = useState<Step>('services');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string>('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [slot, setSlot] = useState<string | null>(null);
  const [details, setDetails] = useState({ name: '', phone: '', email: '', notes: '', consent: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const allServices = useMemo(() => menu.flatMap((group) => group.services), [menu]);
  const selected = allServices.filter((service) => serviceIds.includes(service.id));
  const totalMinutes = selected.reduce((sum, service) => sum + service.durationMin, 0);
  const totalPrice = selected.reduce((sum, service) => sum + Number(service.price), 0);

  const { data: staff = [] } = useQuery({
    queryKey: ['public-staff', slug, branchId, serviceIds[0]],
    queryFn: () =>
      apiGet<BookableStaff[]>(`public/${slug}/staff`, {
        query: { branchId, serviceId: serviceIds[0] },
      }),
    enabled: Boolean(branchId) && serviceIds.length > 0 && step === 'stylist',
  });

  const { data: slotGroups, isFetching: loadingSlots } = useQuery({
    queryKey: ['public-slots', slug, branchId, date, serviceIds, staffId],
    queryFn: () =>
      apiGet<SlotGroup[]>(`public/${slug}/slots`, {
        query: { branchId, date, serviceIds: serviceIds.join(','), staffId: staffId || undefined },
      }),
    enabled: serviceIds.length > 0 && Boolean(branchId) && step === 'time',
  });

  const slots = useMemo(() => {
    if (!slotGroups) return [];
    if (staffId) return slotGroups.find((group) => group.staffId === staffId)?.slots ?? [];
    // "Anyone" — merge every stylist's openings and de-duplicate by start time.
    const seen = new Map<string, { start: string; label: string }>();
    for (const group of slotGroups) {
      for (const item of group.slots) if (!seen.has(item.label)) seen.set(item.label, item);
    }
    return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
  }, [slotGroups, staffId]);

  function toggleService(id: string) {
    setServiceIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));
  }

  async function book() {
    setError(null);
    if (!details.name.trim() || details.phone.trim().length < 10) {
      setError('Please enter your name and a 10-digit mobile number.');
      return;
    }
    if (!slot) {
      setError('Please choose a time.');
      return;
    }

    setSaving(true);
    try {
      const result = await apiPost<Confirmation>(`public/${slug}/book`, {
        branchId,
        name: details.name.trim(),
        phone: details.phone.trim(),
        email: details.email.trim() || undefined,
        startAt: slot,
        services: serviceIds.map((serviceId) => ({ serviceId, staffId: staffId || undefined })),
        notes: details.notes.trim() || undefined,
        source: 'ONLINE',
        marketingConsent: details.consent,
      });

      setConfirmation(result);
      setStep('done');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------ confirmed ---
  if (step === 'done' && confirmation) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-card">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <PartyPopper className="h-5 w-5 text-emerald-600" />
        </span>
        <h2 className="text-lg font-semibold text-ink">You&apos;re booked, {confirmation.customer.firstName}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {dayjs(confirmation.startAt).format('dddd, DD MMMM')} at {time(confirmation.startAt)}
        </p>

        <div className="mt-5 space-y-2 rounded-xl bg-stone-50 p-4 text-left">
          {confirmation.services.map((service, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <span className="text-ink">{service.name}</span>
              <span className="text-ink-muted">{service.staff ?? 'Any stylist'}</span>
            </div>
          ))}
          <div className="border-t border-stone-200 pt-2 text-xs text-ink-muted">{confirmation.branch.name}</div>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-ink-muted">
          A confirmation is on its way to your WhatsApp. Pay at the salon after your appointment — nothing has been
          charged.
        </p>

        <Button
          variant="secondary"
          className="mt-5"
          onClick={() => {
            setConfirmation(null);
            setServiceIds([]);
            setSlot(null);
            setStep('services');
          }}
        >
          Book another appointment
        </Button>
      </div>
    );
  }

  const steps: { key: Step; label: string }[] = [
    { key: 'services', label: 'Services' },
    { key: 'stylist', label: 'Stylist' },
    { key: 'time', label: 'Time' },
    { key: 'details', label: 'Details' },
  ];
  const currentIndex = steps.findIndex((item) => item.key === step);

  return (
    <div>
      {/* Progress */}
      <ol className="mb-5 flex items-center gap-1.5">
        {steps.map((item, index) => (
          <li key={item.key} className="flex flex-1 items-center gap-1.5">
            <button
              type="button"
              onClick={() => index < currentIndex && setStep(item.key)}
              disabled={index > currentIndex}
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold transition-colors',
                index < currentIndex
                  ? 'bg-brand-600 text-white'
                  : index === currentIndex
                    ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-300'
                    : 'bg-stone-200 text-ink-subtle',
              )}
            >
              {index < currentIndex ? <Check className="h-3 w-3" /> : index + 1}
            </button>
            {index < steps.length - 1 ? (
              <span className={cn('h-px flex-1', index < currentIndex ? 'bg-brand-300' : 'bg-stone-200')} />
            ) : null}
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
        {error ? <p className="mb-4 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p> : null}

        {/* 1 — services */}
        {step === 'services' ? (
          <>
            <h2 className="mb-1 text-base font-semibold text-ink">What would you like?</h2>
            <p className="mb-4 text-xs text-ink-muted">Pick one or more services at {salonName}.</p>

            {branches.length > 1 ? (
              <div className="mb-4">
                <p className="mb-1.5 text-xs font-medium text-ink">Which branch?</p>
                <div className="flex flex-wrap gap-1.5">
                  {branches.map((branch) => (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => setBranchId(branch.id)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                        branchId === branch.id
                          ? 'border-brand-300 bg-brand-50 text-brand-800'
                          : 'border-stone-200 text-ink-muted hover:border-stone-300',
                      )}
                    >
                      <span className="block font-medium">{branch.name}</span>
                      {branch.city ? <span className="block text-2xs">{branch.city}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="max-h-[380px] space-y-4 overflow-y-auto">
              {menu.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-subtle">
                  This salon has not published its menu yet — please call to book.
                </p>
              ) : (
                menu.map((group) => (
                  <div key={group.id}>
                    <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{group.name}</p>
                    <ul className="space-y-1.5">
                      {group.services.map((service) => {
                        const active = serviceIds.includes(service.id);
                        return (
                          <li key={service.id}>
                            <button
                              type="button"
                              onClick={() => toggleService(service.id)}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                                active ? 'border-brand-300 bg-brand-50' : 'border-stone-200 hover:border-stone-300',
                              )}
                            >
                              <span
                                className={cn(
                                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                                  active ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300',
                                )}
                              >
                                {active ? <Check className="h-3 w-3" /> : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-ink">{service.name}</span>
                                <span className="block text-xs text-ink-muted">{duration(service.durationMin)}</span>
                              </span>
                              <span className="tnum shrink-0 text-sm font-medium text-ink">{money(service.price)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}

        {/* 2 — stylist */}
        {step === 'stylist' ? (
          <>
            <h2 className="mb-1 text-base font-semibold text-ink">Anyone in mind?</h2>
            <p className="mb-4 text-xs text-ink-muted">Choose a stylist, or let the salon pick whoever is free.</p>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setStaffId('')}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                  staffId === '' ? 'border-brand-300 bg-brand-50' : 'border-stone-200 hover:border-stone-300',
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100">
                  <User className="h-4 w-4 text-ink-subtle" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink">Anyone available</span>
                  <span className="block text-xs text-ink-muted">Usually the widest choice of times</span>
                </span>
              </button>

              {staff.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setStaffId(member.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                    staffId === member.id ? 'border-brand-300 bg-brand-50' : 'border-stone-200 hover:border-stone-300',
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {member.displayName.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{member.displayName}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {member.designation ?? member.specialities.join(', ') ?? ''}
                    </span>
                  </span>
                  {Number(member.avgRating) > 0 ? (
                    <span className="tnum shrink-0 text-xs text-amber-600">★ {Number(member.avgRating).toFixed(1)}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {/* 3 — time */}
        {step === 'time' ? (
          <>
            <h2 className="mb-1 text-base font-semibold text-ink">When suits you?</h2>
            <p className="mb-4 text-xs text-ink-muted">
              Showing real openings for {duration(totalMinutes)} of services.
            </p>

            <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
              {Array.from({ length: 14 }, (_, index) => dayjs().add(index, 'day')).map((day) => {
                const key = day.format('YYYY-MM-DD');
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setDate(key);
                      setSlot(null);
                    }}
                    className={cn(
                      'flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 transition-colors',
                      date === key ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-stone-200 text-ink-muted',
                    )}
                  >
                    <span className="text-2xs uppercase">{day.format('ddd')}</span>
                    <span className="tnum text-sm font-semibold">{day.format('D')}</span>
                    <span className="text-2xs">{day.format('MMM')}</span>
                  </button>
                );
              })}
            </div>

            {loadingSlots ? (
              <p className="py-8 text-center text-sm text-ink-subtle">Checking availability…</p>
            ) : slots.length === 0 ? (
              <div className="rounded-xl bg-stone-50 py-8 text-center">
                <Clock className="mx-auto mb-2 h-5 w-5 text-ink-subtle" />
                <p className="text-sm text-ink">Nothing free on this day</p>
                <p className="mt-1 text-xs text-ink-muted">Try another date, or choose &ldquo;anyone available&rdquo;.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {slots.map((item) => (
                  <button
                    key={item.start}
                    type="button"
                    onClick={() => setSlot(item.start)}
                    className={cn(
                      'tnum rounded-lg border py-2 text-xs font-medium transition-colors',
                      slot === item.start
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-stone-200 text-ink hover:border-brand-300',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : null}

        {/* 4 — details */}
        {step === 'details' ? (
          <>
            <h2 className="mb-1 text-base font-semibold text-ink">Almost done</h2>
            <p className="mb-4 text-xs text-ink-muted">We only need a name and a number to hold the slot.</p>

            <div className="space-y-3">
              <Field label="Your name" required>
                {({ id }) => (
                  <Input id={id} value={details.name} onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))} autoFocus />
                )}
              </Field>
              <Field label="Mobile number" required hint="For your confirmation">
                {({ id }) => (
                  <Input
                    id={id}
                    value={details.phone}
                    onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))}
                    inputMode="tel"
                    placeholder="98765 43210"
                  />
                )}
              </Field>
              <Field label="Email (optional)">
                {({ id }) => (
                  <Input id={id} type="email" value={details.email} onChange={(e) => setDetails((d) => ({ ...d, email: e.target.value }))} />
                )}
              </Field>
              <Field label="Anything we should know?">
                {({ id }) => (
                  <Input
                    id={id}
                    value={details.notes}
                    onChange={(e) => setDetails((d) => ({ ...d, notes: e.target.value }))}
                    placeholder="Allergies, preferences…"
                  />
                )}
              </Field>

              <Checkbox
                label="Send me offers on WhatsApp"
                description="You'll get your booking confirmation either way."
                checked={details.consent}
                onChange={(event) => setDetails((d) => ({ ...d, consent: event.target.checked }))}
              />
            </div>

            <div className="mt-4 rounded-xl bg-stone-50 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Scissors className="h-3.5 w-3.5" />
                Your booking
              </p>
              <ul className="space-y-1 text-xs text-ink-muted">
                {selected.map((service) => (
                  <li key={service.id} className="flex justify-between">
                    <span>{service.name}</span>
                    <span className="tnum">{money(service.price)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-sm">
                <span className="font-medium text-ink">
                  {slot ? `${dayjs(slot).format('ddd DD MMM')}, ${time(slot)}` : 'Time not chosen'}
                </span>
                <span className="tnum font-semibold text-ink">{money(totalPrice)}</span>
              </div>
              <p className="mt-1.5 text-2xs text-ink-subtle">Pay at the salon. Nothing is charged now.</p>
            </div>
          </>
        ) : null}

        {/* Navigation */}
        <div className="mt-5 flex items-center gap-2">
          {currentIndex > 0 ? (
            <Button variant="secondary" onClick={() => setStep(steps[currentIndex - 1]!.key)} disabled={saving}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          ) : null}

          {step === 'details' ? (
            <Button onClick={book} loading={saving} size="lg" className="flex-1">
              Confirm booking
            </Button>
          ) : (
            <Button
              size="lg"
              className="flex-1"
              disabled={
                (step === 'services' && (serviceIds.length === 0 || !branchId)) ||
                (step === 'time' && !slot)
              }
              onClick={() => setStep(steps[currentIndex + 1]!.key)}
            >
              {step === 'services' && selected.length > 0
                ? `Continue · ${duration(totalMinutes)} · ${money(totalPrice)}`
                : 'Continue'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
