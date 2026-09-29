import Link from 'next/link';
import { QrCode } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
}

/**
 * THE WAY TO REACH THE CUSTOMER NOBODY HAS A NUMBER FOR.
 *
 * Feedback links normally ride on a message, which means the salon has to hold
 * a phone number and have sent something. A card by the till needs neither. It
 * is the only route to the person who paid cash and walked out — and they are
 * exactly as able to leave a Google review as anybody else.
 *
 * One code per branch, never one per salon. A rating has to land on the shop
 * it happened in or the branch averages are fiction, and a single code shared
 * between three shops is the kind of shortcut nobody notices until the reports
 * are already wrong.
 */
export function ReviewQrCard({ branches }: { branches: Branch[] }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <QrCode className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink">Review card for the counter</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            A printable QR code. Anyone can scan it, tick what they had and leave a rating — no booking, no
            bill, no phone number needed. Happy ones are then offered the Google link, same as everywhere else.
          </p>
        </div>
      </div>

      {branches.length === 0 ? (
        <p className="mt-4 text-xs text-ink-muted">Add a branch first and its card will appear here.</p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-100 border-t border-stone-100">
          {branches.map((branch) => (
            <li key={branch.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-ink">{branch.name}</span>
              <Link
                href={`/feedback/card/${branch.id}`}
                className="inline-flex h-8 items-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-ink hover:border-brand-300"
              >
                Open card
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-2xs leading-relaxed text-ink-subtle">
        These ratings are kept apart from the per-service figures in your reports. The visit is real, but the
        customer chooses the services themselves — so they count towards your overall score without changing
        the numbers you judge a service by.
      </p>
    </section>
  );
}
