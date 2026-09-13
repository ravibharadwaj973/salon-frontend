'use client';

import type { ApiErrorBody, Envelope, PageMeta } from './types';

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ClientApiError';
  }
}

export interface ClientRequest {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  branchId?: string | null;
  signal?: AbortSignal;
}

function toUrl(path: string, query?: ClientRequest['query']): string {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(`/api/proxy/${clean}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  options: ClientRequest = {},
): Promise<{ data: T; meta?: PageMeta }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.branchId) headers['X-Branch-Id'] = options.branchId;

  const response = await fetch(toUrl(path, options.query), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 204) return { data: undefined as T };

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Envelope<T> | ApiErrorBody) : null;

  if (!response.ok || (payload && 'success' in payload && payload.success === false)) {
    const error = (payload as ApiErrorBody | null)?.error;

    // The session is gone — bounce to login rather than showing a broken screen.
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }

    throw new ClientApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }

  const envelope = payload as Envelope<T>;
  return { data: envelope.data, meta: envelope.meta };
}

export async function apiGet<T>(path: string, options?: ClientRequest): Promise<T> {
  return (await request<T>('GET', path, options)).data;
}

export async function apiList<T>(
  path: string,
  options?: ClientRequest,
): Promise<{ data: T[]; meta: PageMeta }> {
  const result = await request<T[]>('GET', path, options);
  return {
    data: result.data ?? [],
    meta: result.meta ?? { page: 1, pageSize: 25, total: result.data?.length ?? 0, totalPages: 1, hasMore: false },
  };
}

export async function apiPost<T>(path: string, body?: unknown, options?: ClientRequest): Promise<T> {
  return (await request<T>('POST', path, { ...options, body })).data;
}

export async function apiPatch<T>(path: string, body?: unknown, options?: ClientRequest): Promise<T> {
  return (await request<T>('PATCH', path, { ...options, body })).data;
}

export async function apiPut<T>(path: string, body?: unknown, options?: ClientRequest): Promise<T> {
  return (await request<T>('PUT', path, { ...options, body })).data;
}

export async function apiDelete<T>(path: string, options?: ClientRequest): Promise<T> {
  return (await request<T>('DELETE', path, options)).data;
}

/** Friendly message for any thrown error, for toasts and inline errors. */
export function errorMessage(error: unknown): string {
  if (error instanceof ClientApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
