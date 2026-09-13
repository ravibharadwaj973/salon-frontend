'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CreditCard, ExternalLink, Phone, Receipt, User } from 'lucide-react';
import { apiGet, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, StatusBadge } from '@/components/ui/display';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import { Input, Field } from '@/components/ui/form';
import { date as fmtDate, duration, fullName, money, phone as formatPhone, time } from '@/lib/format';
import type { Appointment, AppointmentStatus } from '@/lib/types';

/** Which moves make sense next, mirroring the API's own state machine. */
const NEXT_STATUS: Partial<Record<AppointmentStatus, { status: AppointmentStatus; label: string }[]>> = {
  BOOKED: [
    { status: 'CONFIRMED', label: 'Confirm' },
    { status: 'CHECKED_IN', label: 'Check in' },
    { status: 'NO_SHOW', label: 'No-show' },
  ],
  CONFIRMED: [
    { status: 'CHECKED_IN', label: 'Check in' },
    { status: 'NO_SHOW', label: 'No-show' },
  ],
  CHECKED_IN: [
    { status: 'IN_PROGRESS', label: 'Start service' },
    { status: 'COMPLETED', label: 'Mark complete' },
  ],
  IN_PROGRESS: [{ status: 'COMPLETED', label: 'Mark complete' }],
  NO_SHOW: [{ status: 'BOOKED', label: 'Undo no-show' }],
};

export function AppointmentDrawer({
  appointmentId,
  onClose,
  onChanged,
  canManage,
}: {
  appointmentId: string;
  onClose: () => void;
  onChanged: () => void;
  canManage: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: appointment, refetch } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => apiGet<Appointment>(`appointments/${appointmentId}`),
  });

  async function changeStatus(status: AppointmentStatus) {
    setBusy(status);
    try {
      await apiPost(`appointments/${appointmentId}/status`, { status });
      toast.success(`Marked ${status.replace(/_/g, ' ').toLowerCase()}`);
      await refetch();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy('cancel');
    try {
      await apiPost(`appointments/${appointmentId}/cancel`, {
        reason: cancelReason.trim() || undefined,
        notifyCustomer: true,
      });
      toast.success('Appointment cancelled');
      setCancelOpen(false);
      await refetch();
      onChanged();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const customerName = appointment?.customer
    ? fullName(appointment.customer)
    : (appointment?.walkInName ?? 'Walk-in');

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={customerName}
        description={appointment ? `${fmtDate(appointment.startAt)} · ${time(appointment.startAt)}` : 'Loading…'}
        footer={
          appointment && canManage ? (
            <>
              {appointment.status !== 'CANCELLED' && appointment.status !== 'COMPLETED' ? (
                <Button variant="ghost" onClick={() => setCancelOpen(true)} disabled={Boolean(busy)}>
                  Cancel appointment
                </Button>
              ) : null}

              {(NEXT_STATUS[appointment.status] ?? []).map((action, index) => (
                <Button
                  key={action.status}
                  variant={index === 0 ? 'primary' : 'secondary'}
                  onClick={() => changeStatus(action.status)}
                  loading={busy === action.status}
                >
                  {action.label}
                </Button>
              ))}

              {appointment.status !== 'CANCELLED' && !appointment.invoice ? (
                <Link
                  href={`/pos?appointmentId=${appointment.id}`}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <CreditCard className="h-4 w-4" />
                  Bill now
                </Link>
              ) : null}
            </>
          ) : null
        }
      >
        {!appointment ? (
          <p className="py-8 text-center text-sm text-ink-muted">Loading appointment…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar name={customerName} id={appointment.customerId ?? appointment.id} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-ink">{customerName}</p>
                  {appointment.customer ? <StatusBadge status={appointment.customer.tier} /> : <Badge>Walk-in</Badge>}
                </div>
                <p className="tnum mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                  <Phone className="h-3 w-3" />
                  {formatPhone(appointment.customer?.phone ?? appointment.walkInPhone)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={appointment.status} />
                {appointment.customerId ? (
                  <Link
                    href={`/customers/${appointment.customerId}`}
                    className="inline-flex items-center gap-1 text-2xs font-medium text-brand-700 hover:underline"
                  >
                    <User className="h-3 w-3" />
                    Profile
                  </Link>
                ) : null}
              </div>
            </div>

            {appointment.customer ? (
              <div className="tnum grid grid-cols-3 gap-2 rounded-lg bg-stone-50 p-3 text-center">
                <div>
                  <p className="text-sm font-semibold text-ink">{appointment.customer.totalVisits}</p>
                  <p className="text-2xs text-ink-muted">visits</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{appointment.customer.loyaltyPoints}</p>
                  <p className="text-2xs text-ink-muted">points</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{money(appointment.estimatedAmount)}</p>
                  <p className="text-2xs text-ink-muted">estimated</p>
                </div>
              </div>
            ) : null}

            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                <CalendarClock className="h-3.5 w-3.5 text-ink-subtle" />
                Services · {duration(appointment.totalDurationMin)}
              </h3>
              <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                {appointment.services.map((line) => (
                  <li key={line.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="tnum w-14 shrink-0 text-xs text-ink-muted">{time(line.startAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{line.service.name}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {line.staff?.displayName ?? 'Unassigned'} · {duration(line.durationMin)}
                      </p>
                    </div>
                    <span className="tnum text-sm text-ink">{money(line.price)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {appointment.notes ? (
              <section>
                <h3 className="mb-1.5 text-xs font-semibold text-ink">Notes</h3>
                <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{appointment.notes}</p>
              </section>
            ) : null}

            {appointment.invoice ? (
              <Link
                href={`/invoices/${appointment.invoice.id}`}
                className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 hover:bg-emerald-100"
              >
                <Receipt className="h-4 w-4 text-emerald-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-emerald-900">Invoice {appointment.invoice.invoiceNumber}</p>
                  <p className="tnum text-xs text-emerald-700">
                    {money(appointment.invoice.grandTotal)} ·{' '}
                    {Number(appointment.invoice.dueAmount) > 0
                      ? `${money(appointment.invoice.dueAmount)} outstanding`
                      : 'settled'}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-emerald-700" />
              </Link>
            ) : null}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={cancel}
        title="Cancel this appointment?"
        message="The customer will be told on WhatsApp if they have opted in. The slot is freed immediately."
        confirmLabel="Cancel appointment"
        danger
        loading={busy === 'cancel'}
      />

      {cancelOpen ? (
        <div className="fixed bottom-24 left-1/2 z-[70] w-full max-w-sm -translate-x-1/2 px-4">
          <Field label="Reason (optional)">
            {({ id }) => (
              <Input
                id={id}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Customer rescheduled"
                className="bg-white shadow-pop"
              />
            )}
          </Field>
        </div>
      ) : null}
    </>
  );
}
