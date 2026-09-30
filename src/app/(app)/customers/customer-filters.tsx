'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Download, Loader2, Search, X } from 'lucide-react';
import { useDebounced } from '@/lib/use-debounced';
// A plain module on purpose — the server page needs these too, and an export
// of a 'use client' file cannot be called from the server. See lapsed.ts.
import { LAPSED_DAYS, lapsedCutoff } from './lapsed';

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
  /**
   * ACCEPT THE URL ONLY WHEN IT DID NOT COME FROM US.
   *
   * This effect exists for the back button: leave the page with "jha" in the
   * box, come back, and the box should say "jha" again. But `q` also arrives
   * as the ECHO of our own navigation a moment ago, and that echo is stale by
   * however much was typed while it was in flight.
   *
   * Which is why typing ate characters. Type "jha", the debounce fires and we
   * navigate; type "r" before the server answers; the answer lands carrying
   * q="jha", this effect runs setText("jha") — and the "r" is gone. Type it
   * again, lose the next letter. On a slow connection it is unusable, and it
   * looked like the app fighting the keyboard because that is exactly what it
   * was doing.
   *
   * `applied.current` is already the last value WE sent. If `q` matches it,
   * this is our own echo and the box is ahead of it: say nothing. Anything
   * else is a real navigation — back button, a shared link, a filter changed
   * elsewhere — and that should win.
   */
  useEffect(() => {
    if (q === applied.current) return;
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

  /**
   * BACK TO THE WHOLE BOOK, IN ONE PLACE.
   *
   * The small × inside the box only ever cleared the text, and it cleared it
   * into a state the page had not caught up with yet. Meanwhile a tier or the
   * lapsed checkbox stayed on, invisibly, and the list that came back looked
   * like a search that had found nothing rather than a filter still running.
   *
   * This resets every one of them at once and navigates immediately, so "clear"
   * means the page you would have got by arriving fresh. `applied` is set by
   * hand because the debounce has not run yet — without it the effect above
   * would see a change it did not make and fire a second, identical navigation.
   */
  const anyFilter = Boolean(text.trim() || q || tier || lapsed);

  function clearAll() {
    setText('');
    applied.current = '';
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  /**
   * The export follows the screen.
   *
   * It carried `q` and nothing else, so a list narrowed to Gold members or to
   * lapsed customers exported as the entire book — the same filename, a
   * plausible-looking file, and the wrong people in it. A CSV that silently
   * disagrees with the list it came from is worse than no CSV.
   */
  const exportQuery = new URLSearchParams();
  if (q) exportQuery.set('q', q);
  if (tier) exportQuery.set('tier', tier);
  if (lapsed) {
    exportQuery.set('lastVisitBefore', lapsedCutoff());
    exportQuery.set('minVisits', '1');
  }
  const exportHref = `/api/proxy/customers/export${exportQuery.toString() ? `?${exportQuery}` : ''}`;

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
              /**
               * Empties the box AND asks for the result, rather than emptying
               * the box and waiting 300ms for the debounce to notice. Clicking
               * an × is a decision already made; making somebody watch the old
               * results sit there afterwards reads as the button not working.
               * The tier and the lapsed toggle are deliberately left alone —
               * this is the text's ×, and Clear beside it is the whole reset.
               */
              onClick={() => {
                setText('');
                applied.current = '';
                navigate({ q: '' });
              }}
              aria-label="Clear search text"
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
        Lapsed {LAPSED_DAYS}+ days
      </label>

      {/* Only when there is something to clear. A permanently visible Clear on
          an unfiltered list is a button that does nothing, and people learn to
          stop believing buttons like that. */}
      {anyFilter ? (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm text-ink-muted shadow-sm hover:bg-stone-50 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      ) : null}

      <a
        href={exportHref}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm text-ink shadow-sm hover:bg-stone-50"
      >
        <Download className="h-3.5 w-3.5" />
        CSV
      </a>
    </div>
  );
}
