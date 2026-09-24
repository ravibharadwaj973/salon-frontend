'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';
import { useDebounced } from '@/lib/use-debounced';

const STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'VOID'] as const;

/**
 * The invoice filter bar, without an Apply button.
 *
 * It was a plain GET form, which had two consequences and both were bad.
 *
 * Nothing narrowed until Apply was pressed, while the customer list beside it
 * filtered as you typed — so the same gesture worked on one screen and did
 * nothing on the other.
 *
 * And a GET form submits every control it contains, so pressing Apply with
 * nothing set navigated to `?q=&status=&from=&to=`. Three empty strings the
 * API refused (an enum with no '' member, a date that would not coerce), a 422,
 * and a page reading "No invoices here. Bills you create will appear here" to a
 * salon with hundreds of bills. The server drops blank parameters now; this
 * bar never sends them in the first place.
 *
 * `replace` rather than `push`, so eight keystrokes do not become eight entries
 * in the browser's history.
 */
export function InvoiceFilters({
  q,
  status,
  from,
  to,
  unpaidOnly,
}: {
  q: string;
  status: string;
  from: string;
  to: string;
  unpaidOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [text, setText] = useState(q);
  const debounced = useDebounced(text, 300);

  // What the URL already says. Without this the first render re-navigates to
  // the page it is already on, and a back-navigation fights the restored value.
  const applied = useRef(q);

  useEffect(() => {
    const next = debounced.trim();
    if (next === applied.current) return;
    applied.current = next;
    navigate({ q: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => {
    applied.current = q;
    setText(q);
  }, [q]);

  function navigate(changes: { q?: string; status?: string; from?: string; to?: string; unpaidOnly?: boolean }) {
    const params = new URLSearchParams();
    const next = {
      q: changes.q ?? text.trim(),
      status: changes.status ?? status,
      from: changes.from ?? from,
      to: changes.to ?? to,
      unpaidOnly: changes.unpaidOnly ?? unpaidOnly,
    };

    // Only what is actually set. A blank is left out rather than sent empty.
    if (next.q) params.set('q', next.q);
    if (next.status) params.set('status', next.status);
    if (next.from) params.set('from', next.from);
    if (next.to) params.set('to', next.to);
    if (next.unpaidOnly) params.set('unpaidOnly', 'true');
    // No page: any change to the filters goes back to the first page, because
    // staying on page 4 of the old result looks exactly like finding nothing.

    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  const field = 'h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm';

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Invoice number, customer or phone…"
          aria-label="Search invoices"
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-stone-300 bg-white pl-8 pr-16 text-sm shadow-sm placeholder:text-ink-subtle"
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-subtle" /> : null}
          {text ? (
            <button
              type="button"
              onClick={() => setText('')}
              aria-label="Clear search"
              className="rounded p-0.5 text-ink-subtle hover:bg-stone-100 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </span>
      </div>

      <select
        value={status}
        onChange={(event) => navigate({ status: event.target.value })}
        aria-label="Status"
        className={field}
      >
        <option value="">All statuses</option>
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {value.replace(/_/g, ' ').toLowerCase()}
          </option>
        ))}
      </select>

      <input
        type="date"
        value={from}
        onChange={(event) => navigate({ from: event.target.value })}
        aria-label="From date"
        className={field}
      />
      <input
        type="date"
        value={to}
        onChange={(event) => navigate({ to: event.target.value })}
        aria-label="To date"
        className={field}
      />

      <label className="flex h-9 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm">
        <input
          type="checkbox"
          checked={unpaidOnly}
          onChange={(event) => navigate({ unpaidOnly: event.target.checked })}
          className="h-3.5 w-3.5 rounded border-stone-300 text-brand-600"
        />
        Unpaid only
      </label>
    </div>
  );
}
