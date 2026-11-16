/**
 * Typed HTTP client for the Express API.
 *
 * Deliberately a thin `fetch` wrapper rather than axios: every call goes
 * through one place that attaches the bearer token, unwraps the response
 * envelope, and turns a non-2xx into a throw carrying the server's own message
 * so forms can show it verbatim.
 */
import { STORAGE_KEYS } from './constants';
import type { ApiEnvelope, PaginatedMeta } from './types';

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(
  /\/+$/,
  ''
);

export class ApiError extends Error {
  status: number;
  /** Field-level problems from the validator, keyed by field path. */
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }

  /** True when the session is gone and the caller should bounce to login. */
  get isAuthFailure() {
    return this.status === 401;
  }
}

export function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEYS.token);
  } catch {
    // Private browsing with site data blocked. Treat as signed out.
    return null;
  }
}

export function writeToken(token: string | null, role?: string) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(STORAGE_KEYS.token, token);
      if (role) window.localStorage.setItem(STORAGE_KEYS.role, role);
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.token);
      window.localStorage.removeItem(STORAGE_KEYS.role);
    }
  } catch {
    /* storage unavailable; the in-memory session still works for this tab */
  }
}

export function readRole(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEYS.role);
  } catch {
    return null;
  }
}

/**
 * Query parameters.
 *
 * Typed as `unknown` values rather than a primitive union so that a plain
 * interface describing one endpoint's filters can be passed directly —
 * TypeScript will not assign an interface to a mapped type with a primitive
 * value union, since the interface has no index signature. Non-primitive values
 * are dropped when the URL is built.
 */
export type Query = Record<string, unknown>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Skip the Authorization header (login endpoints). */
  anonymous?: boolean;
  signal?: AbortSignal;
  /** Fire-and-forget: used by the unload path, which cannot await. */
  keepalive?: boolean;
}

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${API_BASE}/api${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === '') continue;
      if (typeof value === 'object') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Error body shape produced by the API's error middleware:
 * `{ success: false, error: { message, status, details?: { fields } } }`
 */
interface ErrorBody {
  error?: {
    message?: string;
    status?: number;
    details?: { segment?: string; fields?: Record<string, string> };
  };
  message?: string;
}

/** Pull `{ field: message }` out of the validator's `details.fields`. */
function extractFields(payload: unknown): Record<string, string> {
  const fields = (payload as ErrorBody | null)?.error?.details?.fields;
  if (!fields || typeof fields !== 'object') return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<{ data: T; meta?: PaginatedMeta; message?: string }> {
  const { method = 'GET', body, query, anonymous, signal, keepalive } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      keepalive,
      cache: 'no-store',
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    // Distinguish "server unreachable" from "server said no" — the offline
    // queue on the patient device branches on exactly this.
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = payload as ErrorBody | null;
    const message =
      body?.error?.message || body?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, extractFields(payload));
  }

  const envelope = (payload || {}) as ApiEnvelope<T>;
  return { data: envelope.data, meta: envelope.meta, message: envelope.message };
}

/** Convenience wrapper for the common "I only want the data" case. */
export async function get<T>(path: string, query?: Query, signal?: AbortSignal) {
  return (await request<T>(path, { query, signal })).data;
}

export async function post<T>(path: string, body?: unknown) {
  return (await request<T>(path, { method: 'POST', body })).data;
}

export async function put<T>(path: string, body?: unknown) {
  return (await request<T>(path, { method: 'PUT', body })).data;
}

export async function del<T>(path: string) {
  return (await request<T>(path, { method: 'DELETE' })).data;
}
