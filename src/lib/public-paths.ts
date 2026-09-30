/**
 * WHAT A CUSTOMER CAN OPEN WITHOUT AN ACCOUNT, AND NOTHING MORE.
 *
 * Lives apart from middleware.ts so it can be tested. That is not tidiness: the
 * same few lines have now broken customer-facing features three separate times,
 * each time silently, and each time discovered by a customer rather than by us.
 * A list this cheap to get wrong belongs somewhere a test can hold it still.
 *
 * ── The three failures, because each one explains a rule below ────────────
 *
 * 1. LOOSE PREFIXES MADE SIBLINGS PUBLIC. It was one list matched with a plain
 *    startsWith, and a prefix that is public makes every path beginning with
 *    those characters public too, whether or not it is the same page.
 *    `/feedback` was listed for the customer's form at /feedback/<appointment>,
 *    which also waved through `/feedback` itself — the staff page listing every
 *    customer's feedback. Only the API refusing a request with no cookie stood
 *    behind it. Hence: sections are public in their CHILDREN only, which is
 *    where the token is and where the customer goes. The section's own page is
 *    not, which is where the staff screen lives.
 *
 * 2. A SECTION WAS SIMPLY ABSENT. `/invoice` was missing, so the link in an
 *    invoice email redirected the customer to /login?next=%2Finvoice%2F… and
 *    asked them to sign in to a salon system they will never have an account
 *    for. Adding it to the old loose list would have done the same to
 *    `/invoices`, the staff ledger, which begins with exactly those characters —
 *    which is rule 1 again, from the other direction.
 *
 * 3. THE PAGE WAS PUBLIC AND WHAT THE PAGE DOES WAS NOT. The worst of the
 *    three, because it broke online booking and nobody could see it. The
 *    browser never calls the API directly: a client component calls
 *    `/api/proxy/<path>` and the route handler attaches the token server-side.
 *    `/feedback` and `/book` let the PAGES through; nothing let the ACTIONS
 *    through. So a customer opened /feedback/qr/<branch>, picked their services,
 *    tapped the stars, pressed send — and the POST to
 *    /api/proxy/public/feedback/qr/<branch> matched nothing here and was
 *    redirected to /login. The client parsed an HTML login page as JSON and said
 *    "Something went wrong. Please try again."
 *
 *    Seven calls went the same way: picking a stylist, loading free slots,
 *    confirming a booking, submitting feedback for a visit, submitting from the
 *    counter card, fetching review suggestions, recording the Google tap.
 *
 *    It stayed hidden because of WHO TESTS. A salon owner opening their own
 *    booking page is signed in, so the cookie is there and everything works. It
 *    fails only for somebody with no session — a customer, a phone, a second
 *    browser — which is every real customer and no developer. It reached us as
 *    "works in Brave, fails in Chrome"; one browser happened to be the
 *    logged-in one.
 *
 * ── This is not the security boundary ─────────────────────────────────────
 *
 * The API is. It mounts /public before its authenticate middleware and behind
 * its own rate limiter, and refuses everything else without a valid token. This
 * check exists so a customer is not shown a login screen they cannot use, and so
 * a member of staff is not shown a broken app shell. Getting it wrong is a bad
 * experience, never an exposure — which is exactly why it must be tested rather
 * than reasoned about: nothing fails loudly when it is wrong.
 */

/** Public in their CHILDREN only. The section's own page belongs to staff. */
export const PUBLIC_SECTIONS = [
  /** The booking page a salon links from its website. */
  '/book',
  /** A customer's feedback form: /feedback/<appointment> and /feedback/qr/<branch>. */
  '/feedback',
  /** A customer's own bill, opened from a token in an email. */
  '/invoice',
  /** Signing in, which cannot require being signed in. */
  '/api/auth',
  /**
   * What the pages above actually DO — see failure 3.
   *
   * Proxies the API's own unauthenticated router, so these paths were never
   * protected by this check. Everything else under /api/proxy still needs the
   * cookie.
   */
  '/api/proxy/public',
];

/** Public as themselves, with no child path. */
export const PUBLIC_EXACT = [
  '/login',
  /**
   * Asking to be let back in, and setting a password from a link support
   * issued. Both are reached by somebody who CANNOT sign in — guarding them
   * behind a session would mean the only way to recover an account is to
   * already have access to it.
   *
   * Listed exactly rather than as sections. `/reset-password` carries its token
   * in the query string, not the path, so it needs no children — and a section
   * entry would make anything beginning with those characters public too, which
   * is the mistake rule 1 above is about.
   *
   * Note what is NOT here: `/change-password`. That one requires a session by
   * design — it asks for the password you currently have.
   */
  '/forgot-password',
  '/reset-password',
];

/** Build output and icons, matched loosely because they carry file extensions. */
export const ASSET_PREFIXES = ['/_next', '/favicon', '/icon', '/apple-icon', '/manifest'];

export function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  // The trailing slash is the whole guard: /invoice/<token> is a customer's
  // bill, /invoices is the salon's ledger.
  if (PUBLIC_SECTIONS.some((section) => pathname.startsWith(`${section}/`))) return true;
  return ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
