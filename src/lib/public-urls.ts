/**
 * The addresses a salon hands to its own customers.
 *
 * Read on the server and passed down as plain strings, because the values come
 * from deployment configuration rather than anything the browser knows. They
 * must match the backend's PUBLIC_APP_URL — that is the origin it prints into
 * WhatsApp messages and QR codes, and a booking page on two different addresses
 * is a support call waiting to happen.
 */

const trim = (value: string) => value.replace(/\/+$/, '');

/** Where this app is served to the public. */
export function appOrigin(): string {
  return trim(process.env.PUBLIC_APP_URL ?? 'http://localhost:3000');
}

/** Where the API is reachable from a stranger's browser, not from this server. */
export function publicApiOrigin(): string {
  return trim(process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:4000/api/v1');
}

export function bookingPageUrl(slug: string): string {
  return `${appOrigin()}/book/${slug}`;
}

export function embedScriptUrl(slug: string): string {
  return `${publicApiOrigin()}/public/${slug}/embed.js`;
}
