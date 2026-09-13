'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Download, Loader2, Search, X } from 'lucide-react';
import { useDebounced } from '@/lib/use-debounced';

const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'VIP'] as const;

/**
 * The filter bar, without an Apply button.
 *
 * Typing a name or a number narrows the list as you go — the search is
 * debounced and pushed into the URL, so the page stays shareable and the back
 * button still works, but nobody has to press anything to see a result. The
 * tier and lapsed controls apply on change for the same reason.
 *
 * `replace` rather than `push`, so eight keystrokes do not become eight entries
 * in the browser's history for someone to click back through.
 */
export function CustomerFilters({
  q,
  tier,
  lapsed,
}: {
  q: string;
  tier: string;
  lapsed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [text, setText] = useState(q);
  const debounced = useDebounced(text, 300);

  // What the URL already says. Without this the first render would re-navigate
  // to the page it is already on, and every back-navigation would fight the
  // value restored into the box.
  const applied = useRef(q);

  useEffect(() => {
    const next = debounced.trim();
    if (next === applied.current) return;
    applied.current = next;
    navigate({ q: next });
    // navigate is stable for our purposes — it only reads props and router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // A tier or lapsed change arriving from elsewhere (back button) should be
  // reflected in the box too.
  useEffect(() => {
    applied.current = q;
    setText(q);
  }, [q]);

  function navigate(changes: { q?: string; tier?: string; lapsed?: boolean }) {
    const params = new URLSearchParams();
    const nextQ = changes.q ?? text.trim();
    const nextTier = changes.tier ?? tier;
    const nextLapsed = changes.lapsed ?? lapsed;

    if (nextQ) params.set('q', nextQ);
    if (nextTier) params.set('tier', nextTier);
    if (nextLapsed) params.set('lapsed', 'true');
    // Any change to the filters puts us back on the first page; staying on
    // page 4 of the old result is how a search looks like it found nothing.

    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Name, phone or customer code…"
          aria-label="Search customers"
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
        value={tier}
        onChange={(event) => navigate({ tier: event.target.value })}
        aria-label="Tier"
        className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm"
      >
        <option value="">All tiers</option>
        {TIERS.map((value) => (
          <option key={value} value={value}>
            {value[0]}
            {value.slice(1).toLowerCase()}
          </option>
        ))}
      </select>

      <label className="flex h-9 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm">
        <input
          type="checkbox"
          checked={lapsed}
          onChange={(event) => navigate({ lapsed: event.target.checked })}
          className="h-3.5 w-3.5 rounded border-stone-300 text-brand-600"
        />
        Lapsed 45+ days
      </label>

      <a
        href={`/api/proxy/customers/export${q ? `?q=${encodeURIComponent(q)}` : ''}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm text-ink shadow-sm hover:bg-stone-50"
      >
        <Download className="h-3.5 w-3.5" />
        CSV
      </a>
    </div>
  );
}
