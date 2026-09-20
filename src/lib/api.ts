import 'server-only';
import { getAccessToken, getActiveBranchId } from './session';
import type { ApiErrorBody, Envelope, PageMeta } from './types';

export const API_URL = process.env.API_URL ?? 'https://parlon.jharavi.in';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  /**
   * The server understood perfectly well and said no.
   *
   * Distinct from 401: signing in again will not help, because the account is
   * fine and the role simply does not include this. Treating the two alike is
   * how people end up in a login loop being asked to re-enter a password that
   * was never the problem.
   */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  branchId?: string | null;
  /** Skip the branch header entirely (tenant-wide reads). */
  noBranch?: boolean;
  cache?: RequestCache;
  revalidate?: number;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: ApiRequest['query']): string {
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Server-side call to the Parlon API. Used by server components and route
 * handlers; the browser never calls the API directly.
 */
export async function apiFetch<T>(path: string, options: ApiRequest = {}): Promise<T> {
  const token = await getAccessToken();
  const branchId = options.noBranch ? null : (options.branchId ?? (await getActiveBranchId()));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (branchId) headers['X-Branch-Id'] = branchId;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: options.cache ?? 'no-store',
    ...(options.revalidate !== undefined ? { next: { revalidate: options.revalidate } } : {}),
    signal: options.signal,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Envelope<T> | ApiErrorBody) : null;

  if (!response.ok || (payload && 'success' in payload && payload.success === false)) {
    const error = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? `Request to ${path} failed (${response.status})`,
      error?.details,
    );
  }

  return (payload as Envelope<T>)?.data as T;
}

/** Same as apiFetch but keeps the pagination envelope. */
export async function apiFetchList<T>(
  path: string,
  options: ApiRequest = {},
): Promise<{ data: T[]; meta: PageMeta }> {
  const token = await getAccessToken();
  const branchId = options.noBranch ? null : (options.branchId ?? (await getActiveBranchId()));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (branchId) headers['X-Branch-Id'] = branchId;

  const response = await fetch(buildUrl(path, options.query), {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Envelope<T[]> | ApiErrorBody) : null;

  if (!response.ok || (payload && 'success' in payload && payload.success === false)) {
    const error = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? `Request to ${path} failed (${response.status})`,
    );
  }

  const envelope = payload as Envelope<T[]>;
  return {
    data: envelope?.data ?? [],
    meta: envelope?.meta ?? { page: 1, pageSize: 25, total: envelope?.data?.length ?? 0, totalPages: 1, hasMore: false },
  };
}

/**
 * For screens where a failed panel should not take the whole page down —
 * returns null instead of throwing.
 */
export async function apiFetchSafe<T>(path: string, options: ApiRequest = {}): Promise<T | null> {
  try {
    return await apiFetch<T>(path, options);
  } catch {
    return null;
  }
}

/**
 * Fetch something the caller may not be allowed to see.
 *
 * Returns null on 403 instead of throwing, so a refusal can be RENDERED — as
 * <PermissionGate /> — rather than thrown at an error boundary. That matters
 * because Next redacts server-component errors in production: by the time one
 * reaches error.tsx it is a digest with no status on it, and the page can only
 * apologise vaguely. Catching it here keeps the reason while we still have it.
 *
 * Every other failure still throws. A 500 is not a permissions problem and
 * should not be dressed up as one.
 */
export async function apiFetchAllowed<T>(path: string, options: ApiRequest = {}): Promise<T | null> {
  try {
    return await apiFetch<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) return null;
    throw error;
  }
}

/** The same, for paginated reads. */
export async function apiFetchListAllowed<T>(
  path: string,
  options: ApiRequest = {},
): Promise<{ data: T[]; meta: PageMeta } | null> {
  try {
    return await apiFetchList<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) return null;
    throw error;
  }
}
