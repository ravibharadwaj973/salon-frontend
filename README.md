# Salon OS — staff & owner web app

The app a salon actually works in: the front desk takes bookings and bills, stylists
see their day, the owner sees the money. One deployment serves every salon on the
platform — the tenant is decided by who is signed in, never by the URL.

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind · TanStack Query.

---

## Running it

```bash
cp .env.example .env.local     # point API_URL at the backend
npm install
npm run dev                    # http://localhost:3000
```

| Variable | What it is |
| --- | --- |
| `API_URL` | Backend base URL, server-side only — e.g. `http://localhost:4000/api/v1` |
| `NEXT_PUBLIC_APP_NAME` | Shown in the sidebar and page titles |

`API_URL` is deliberately **not** `NEXT_PUBLIC_`. The browser never talks to the API
directly; see below.

```bash
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

---

## The browser never holds a token

This is the one architectural decision worth reading before anything else.

```
browser  ──fetch('/api/proxy/…')──▶  route handler  ──Authorization: Bearer──▶  API
         ◀─────── JSON ───────────                 ◀──────── JSON ────────────
```

- Tokens live in **httpOnly cookies** (`src/lib/session.ts`): `sos_at` (access, 14
  minutes) and `sos_rt` (refresh, 30 days). No JavaScript on the page can read them,
  so an XSS bug cannot walk off with a session.
- `src/app/api/proxy/[...path]/route.ts` is the single door. It attaches the
  `Authorization` header and the active `X-Branch-Id` server-side. On a 401 it
  refreshes **once**, re-sets the rotated cookie pair, and replays the request — so a
  token expiring mid-shift is invisible to the receptionist.
- `src/middleware.ts` does the same refresh on navigation, so a page load after a
  long lunch break lands on the page rather than the login screen.
- `src/lib/api.ts` (server components) and `src/lib/client.ts` (client components)
  are the two ways to call the API. Nothing else should call `fetch` at the API.

The selected branch is a separate, readable cookie (`sos_branch`) because the UI
needs to show it; it is only ever a *hint* — the API re-checks that the signed-in
user may see that branch on every request.

---

## Layout

```
src/
  app/
    (app)/              signed-in staff app, wrapped in the shell
      page.tsx          owner dashboard — today's money, alerts
      calendar/         day/week board, drag-free rebooking, walk-ins
      pos/              the billing terminal
      customers/        list, profile, hair-colour formulas, import
      invoices/         history + a printable invoice
      services|staff|inventory|expenses|packages|memberships|loyalty
      segments|campaigns|journeys|templates|leads
      reports/          owner analytics
      settings/
    book/[slug]/        public booking page (no auth)
    feedback/           public review capture (no auth)
    login/
    api/                auth + the proxy — the only server routes
  components/
    ui/                 button, form, display, table, overlay primitives
    layout/             app shell, nav, branch switcher
  lib/                  api, client, session, types, format, permissions
```

Routes under `(app)` are server components that fetch on the server and hand data to
small client islands; anything interactive (the POS, the calendar, forms) is a
`'use client'` component underneath. Public pages — `/book/[slug]` and `/feedback` —
are outside the shell and outside auth on purpose: a customer must never meet a login
screen.

## Navigation follows permissions

`src/components/layout/nav.ts` groups the app into **Operate / Money / Grow /
Understand**, and each entry carries the permission that reveals it. A stylist signs
in and sees their calendar and customers; an accountant sees invoices and expenses; an
owner sees all of it. The nav is filtered from the permissions the API returned at
login — it is a convenience, not the security boundary. The API enforces the same
permissions on every request, so a hand-typed URL gets a 403, not data.

## Payments are recorded, never taken

There is no payment gateway in this product and nothing here calls out to one. The POS
collects **what the staff member says happened at the counter** — cash, the salon's own
card machine, their own UPI QR, a cheque number, a membership or package deduction —
along with a reference the receptionist types in. Split payments are just several such
records against one invoice.

The public booking page says so plainly: *"Pay at the salon. Nothing is charged now."*
There is no pay-online link anywhere in the app, and no invoice link that would imply
one.

## Charts

`src/app/(app)/reports/report-charts.tsx` uses two series colours:

```ts
const SERIES_1 = '#B03A6B'; // brand plum — the primary measure
const SERIES_2 = '#2a78d6'; // blue — the comparison measure
```

That pair was **validated, not chosen by eye** — it passes the lightness band, chroma
floor, colour-vision-deficiency separation, normal-vision separation and contrast
checks across all pairs. If you add a third series, re-run the validation rather than
picking a colour that looks nice next to these.

Never a dual-axis chart. Two measures of different scale become two charts.

## Conventions

- **Money is never a float.** The API sends decimal strings; `src/lib/format.ts`
  formats them for display and they go back as strings. Don't do arithmetic on money
  in the browser — ask the API.
- **`tnum`** (tabular numerals) on every column of figures, so they line up.
- Server components fetch; client components mutate and then `router.refresh()`.
- Errors from the API carry a `code` and `message`; show the message, don't invent one.
