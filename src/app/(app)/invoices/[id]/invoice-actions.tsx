'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, MessageSquare, Printer, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { apiDelete, apiPost, errorMessage } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Modal, useToast } from '@/components/ui/overlay';
import { money } from '@/lib/format';
import { ShareSheet } from '@/components/share/share-sheet';
import type { PaymentMode } from '@/lib/types';

const MODES: PaymentMode[] = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'BANK_TRANSFER'];

export function InvoiceActions({
  invoiceId,
  customerId,
  customerName,
  status,
  dueAmount,
  paidAmount,
  refundedAmount,
  canPay,
  canRefund,
  canVoid,
  canDelete = false,
}: {
  invoiceId: string;
  customerId?: string | null;
  customerName?: string | null;
  status: string;
  dueAmount: number;
  paidAmount: number;
  refundedAmount: number;
  canPay: boolean;
  canRefund: boolean;
  canVoid: boolean;
  /** invoice.delete — owner only until granted by name. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [payment, setPayment] = useState({ mode: 'CASH' as PaymentMode, amount: dueAmount, reference: '' });
  const [refund, setRefund] = useState({ mode: 'CASH' as PaymentMode, amount: 0, reason: '', toWallet: false });
  const [voidReason, setVoidReason] = useState('');

  const settled = status === 'PAID' || status === 'VOID' || status === 'REFUNDED';
  const refundable = paidAmount - refundedAmount;

  async function recordPayment() {
    setBusy(true);
    try {
      await apiPost(`invoices/${invoiceId}/payments`, {
        mode: payment.mode,
        amount: payment.amount,
        reference: payment.reference.trim() || undefined,
      });
      toast.success('Payment recorded');
      setPayOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function issueRefund() {
    setBusy(true);
    try {
      await apiPost(`invoices/${invoiceId}/refund`, {
        mode: refund.mode,
        amount: refund.amount,
        reason: refund.reason.trim() || undefined,
        toWallet: refund.toWallet,
      });
      toast.success('Refund recorded');
      setRefundOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function voidInvoice() {
    setBusy(true);
    try {
      await apiPost(`invoices/${invoiceId}/void`, { reason: voidReason.trim() });
      toast.success('Invoice voided');
      setVoidOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteInvoice() {
    setBusy(true);
    try {
      const result = await apiDelete<{ invoiceNumber: string }>(`invoices/${invoiceId}`);
      toast.success(`${result.invoiceNumber} deleted`);
      router.replace('/invoices');
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="md" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Print
      </Button>

      {customerId ? (
        <Button variant="secondary" size="md" onClick={() => setShareOpen(true)}>
          <MessageSquare className="h-4 w-4" />
          Send bill
        </Button>
      ) : null}

      {customerId ? (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title="Send this bill"
          target={{ customerId, invoiceId, name: customerName ?? 'this customer' }}
        />
      ) : null}

      {canRefund && refundable > 0 && status !== 'VOID' ? (
        <Button variant="secondary" size="md" onClick={() => { setRefund((r) => ({ ...r, amount: refundable })); setRefundOpen(true); }}>
          <RotateCcw className="h-4 w-4" />
          Refund
        </Button>
      ) : null}

      {canVoid && status !== 'VOID' ? (
        <Button variant="ghost" size="md" onClick={() => setVoidOpen(true)}>
          <Ban className="h-4 w-4" />
          Void
        </Button>
      ) : null}

      {/* Delete only ever removes a bill that already counts for nothing. */}
      {canDelete && (status === 'VOID' || status === 'DRAFT') ? (
        <Button variant="ghost" size="md" onClick={() => setDeleteOpen(true)} className="text-rose-700 hover:bg-rose-50">
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteInvoice}
        title="Delete this bill for good?"
        message="It disappears from every list and report, and its number leaves a gap in the sequence — which is the first thing an auditor notices. The deletion is recorded in the activity log with the bill's contents. Voided bills are already excluded from totals; deleting is only for a bill that should never have existed."
        confirmLabel="Delete bill"
        danger
        loading={busy}
      />

      {canPay && dueAmount > 0 && !settled ? (
        <Button size="md" onClick={() => { setPayment((p) => ({ ...p, amount: dueAmount })); setPayOpen(true); }}>
          <Wallet className="h-4 w-4" />
          Record payment · {money(dueAmount)}
        </Button>
      ) : null}

      {/* Record payment — manual entry of money already taken */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record a payment"
        description="Money taken at the counter. Nothing is charged from here."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={recordPayment} loading={busy}>
              Record {money(payment.amount)}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="How was it received?">
            {({ id }) => (
              <Select id={id} value={payment.mode} onChange={(event) => setPayment((p) => ({ ...p, mode: event.target.value as PaymentMode }))}>
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Amount" hint={`${money(dueAmount)} outstanding`}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                value={payment.amount || ''}
                max={dueAmount}
                onChange={(event) => setPayment((p) => ({ ...p, amount: Number(event.target.value) }))}
                className="tnum text-right"
              />
            )}
          </Field>

          {payment.mode !== 'CASH' ? (
            <Field label="Reference" hint="UPI ref / card slip / cheque no.">
              {({ id }) => (
                <Input id={id} value={payment.reference} onChange={(event) => setPayment((p) => ({ ...p, reference: event.target.value }))} />
              )}
            </Field>
          ) : null}
        </div>
      </Modal>

      {/* Refund */}
      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Record a refund"
        description={`Up to ${money(refundable)} can be refunded on this invoice.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefundOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={issueRefund} loading={busy}>
              Refund {money(refund.amount)}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Amount">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                value={refund.amount || ''}
                max={refundable}
                onChange={(event) => setRefund((r) => ({ ...r, amount: Number(event.target.value) }))}
                className="tnum text-right"
              />
            )}
          </Field>

          <Field label="Refunded how?">
            {({ id }) => (
              <Select id={id} value={refund.mode} onChange={(event) => setRefund((r) => ({ ...r, mode: event.target.value as PaymentMode }))} disabled={refund.toWallet}>
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Checkbox
            label="Credit to the customer's wallet instead"
            description="They can use the balance on their next visit."
            checked={refund.toWallet}
            onChange={(event) => setRefund((r) => ({ ...r, toWallet: event.target.checked }))}
          />

          <Field label="Reason">
            {({ id }) => (
              <Input id={id} value={refund.reason} onChange={(event) => setRefund((r) => ({ ...r, reason: event.target.value }))} placeholder="Service not as expected" />
            )}
          </Field>
        </div>
      </Modal>

      {/* Void */}
      <Modal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Void this invoice?"
        description="Stock, commission, loyalty points and the customer's totals are all reversed. The invoice stays on record."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoidOpen(false)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="danger" onClick={voidInvoice} loading={busy} disabled={voidReason.trim().length < 3}>
              Void invoice
            </Button>
          </>
        }
      >
        <Field label="Reason" required hint="Recorded in the audit trail">
          {({ id }) => (
            <Textarea id={id} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Billed to the wrong customer" rows={2} />
          )}
        </Field>
      </Modal>
    </div>
  );
}
