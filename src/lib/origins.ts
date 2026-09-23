/**
 * WHERE THE OTHER PIECES LIVE, AND A REFUSAL TO GUESS IN PRODUCTION.
 *
 * Every one of these had a localhost default so the app runs out of the box,
 * and that default is the trap. A deployment missing one variable does not
 * fail — it builds, serves, and quietly calls http://localhost:4000 from a
 * server in Mumbai, which times out as a 503 with nothing in it that says why.
 * That is not hypothetical: it is the bug that took an afternoon to find.
 *
 * Two names are accepted for each, because Next.js draws a hard line between
 * NEXT_PUBLIC_* (inlined into the browser bundle at build time) and plain
 * server-side variables, and it is genuinely easy to set one and not the
 * other. Accepting both is kinder than being right about which is correct.
 *
 * In production a localhost value throws at module load, so the failure
 * happens on the deploy screen instead of in a customer's browser.
 */

const trim = (value: string) => value.replace(/\/+$/, '');

function resolve(name: string, candidates: (string | undefined)[], fallback: string, accepts: string[]): string {
  const value = trim(candidates.find((candidate) => candidate && candidate.trim())?.trim() || fallback);

  if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(value)) {
    /**
     * Next.js evaluates route modules to collect page data, so this surfaces
     * as "Failed to collect page data for /api/auth/login" with a stack and
     * the reason several lines above it — easy to scroll past. So the message
     * names the variables to set rather than describing the problem, because
     * whoever reads it wants the next action, not a diagnosis.
     */
    throw new Error(
      `${name} is ${value} in a production build. Nothing on the public internet can reach that.\n` +
        `Set ${accepts.join(' or ')} in your deployment's environment variables ` +
        `(on Vercel: Settings -> Environment Variables, ticked for Production, Preview AND Development), ` +
        `then redeploy — adding a variable does not rebuild on its own.`,
    );
  }

  return value;
}

/** This API, as reached from the server that renders these pages. */
export const API_URL = resolve(
  'API_URL',
  [process.env.API_URL, process.env.NEXT_PUBLIC_API_URL],
  'http://localhost:4000/api/v1',
  ['API_URL', 'NEXT_PUBLIC_API_URL'],
);

/** This API, as reached from a stranger's browser. */
export const PUBLIC_API_URL = resolve(
  'NEXT_PUBLIC_API_URL',
  [process.env.NEXT_PUBLIC_API_URL, process.env.API_URL],
  'http://localhost:4000/api/v1',
  ['NEXT_PUBLIC_API_URL', 'API_URL'],
);

/**
 * Where this app is served to the public.
 *
 * Must match the backend's PUBLIC_APP_URL: that is the origin it prints into
 * WhatsApp messages, tracked links and QR codes, and a booking page living at
 * two different addresses is a support call waiting to happen.
 */
export const APP_URL = resolve(
  'PUBLIC_APP_URL',
  [process.env.PUBLIC_APP_URL, process.env.NEXT_PUBLIC_APP_URL],
  'http://localhost:3000',
  ['PUBLIC_APP_URL', 'NEXT_PUBLIC_APP_URL'],
);
