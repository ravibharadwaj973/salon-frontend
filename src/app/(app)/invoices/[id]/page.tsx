import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ApiError, apiFetch, apiFetchAllowed } from '@/lib/api';
import { Card, CardBody, CardHeader, StatusBadge } from '@/components/ui/display';
import { PermissionGate } from '@/components/permission-gate';
import { InvoiceActions } from './invoice-actions';
import { RemovePaymentButton } from './remove-payment-button';
import { date, fullName, money, moneyExact, phone as formatPhone, time } from '@/lib/format';
import type { Invoice, SessionUser } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const invoice = await apiFetch<Invoice>(`/invoices/${(await params).id}`);
    return { title: invoice.invoiceNumber };
  } catch {
    return { title: 'Invoice' };
  }
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Three different answers, three different screens: a bill that is not there
  // is notFound(), a bill this person may not read is a plain refusal, and
  // anything else is a real fault and belongs at the error boundary.
  let invoice: Invoice | null;
  try {
    invoice = await apiFetchAllowed<Invoice>(`/invoices/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  if (!invoice) {
    return (
      <PermissionGate
        permission="invoice.view"
        what="Bills are restricted."
        backHref="/"
        backLabel="Back to the dashboard"
      />
    );
  }

  const user = await apiFetch<SessionUser>('/auth/me', { noBranch: true });
  const due = Number(invoice.dueAmount);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/invoices" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          All invoices
        </Link>

        <InvoiceActions
          invoiceId={invoice.id}
          customerId={invoice.customer?.id ?? null}
          customerName={
            invoice.customer ? `${invoice.customer.firstName} ${invoice.customer.lastName ?? ''}`.trim() : null
          }
          status={invoice.status}
          dueAmount={due}
          paidAmount={Number(invoice.paidAmount)}
          refundedAmount={Number(invoice.refundedAmount)}
          canRefund={user.permissions.includes('refund.manage')}
          canVoid={user.permissions.includes('invoice.void')}
          canPay={user.permissions.includes('payment.manage')}
          canDelete={user.permissions.includes('invoice.delete')}
        />
      </div>

      {/* The invoice itself — printable as-is. */}
      <Card className="mx-auto max-w-3xl print:border-0 print:shadow-none">
        <div className="border-b border-stone-200 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-ink">{invoice.branch.name}</h1>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                {[invoice.branch.addressLine, invoice.branch.city].filter(Boolean).join(', ')}
                {invoice.branch.phone ? <><br />{formatPhone(invoice.branch.phone)}</> : null}
                {invoice.branch.gstin ? <><br />GSTIN: {invoice.branch.gstin}</> : null}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold text-ink">{invoice.invoiceNumber}</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {date(invoice.invoiceDate)} · {time(invoice.invoiceDate)}
              </p>
              <StatusBadge status={invoice.status} className="mt-1.5" />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-4 border-t border-stone-100 pt-4">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Billed to</p>
              {invoice.customer ? (
                <>
                  <Link href={`/customers/${invoice.customer.id}`} className="text-sm font-medium text-ink hover:text-brand-700">
                    {fullName(invoice.customer)}
                  </Link>
                  <p className="tnum text-xs text-ink-muted">{formatPhone(invoice.customer.phone)}</p>
                </>
              ) : (
                <p className="text-sm text-ink-muted">Cash sale</p>
              )}
            </div>
            <p className="text-2xs text-ink-subtle">{invoice.isGst ? 'Tax invoice · prices inclusive of GST' : 'Bill · no GST charged'}</p>
          </div>
        </div>

        {/* Lines */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/60">
              <tr>
                <th className="px-6 py-2.5 text-left text-2xs font-semibold uppercase tracking-wide text-ink-muted">Item</th>
                <th className="px-3 py-2.5 text-right text-2xs font-semibold uppercase tracking-wide text-ink-muted">Qty</th>
                <th className="px-3 py-2.5 text-right text-2xs font-semibold uppercase tracking-wide text-ink-muted">Rate</th>
                <th className="px-3 py-2.5 text-right text-2xs font-semibold uppercase tracking-wide text-ink-muted">Disc.</th>
                <th className="px-6 py-2.5 text-right text-2xs font-semibold uppercase tracking-wide text-ink-muted">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-3">
                    <p className="font-medium text-ink">{item.name}</p>
                    <p className="text-2xs text-ink-subtle">
                      {item.staff ? `${item.staff.displayName} · ` : ''}
                      {item.itemType.toLowerCase()}
                      {item.redeemedFrom !== 'NONE' ? ` · redeemed from ${item.redeemedFrom.toLowerCase()}` : ''}
                      {item.hsnSac ? ` · HSN ${item.hsnSac}` : ''}
                    </p>
                  </td>
                  <td className="tnum px-3 py-3 text-right text-ink-muted">{Number(item.quantity)}</td>
                  <td className="tnum px-3 py-3 text-right text-ink-muted">{moneyExact(item.unitPrice)}</td>
                  <td className="tnum px-3 py-3 text-right text-rose-600">
                    {Number(item.discount) > 0 ? `− ${moneyExact(item.discount)}` : '—'}
                  </td>
                  <td className="tnum px-6 py-3 text-right font-medium text-ink">{moneyExact(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end border-t border-stone-200 p-6">
          <dl className="w-full max-w-xs space-y-1.5 text-sm">
            <Line label="Gross" value={moneyExact(invoice.grossAmount)} />
            {Number(invoice.itemDiscount) > 0 ? <Line label="Item discounts" value={`− ${moneyExact(invoice.itemDiscount)}`} negative /> : null}
            {Number(invoice.billDiscount) > 0 ? (
              <Line label={`Bill discount${invoice.discountReason ? ` (${invoice.discountReason})` : ''}`} value={`− ${moneyExact(invoice.billDiscount)}`} negative />
            ) : null}
            {invoice.isGst ? (
              <>
                <Line label="Taxable value" value={moneyExact(invoice.taxableAmount)} muted />
                {Number(invoice.cgstAmount) > 0 ? <Line label="CGST" value={moneyExact(invoice.cgstAmount)} muted /> : null}
                {Number(invoice.sgstAmount) > 0 ? <Line label="SGST" value={moneyExact(invoice.sgstAmount)} muted /> : null}
                {Number(invoice.igstAmount) > 0 ? <Line label="IGST" value={moneyExact(invoice.igstAmount)} muted /> : null}
              </>
            ) : null}
            {Number(invoice.roundOff) !== 0 ? <Line label="Round off" value={moneyExact(invoice.roundOff)} muted /> : null}

            <div className="flex items-baseline justify-between border-t border-stone-200 pt-2">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="tnum text-lg font-semibold text-ink">{moneyExact(invoice.grandTotal)}</dd>
            </div>
            <Line label="Paid" value={moneyExact(invoice.paidAmount)} />
            {due > 0 ? <Line label="Balance due" value={moneyExact(due)} negative bold /> : null}
            {Number(invoice.refundedAmount) > 0 ? <Line label="Refunded" value={moneyExact(invoice.refundedAmount)} negative /> : null}
          </dl>
        </div>

        {/* Payments — the manual record */}
        {invoice.payments.length > 0 ? (
          <div className="border-t border-stone-200 px-6 py-4">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Money received</p>
            <ul className="space-y-1.5">
              {invoice.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between text-xs">
                  <span className="text-ink-muted">
                    {payment.mode.replace(/_/g, ' ').toLowerCase()}
                    {payment.reference ? ` · ${payment.reference}` : ''}
                    <span className="text-ink-subtle"> · {date(payment.receivedAt, 'DD MMM')} {time(payment.receivedAt)}</span>
                  </span>
                  <span className="tnum flex items-center font-medium text-ink">
                    {moneyExact(payment.amount)}
                    {user.permissions.includes('payment.manage') && invoice.status !== 'VOID' && invoice.status !== 'REFUNDED' && !payment.isAdvance ? (
                      <RemovePaymentButton invoiceId={invoice.id} paymentId={payment.id} amount={Number(payment.amount)} />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {invoice.refunds.length > 0 ? (
          <div className="border-t border-stone-200 px-6 py-4">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Refunds</p>
            <ul className="space-y-1.5">
              {invoice.refunds.map((refund) => (
                <li key={refund.id} className="flex items-center justify-between text-xs">
                  <span className="text-ink-muted">
                    {refund.mode.replace(/_/g, ' ').toLowerCase()}
                    {refund.reason ? ` · ${refund.reason}` : ''}
                  </span>
                  <span className="tnum font-medium text-rose-600">− {moneyExact(refund.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {invoice.notes ? (
          <p className="border-t border-stone-200 px-6 py-4 text-xs text-ink-muted">{invoice.notes}</p>
        ) : null}

        <p className="border-t border-stone-200 px-6 py-4 text-center text-2xs text-ink-subtle">
          Thank you for visiting {invoice.branch.name}. This is a computer-generated invoice.
        </p>
      </Card>

      {/* HSN summary for the accountant */}
      {invoice.taxBreakup && invoice.taxBreakup.length > 0 ? (
        <Card className="mx-auto mt-5 max-w-3xl print:hidden">
          <CardHeader title="Tax summary" subtitle="By HSN/SAC and rate" />
          <CardBody className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="pb-2 font-medium">HSN/SAC</th>
                  <th className="pb-2 text-right font-medium">Rate</th>
                  <th className="pb-2 text-right font-medium">Taxable</th>
                  <th className="pb-2 text-right font-medium">CGST</th>
                  <th className="pb-2 text-right font-medium">SGST</th>
                  <th className="pb-2 text-right font-medium">IGST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {invoice.taxBreakup.map((row) => (
                  <tr key={`${row.hsnSac}-${row.taxRatePct}`}>
                    <td className="py-1.5 font-mono">{row.hsnSac}</td>
                    <td className="tnum py-1.5 text-right">{row.taxRatePct}%</td>
                    <td className="tnum py-1.5 text-right">{moneyExact(row.taxableValue)}</td>
                    <td className="tnum py-1.5 text-right">{moneyExact(row.cgst)}</td>
                    <td className="tnum py-1.5 text-right">{moneyExact(row.sgst)}</td>
                    <td className="tnum py-1.5 text-right">{moneyExact(row.igst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

function Line({
  label,
  value,
  negative,
  muted,
  bold,
}: {
  label: string;
  value: string;
  negative?: boolean;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={`text-xs ${muted ? 'text-ink-subtle' : 'text-ink-muted'}`}>{label}</dt>
      <dd
        className={`tnum text-sm ${negative ? 'text-rose-600' : muted ? 'text-ink-subtle' : 'text-ink'} ${
          bold ? 'font-semibold' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
