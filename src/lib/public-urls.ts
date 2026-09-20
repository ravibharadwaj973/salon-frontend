import { APP_URL, PUBLIC_API_URL } from './origins';

/**
 * The addresses a salon hands to its own customers.
 *
 * Read on the server and passed down as plain strings, because the values come
 * from deployment configuration rather than anything the browser knows. They
 * must match the backend's PUBLIC_APP_URL — that is the origin it prints into
 * WhatsApp messages, tracked links and QR codes, and a booking page living at
 * two different addresses is a support call waiting to happen.
 *
 * The resolution itself lives in origins.ts, so that one file decides what this
 * deployment's addresses are. This module had its own copy of the fallbacks,
 * which is how the app ended up asking for NEXT_PUBLIC_API_URL here and API_URL
 * elsewhere, and a deployment that set only one got a booking link and an embed
 * snippet pointing at two different servers — silently, and only on the pages a
 * salon copies and pastes into their own website.
 */

/** Where this app is served to the public. */
export function appOrigin(): string {
  return APP_URL;
}

/**
 * Where the API is reachable from a stranger's browser — which is not always
 * where this server reaches it. API_URL may point at an internal address behind
 * the proxy; the snippet we hand a salon has to work from the open internet, so
 * NEXT_PUBLIC_API_URL wins when the two differ.
 */
export function publicApiOrigin(): string {
  return PUBLIC_API_URL;
}

export function bookingPageUrl(slug: string): string {
  return `${appOrigin()}/book/${slug}`;
}

export function embedScriptUrl(slug: string): string {
  return `${publicApiOrigin()}/public/${slug}/embed.js`;
}
