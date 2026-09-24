'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, UserPlus, X } from 'lucide-react';
import { apiDelete, apiGet, apiPost, errorMessage } from '@/lib/client';
import { Card } from '@/components/ui/display';
import { useToast } from '@/components/ui/overlay';
import { useDebounced } from '@/lib/use-debounced';
import { phone as formatPhone } from '@/lib/format';
import type { CustomerMatch } from '@/lib/types';

/**
 * ADDING PEOPLE TO A LIST ONE AT A TIME.
 *
 * Rules answer "everyone who has not been in for 60 days". They cannot answer
 * "these nine, because I know them" — the brides whose trials are next month,
 * the regulars told about a new stylist first, the six people owed an apology
 * after a bad Saturday. Those groups live in the owner's head and no field in
 * the customer book describes them.
 *
 * Search is the whole interaction: a salon owner knows the name, not the id.
 * The same lookup the till uses, so "931" finds a phone number and "priya sh"
 * finds Priya Sharma.
 */
export function PickMembers({ segmentId, memberIds }: { segmentId: string; memberIds: string[] }) {
  const router = useRouter();
  const toast = useToast();

  const [text, setText] = useState('');
  const query = useDebounced(text, 250);
  const [results, setResults] = useState<CustomerMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const already = new Set(memberIds);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setSearching(true);

    apiGet<CustomerMatch[]>('customers/lookup', { query: { q } })
      .then((rows) => {
        if (!cancelled) setResults(rows);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  async function add(customer: CustomerMatch) {
    setBusy(customer.id);
    try {
      await apiPost(`segments/${segmentId}/members`, { customerId: customer.id });
      toast.success(`${customer.firstName} added`);
      // The box is cleared rather than kept: somebody adding nine people is
      // typing nine different names, not refining one search.
      setText('');
      setResults([]);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-5">
      <div className="border-b border-stone-200 p-4">
        <p className="text-xs font-semibold text-ink">Add someone to this list</p>
        <p className="mt-1 text-2xs leading-relaxed text-ink-subtle">
          Search by name, phone or customer code. Adding somebody twice does nothing, so you can work down a list
          without keeping your place.
        </p>

        <div className="relative mt-3 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
          <input
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Name, phone or code…"
            aria-label="Find a customer to add"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-stone-300 bg-white pl-8 pr-9 text-sm shadow-sm placeholder:text-ink-subtle"
          />
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-subtle" /> : null}
            {!searching && text ? (
              <button
                type="button"
                onClick={() => setText('')}
                aria-label="Clear"
                className="rounded p-0.5 text-ink-subtle hover:bg-stone-100 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </span>
        </div>
      </div>

      {text.trim().length >= 2 ? (
        <div className="p-2">
          {results.length === 0 && !searching ? (
            <p className="px-2 py-3 text-xs text-ink-subtle">
              Nobody matches that. A phone number is the most reliable way to find someone.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {results.map((customer) => {
                const inList = already.has(customer.id);
                return (
                  <li
                    key={customer.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-stone-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">
                        {customer.firstName} {customer.lastName ?? ''}
                      </span>
                      <span className="block truncate text-2xs text-ink-subtle">
                        {formatPhone(customer.phone)}
                        {customer.code ? ` · ${customer.code}` : ''}
                      </span>
                    </span>

                    {inList ? (
                      <span className="shrink-0 text-2xs text-ink-subtle">already in the list</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === customer.id}
                        onClick={() => void add(customer)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-2xs text-ink hover:bg-white disabled:opacity-50"
                      >
                        {busy === customer.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <UserPlus className="h-3 w-3" />
                        )}
                        Add
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </Card>
  );
}

/** Takes one person back out. Its own component so a row can stay a server one. */
export function RemoveMember({
  segmentId,
  customerId,
  name,
}: {
  segmentId: string;
  customerId: string;
  name: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Remove ${name} from this list`}
      title={`Remove ${name}`}
      onClick={async () => {
        setBusy(true);
        try {
          await apiDelete(`segments/${segmentId}/members/${customerId}`);
          toast.success(`${name} removed`);
          router.refresh();
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
      className="rounded p-1 text-ink-subtle hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
    </button>
  );
}
