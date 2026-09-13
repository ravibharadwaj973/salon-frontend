'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { apiDelete, errorMessage } from '@/lib/client';
import { ConfirmDialog, useToast } from '@/components/ui/overlay';
import { money } from '@/lib/format';

/**
 * "Marked paid by mistake." Taking the payment back puts the amount due again
 * and drops the bill's status to match — PAID → PARTIALLY_PAID → ISSUED.
 * Audited with the payment that was removed.
 */
export function RemovePaymentButton({ invoiceId, paymentId, amount }: { invoiceId: string; paymentId: string; amount: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await apiDelete(`invoices/${invoiceId}/payments/${paymentId}`);
      toast.success(`${money(amount)} taken back — the bill shows it as due again`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="print:hidden ml-2 rounded p-0.5 text-ink-subtle hover:bg-rose-50 hover:text-rose-600"
        aria-label="Remove this payment"
        title="Recorded by mistake? Remove it"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={remove}
        title="Remove this payment?"
        message={`${money(amount)} will show as due again and the bill's status will change to match. Use this only when the payment was recorded by mistake — money actually returned to the customer is a refund.`}
        confirmLabel="Remove payment"
        danger
        loading={busy}
      />
    </>
  );
}
