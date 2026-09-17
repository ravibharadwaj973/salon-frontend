'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock, Search, UserPlus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ClientApiError, apiList, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal, useToast } from '@/components/ui/overlay';
import { Avatar } from '@/components/ui/display';
import { dayjs, duration, fullName, money, phone as formatPhone } from '@/lib/format';
import { ExistingCustomerHint } from '@/components/customers/existing-customer';
import type { Customer, CustomerMatch, Service, SlotGroup, Staff } from '@/lib/types';

/** The lookup row carries less than a full Customer; fill the rest with what the card shows. */
function matchToCustomer(match: CustomerMatch): Customer {
  return {
    id: match.id,
    code: match.code,
    firstName: match.firstName,
    lastName: match.lastName,
    phone: match.phone,
    email: match.email,
    gender: match.gender,
    dob: match.dob,
    tier: match.tier,
    tags: [],
    totalVisits: match.totalVisits,
    totalSpent: match.totalSpent,
    avgBill: 0,
    loyaltyPoints: 0,
    walletBalance: 0,
    outstanding: 0,
    lastVisitAt: match.lastVisitAt,
    createdAt: match.createdAt,
    branchId: null,
  };
}

export function BookingModal({
  open,
  onClose,
  onBooked,
  date,
  defaultStaffId,
  defaultStartAt,
  serviceGroups,
  staff,
  branchId,
}: {
  open: boolean;
  onClose: () => void;
  onBooked: () => void;
  date: string;
  defaultStaffId?: string;
  defaultStartAt?: string;
  serviceGroups: { id: string; name: string; services: Service[] }[];
  staff: Staff[];
  branchId: string;
}) {
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [walkIn, setWalkIn] = useState({ name: '', phone: '' });
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState(defaultStaffId ?? '');
  const [startTime, setStartTime] = useState(defaultStartAt ? dayjs(defaultStartAt).format('HH:mm') : '10:00');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Why the server refused, in its own words.
   *
   * A 409 carries a list of conflicts — the branch is shut, this stylist is
   * busy, the shop is at its ceiling — and the modal used to show only the
   * headline "This slot is not available", which tells a receptionist nothing
   * about what to change. These are the reasons.
   */
  const [conflicts, setConflicts] = useState<{ type: string; message: string }[]>([]);

  const allServices = useMemo(() => serviceGroups.flatMap((group) => group.services), [serviceGroups]);
  const selected = allServices.filter((service) => serviceIds.includes(service.id));
  const totalMinutes = selected.reduce((sum, service) => sum + service.durationMin, 0);
  const totalPrice = selected.reduce((sum, service) => sum + Number(service.price), 0);

  // Customer lookup — phone-first, which is how a receptionist searches.
  const { data: results, isFetching } = useQuery({
    queryKey: ['customer-search', search],
    queryFn: () => apiList<Customer>('customers', { query: { q: search, pageSize: 6 } }),
    enabled: search.trim().length >= 2 && !isWalkIn,
  });

  // Real availability from the API, honouring buffers and existing bookings.
  const { data: slots } = useQuery({
    queryKey: ['slots', date, serviceIds, staffId, branchId],
    queryFn: () =>
      apiList<SlotGroup>('appointments/slots', {
        query: { branchId, date, serviceIds: serviceIds.join(','), staffId: staffId || undefined },
      }).then((response) => response.data),
    enabled: serviceIds.length > 0 && Boolean(branchId),
  });

  /**
   * The free times to offer, for the chosen stylist or for anyone.
   *
   * The diary now returns a stylist's whole day, taken times included, so this
   * keeps only what is actually free — the heading says "Free slots" and it
   * should stay true. With nobody chosen it merges the team rather than
   * showing whichever stylist happened to come back first.
   */
  const slotList = useMemo(() => {
    if (!slots) return [];

    if (staffId) {
      return slots.find((group) => group.staffId === staffId)?.slots.filter((slot) => slot.available) ?? [];
    }

    const byTime = new Map<string, { start: string; end: string; label: string; available: boolean }>();
    for (const group of slots) {
      for (const slot of group.slots) {
        if (slot.available && !byTime.has(slot.label)) byTime.set(slot.label, slot);
      }
    }
    return [...byTime.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [slots, staffId]);

  useEffect(() => {
    if (defaultStartAt) setStartTime(dayjs(defaultStartAt).format('HH:mm'));
  }, [defaultStartAt]);

  /**
   * Whether the time in the box is already full.
   *
   * Read from the same slot data the buttons below are drawn from, so the
   * warning and the greyed-out time always agree.
   *
   *   'free'    someone can take it
   *   'full'    every stylist who could do this work is busy then
   *   'unknown' no opinion — no services picked yet, or a time typed by hand
   *             that is not on the grid. The server decides those.
   */
  const timeState: 'free' | 'full' | 'unknown' = useMemo(() => {
    if (!slots || serviceIds.length === 0 || !startTime) return 'unknown';

    const groups = staffId ? slots.filter((group) => group.staffId === staffId) : slots;
    const matching = groups.flatMap((group) => group.slots).filter((slot) => slot.label === startTime);

    if (matching.length === 0) return 'unknown';
    return matching.some((slot) => slot.available) ? 'free' : 'full';
  }, [slots, serviceIds, staffId, startTime]);

  const full = timeState === 'full';

  /**
   * The server has already refused this booking once.
   *
   * `full` only knows about the slot grid, so a refusal for a reason the grid
   * cannot see — the branch shut, a stylist on leave, the shop at its ceiling
   * — left the button saying "Book appointment" and re-sending exactly the
   * same request. The desk could press it forever. Once the server has said
   * no, the only way through is to say so deliberately.
   */
  const refused = conflicts.length > 0;
  const overriding = full || refused;

  function toggleService(id: string) {
    setServiceIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));
  }

  async function submit(force = false) {
    setError(null);
    setConflicts([]);

    if (!customer && !walkIn.name.trim()) {
      setError('Choose a customer, or enter a walk-in name.');
      return;
    }
    if (serviceIds.length === 0) {
      setError('Pick at least one service.');
      return;
    }

    setSaving(true);
    try {
      const startAt = dayjs(`${date}T${startTime}`).toISOString();

      if (isWalkIn && !customer) {
        await apiPost('appointments/walk-in', {
          branchId,
          name: walkIn.name.trim(),
          phone: walkIn.phone.trim() || undefined,
          services: serviceIds.map((serviceId) => ({ serviceId, staffId: staffId || undefined })),
          startAt,
          force,
        });
      } else {
        await apiPost('appointments', {
          branchId,
          customerId: customer?.id,
          walkInName: customer ? undefined : walkIn.name.trim(),
          walkInPhone: customer ? undefined : walkIn.phone.trim() || undefined,
          startAt,
          source: 'RECEPTION',
          notes: notes.trim() || undefined,
          services: serviceIds.map((serviceId) => ({ serviceId, staffId: staffId || undefined })),
          force,
        });
      }

      toast.success('Appointment booked');
      onBooked();
    } catch (err) {
      setError(errorMessage(err));

      // `details` is whatever the API put in the error body; for a booking
      // clash that is the conflict list. Anything else shape-wise is ignored
      // rather than risking a crash inside an error handler.
      const details = err instanceof ClientApiError ? err.details : null;
      const list = (details as { conflicts?: unknown } | null)?.conflicts;
      setConflicts(
        Array.isArray(list)
          ? list
              .filter((c): c is { type: string; message: string } =>
                Boolean(c) && typeof (c as { message?: unknown }).message === 'string',
              )
              .map((c) => ({ type: String(c.type ?? ''), message: c.message }))
          : [],
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New appointment"
      description={dayjs(date).format('dddd, DD MMM YYYY')}
      size="lg"
      footer={
        <>
          <div className="mr-auto text-xs text-ink-muted">
            {full ? (
              <span className="flex items-center gap-1.5 font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Fully booked at {startTime} — this will overbook
              </span>
            ) : selected.length > 0 ? (
              <span className="tnum">
                {selected.length} service{selected.length === 1 ? '' : 's'} · {duration(totalMinutes)} · {money(totalPrice)}
              </span>
            ) : (
              'Nothing selected yet'
            )}
          </div>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {/* Full does not mean forbidden. The desk can always overbook — but
              it has to be a decision, not a click that looks like any other. */}
          <Button onClick={() => submit(overriding)} loading={saving} variant={overriding ? 'secondary' : 'primary'}>
            {overriding ? 'Book anyway' : 'Book appointment'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? (
          <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">
            <p className="font-medium">{error}</p>

            {conflicts.length > 0 ? (
              <>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {conflicts.map((conflict, index) => (
                    <li key={`${conflict.type}-${index}`}>{conflict.message}</li>
                  ))}
                </ul>

                {/* The branch being shut is the one reason overbooking cannot
                    fix — there is nobody there. Saying so saves a pointless
                    second attempt. */}
                {conflicts.some((c) => c.type === 'BRANCH_CLOSED') ? (
                  <p className="mt-1.5">
                    Opening hours are set per branch under Settings → Branches.
                  </p>
                ) : (
                  <p className="mt-1.5">Use “Book anyway” if you want to take it regardless.</p>
                )}
              </>
            ) : null}
          </div>
        ) : null}

        {/* Customer */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink">Customer</h3>
            <button
              type="button"
              onClick={() => {
                setIsWalkIn((value) => !value);
                setCustomer(null);
              }}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              {isWalkIn ? 'Search existing customer' : 'Walk-in instead'}
            </button>
          </div>

          {customer ? (
            <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 p-2.5">
              <Avatar name={fullName(customer)} id={customer.id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{fullName(customer)}</p>
                <p className="tnum truncate text-xs text-ink-muted">
                  {formatPhone(customer.phone)} · {customer.totalVisits} visits · {money(customer.totalSpent)} lifetime
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                Change
              </Button>
            </div>
          ) : isWalkIn ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required>
                {({ id }) => (
                  <Input
                    id={id}
                    value={walkIn.name}
                    onChange={(event) => setWalkIn((w) => ({ ...w, name: event.target.value }))}
                    placeholder="Customer name"
                  />
                )}
              </Field>
              <Field label="Phone" hint="Creates a customer record">
                {({ id }) => (
                  <Input
                    id={id}
                    value={walkIn.phone}
                    onChange={(event) => setWalkIn((w) => ({ ...w, phone: event.target.value }))}
                    placeholder="98765 43210"
                    inputMode="tel"
                  />
                )}
              </Field>

              {/* A walk-in phone that already belongs to someone is that someone —
                  book against their record so the visit lands in their history. */}
              <div className="sm:col-span-2">
                <ExistingCustomerHint
                  query={walkIn.phone}
                  action="Book them"
                  onPick={(match: CustomerMatch) => {
                    setCustomer(matchToCustomer(match));
                    setIsWalkIn(false);
                  }}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or phone…"
                  className="pl-8"
                  autoFocus
                />
              </div>

              {search.trim().length >= 2 ? (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-stone-200">
                  {isFetching ? (
                    <p className="px-3 py-2.5 text-xs text-ink-subtle">Searching…</p>
                  ) : results?.data.length ? (
                    results.data.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setCustomer(row)}
                        className="flex w-full items-center gap-2.5 border-b border-stone-100 px-3 py-2 text-left last:border-b-0 hover:bg-stone-50"
                      >
                        <Avatar name={fullName(row)} id={row.id} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{fullName(row)}</span>
                          <span className="tnum block truncate text-xs text-ink-muted">{formatPhone(row.phone)}</span>
                        </span>
                        <span className="tnum text-2xs text-ink-subtle">{row.totalVisits} visits</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-center">
                      <p className="text-xs text-ink-muted">No customer found</p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsWalkIn(true);
                          setWalkIn({ name: search, phone: '' });
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                      >
                        <UserPlus className="h-3 w-3" />
                        Book as a new walk-in
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* Services */}
        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink">Services</h3>
          <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-stone-200 p-3">
            {serviceGroups.map((group) => (
              <div key={group.id}>
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{group.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.services.map((service) => {
                    const active = serviceIds.includes(service.id);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => toggleService(service.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                          active
                            ? 'border-brand-300 bg-brand-50 font-medium text-brand-700'
                            : 'border-stone-200 bg-white text-ink-muted hover:border-stone-300 hover:text-ink',
                        )}
                      >
                        {active ? <Check className="h-3 w-3" /> : null}
                        {service.name}
                        <span className="tnum text-ink-subtle">{money(service.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* When and who */}
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Stylist">
            {({ id }) => (
              <Select id={id} value={staffId} onChange={(event) => setStaffId(event.target.value)}>
                <option value="">Anyone available</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                    {member.designation ? ` — ${member.designation}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Start time">
            {({ id }) => (
              <Input id={id} type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            )}
          </Field>
        </section>

        {slotList.length > 0 ? (
          <section>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink">
              <Clock className="h-3.5 w-3.5 text-ink-subtle" />
              Free slots {staffId ? 'for this stylist' : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {slotList.slice(0, 24).map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => setStartTime(dayjs(slot.start).format('HH:mm'))}
                  className={cn(
                    'tnum rounded-md border px-2 py-1 text-xs transition-colors',
                    startTime === dayjs(slot.start).format('HH:mm')
                      ? 'border-brand-400 bg-brand-50 font-medium text-brand-700'
                      : 'border-stone-200 text-ink-muted hover:border-brand-300 hover:text-ink',
                  )}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <Field label="Notes" hint="Visible to the stylist">
          {({ id }) => (
            <Textarea
              id={id}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Allergies, preferences, anything worth knowing…"
              rows={2}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
