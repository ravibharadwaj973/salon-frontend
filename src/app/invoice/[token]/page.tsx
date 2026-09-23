import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { date, moneyExact } from '@/lib/format';
import type { Money } from '@/lib/types';

/**
 * A CUSTOMER'S OWN COPY OF THEIR BILL.
 *
 * Opened from a WhatsApp message by somebody who is not signed in, usually on a
 * phone, often months later when they need the bill for an expense claim. So it
 * is a document rather than a screen: no navigation, no salon branding of ours,
 * nothing to click. The salon's name is at the top because it is their bill.
 *
 * It is deliberately not a payment page. Money is collected at the counter and
 * recorded by hand, so this says what was charged and what is still owed, and
 * offers no way to settle it — the salon's phone number is the way to do that.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your bill',
  // The link is unguessable, which is worth nothing if a search engine
  // publishes it. Anyone with the link may read it; nobody should find it.
  robots: { index: false, follow: false, nocache: true },
};

interface PublicInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  isGst: boolean;
  customerName: string | null;
  salon: {
    name: string;
    gstin: string | null;
    phone: string | null;
    email: string | null;
    address: string;
    branch: string;
  };
  items: {
    name: string;
    hsnSac: string | null;
    quantity: Money;
    unitPrice: Money;
    discount: Money;
    taxableValue: Money;
    taxRatePct: Money;
    lineTotal: Money;
  }[];
  totals: {
    grossAmount: Money;
    itemDiscount: Money;
    billDiscount: Money;
    taxableAmount: Money;
    cgstAmount: Money;
    sgstAmount: Money;
    igstAmount: Money;
    totalTax: Money;
    roundOff: Money;
    grandTotal: Money;
    paidAmount: Money;
    dueAmount: Money;
  };
}

const num = (value: Money) => Number(value ?? 0);

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1 ${strong ? 'text-ink' : 'text-ink-muted'}`}>
      <dt className={strong ? 'text-sm font-semibold' : 'text-xs'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-base font-semibold' : 'text-xs'}`}>{value}</dd>
    </div>
  );
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let invoice: PublicInvoice;
  try {
    invoice = await apiFetch<PublicInvoice>(`/public/invoice/${token}`, { noBranch: true });
  } catch (error) {
    // A bad token, a draft and a voided bill are all the same 404. Telling the
    // difference would make this page a way to test whether a token is real.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const { salon, totals } = invoice;
  const due = num(totals.dueAmount);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-200 px-5 py-5 sm:px-7">
          <h1 className="text-lg font-semibold text-ink">{salon.name}</h1>
          {salon.address ? <p className="mt-0.5 text-xs text-ink-muted">{salon.address}</p> : null}
          <p className="mt-0.5 text-xs text-ink-muted">
            {[salon.phone, salon.gstin ? `GSTIN ${salon.gstin}` : null].filter(Boolean).join(' · ')}
          </p>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-ink">
              {invoice.isGst ? 'Tax invoice' : 'Invoice'}{' '}
              <span className="font-mono text-xs text-ink-muted">{invoice.invoiceNumber}</span>
            </p>
            <p className="text-xs text-ink-muted">{date(invoice.invoiceDate)}</p>
          </div>
          {invoice.customerName ? (
            <p className="mt-1 text-xs text-ink-muted">Billed to {invoice.customerName}</p>
          ) : null}
        </header>

        <div className="px-5 py-4 sm:px-7">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-stone-200 text-2xs uppercase tracking-wide text-ink-subtle">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={`${item.name}-${index}`} className="border-b border-stone-100 last:border-0">
                  <td className="py-2.5 text-xs text-ink">
                    {item.name}
                    {invoice.isGst && num(item.taxRatePct) > 0 ? (
                      <span className="block text-2xs text-ink-subtle">
                        GST {num(item.taxRatePct)}%{item.hsnSac ? ` · HSN ${item.hsnSac}` : ''}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 text-right text-xs tabular-nums text-ink-muted">{num(item.quantity)}</td>
                  <td className="py-2.5 text-right text-xs tabular-nums text-ink-muted">
                    {moneyExact(item.unitPrice)}
                  </td>
                  <td className="py-2.5 text-right text-xs tabular-nums text-ink">{moneyExact(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="border-t border-stone-200 px-5 py-4 sm:px-7">
          <Row label="Subtotal" value={moneyExact(totals.grossAmount)} />
          {num(totals.itemDiscount) + num(totals.billDiscount) > 0 ? (
            <Row
              label="Discount"
              value={`− ${moneyExact((num(totals.itemDiscount) + num(totals.billDiscount)) as unknown as Money)}`}
            />
          ) : null}
          {invoice.isGst && num(totals.totalTax) > 0 ? (
            <>
              {num(totals.cgstAmount) > 0 ? <Row label="CGST" value={moneyExact(totals.cgstAmount)} /> : null}
              {num(totals.sgstAmount) > 0 ? <Row label="SGST" value={moneyExact(totals.sgstAmount)} /> : null}
              {num(totals.igstAmount) > 0 ? <Row label="IGST" value={moneyExact(totals.igstAmount)} /> : null}
            </>
          ) : null}
          {num(totals.roundOff) !== 0 ? <Row label="Round off" value={moneyExact(totals.roundOff)} /> : null}

          <div className="mt-2 border-t border-stone-200 pt-2">
            <Row label="Total" value={moneyExact(totals.grandTotal)} strong />
            <Row label="Paid" value={moneyExact(totals.paidAmount)} />
          </div>
        </dl>

        {due > 0 ? (
          <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900 sm:px-7">
            <strong className="font-semibold">{moneyExact(totals.dueAmount)} still to pay.</strong> Settle it at the
            salon{salon.phone ? `, or call ${salon.phone}` : ''} — there is nothing to pay here.
          </p>
        ) : (
          <p className="border-t border-emerald-200 bg-emerald-50 px-5 py-3 text-xs text-emerald-900 sm:px-7">
            Paid in full. Thank you.
          </p>
        )}
      </article>

      <p className="mt-4 text-center text-2xs text-ink-subtle">
        Keep this link to come back to your bill. Anyone who has it can read it, so share it only with people you
        would show the bill to.
      </p>
    </main>
  );
}
