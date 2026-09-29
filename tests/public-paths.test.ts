import { describe, expect, it } from 'vitest';
import { isPublic } from '../src/lib/public-paths';

/**
 * WHO MAY OPEN WHAT WITHOUT SIGNING IN.
 *
 * These exist because the same few lines have broken customer-facing features
 * three times, silently, and each time a customer found out before we did. The
 * list is cheap to get wrong and nothing fails loudly when it is: a wrong entry
 * shows a login screen to somebody who has no account, or an app shell to
 * somebody who should have been sent away, and neither raises an error anywhere.
 *
 * So each historical failure gets a case of its own, and the cases are written
 * as the customer's journey rather than as string matching — because every one of
 * these bugs passed a reading of the code and failed a real visit.
 */

describe('a customer with no account', () => {
  it('can open the booking page a salon links from its website', () => {
    expect(isPublic('/book/glow-studio')).toBe(true);
  });

  it('can open the feedback form sent after a visit', () => {
    expect(isPublic('/feedback/cmu2zhi40000gp4dbllzqk7hl')).toBe(true);
  });

  it('can open the counter card’s form, which has a branch and no visit', () => {
    expect(isPublic('/feedback/qr/cmu2zhi40000gp4dbllzqk7hl')).toBe(true);
  });

  it('can open their own bill from the link in an email', () => {
    /**
     * FAILURE 2. /invoice was simply absent, so the link in an invoice email
     * sent the customer to /login?next=%2Finvoice%2F… and asked them to sign in
     * to a salon system they will never have an account for.
     */
    expect(isPublic('/invoice/tok_abc123')).toBe(true);
  });

  it('can reach the sign-in page itself', () => {
    expect(isPublic('/login')).toBe(true);
  });
});

describe('what those pages DO, which is a separate question', () => {
  /**
   * FAILURE 3, the one that broke online booking.
   *
   * The browser never calls the API directly — a client component calls
   * /api/proxy/<path> and the route handler attaches the token server-side. The
   * pages above were public; these were not, so every customer action was
   * redirected to /login and the client parsed an HTML login page as JSON.
   *
   * One case per call that was dead, because "the proxy is public now" is the
   * kind of claim that is true for the path somebody tested and false for the
   * other six.
   */
  it('lets a customer submit the counter card’s rating', () => {
    expect(isPublic('/api/proxy/public/feedback/qr/cmu2zhi40000gp4dbllzqk7hl')).toBe(true);
  });

  it('lets a customer submit feedback for a visit', () => {
    expect(isPublic('/api/proxy/public/feedback/cmu2zhi40000gp4dbllzqk7hl')).toBe(true);
  });

  it('lets a customer fetch their review suggestions', () => {
    expect(isPublic('/api/proxy/public/feedback/suggestions/cmumngtlu000cx4s9ixer2uqv')).toBe(true);
  });

  it('lets a customer’s Google tap be recorded', () => {
    expect(isPublic('/api/proxy/public/feedback/abc/google')).toBe(true);
  });

  it('lets a customer see which stylists are bookable', () => {
    expect(isPublic('/api/proxy/public/glow-studio/staff')).toBe(true);
  });

  it('lets a customer see what times are free', () => {
    expect(isPublic('/api/proxy/public/glow-studio/slots')).toBe(true);
  });

  it('LETS A CUSTOMER ACTUALLY BOOK', () => {
    // The one that matters commercially. This was dead in production.
    expect(isPublic('/api/proxy/public/glow-studio/book')).toBe(true);
  });

  it('lets somebody sign in, which cannot itself require being signed in', () => {
    expect(isPublic('/api/auth/login')).toBe(true);
    expect(isPublic('/api/auth/logout')).toBe(true);
  });
});

describe('a staff screen is never public, however much it looks like one', () => {
  it('keeps the feedback list behind a login', () => {
    /**
     * FAILURE 1. A loose prefix made siblings public: `/feedback` was listed for
     * the customer's form, which also waved through /feedback itself — the staff
     * page listing every customer's feedback. The trailing slash is the guard.
     */
    expect(isPublic('/feedback')).toBe(false);
  });

  it('keeps the invoice ledger behind a login, though it starts with /invoice', () => {
    // Adding '/invoice' loosely would have opened '/invoices' — rule 1 from the
    // other direction, and the reason the section list is matched with a slash.
    expect(isPublic('/invoices')).toBe(false);
    expect(isPublic('/invoices/cmu2zhi40000gp4dbllzqk7hl')).toBe(false);
  });

  it('keeps the booking diary behind a login, though it starts with /book', () => {
    expect(isPublic('/bookings')).toBe(false);
  });

  it('keeps every ordinary staff screen behind a login', () => {
    for (const path of ['/', '/customers', '/appointments', '/settings', '/staff', '/analytics']) {
      expect(isPublic(path)).toBe(false);
    }
  });
});

describe('the proxy is public only where the API itself is', () => {
  it('does not wave through a staff endpoint', () => {
    /**
     * The whole risk of the fix. /api/proxy/public is public because it forwards
     * to the API's own unauthenticated router; the rest of the proxy must still
     * require the cookie, or a signed-out browser would be handed the app's data
     * endpoints and told to try.
     *
     * (It would still be refused — the API is the real boundary — but relying on
     * that is how a courtesy check becomes a security claim nobody checked.)
     */
    for (const path of [
      '/api/proxy/customers',
      '/api/proxy/invoices',
      '/api/proxy/appointments/today',
      '/api/proxy/tenant/settings',
      '/api/proxy/platform/tenants',
    ]) {
      expect(isPublic(path)).toBe(false);
    }
  });

  it('is not fooled by a path that merely begins with the same letters', () => {
    // 'publicity' starts with 'public'. The trailing slash is what stops it.
    expect(isPublic('/api/proxy/publicity')).toBe(false);
    expect(isPublic('/api/proxy/public-reports')).toBe(false);
  });

  it('does not treat the section itself as a call', () => {
    expect(isPublic('/api/proxy/public')).toBe(false);
    expect(isPublic('/api/proxy')).toBe(false);
  });
});

describe('build output and icons', () => {
  it('are served without a login, because a login page needs them too', () => {
    for (const path of ['/_next/static/chunk.js', '/favicon.ico', '/icon.svg', '/manifest.webmanifest']) {
      expect(isPublic(path)).toBe(true);
    }
  });
});
