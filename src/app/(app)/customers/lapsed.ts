/**
 * WHAT COUNTS AS LAPSED — IN A FILE THAT BELONGS TO NEITHER SIDE.
 *
 * Plain module, deliberately. No `'use client'` at the top, and nothing in here
 * that needs one: a number and a function over `Date`.
 *
 * ── Why it is not where it was ───────────────────────────────────────────
 *
 * It lived in customer-filters.tsx, which IS a client component, and the
 * customers page — a server component — imported it and called it. That builds
 * without complaint and then throws on every request:
 *
 *   Attempted to call lapsedCutoff() from the server but lapsedCutoff is on the
 *   client. It's not possible to invoke a client function from the server.
 *
 * Next replaces every export of a `'use client'` module with a reference the
 * server can hand to the browser, not the thing itself. A component survives
 * that, because passing a reference is exactly what rendering one does. A plain
 * function does not: there is nothing on the server left to call.
 *
 * The lesson, and the reason this file exists rather than a duplicated constant:
 * a value shared between a server component and a client component belongs in a
 * module that declares neither. Both may import it, and the boundary stays where
 * the framework can see it.
 *
 * ── Why it is shared at all ─────────────────────────────────────────────
 *
 * The number was written three times — in the label on the checkbox, in the
 * cutoff the page sends, and nowhere at all in the CSV export, which is how the
 * export came to disagree with the screen it was exported from.
 */

export const LAPSED_DAYS = 45;

export const lapsedCutoff = (): string =>
  new Date(Date.now() - LAPSED_DAYS * 24 * 60 * 60 * 1000).toISOString();
