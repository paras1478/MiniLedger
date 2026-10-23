import type { ApiErrorBody } from '@/api/types';
import { API_URL } from '@/constants/config';

const TIMEOUT_MS = 15_000;

/** Any failed API call. `status` is 0 when the server could not be reached. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuthError() {
    return this.status === 401;
  }

  /** Per-field messages from a 400 VALIDATION_ERROR, keyed by field name. */
  get fieldErrors(): Record<string, string> {
    const fields = (this.details?.fields ?? []) as { field: string; message: string }[];
    return Object.fromEntries(fields.map((f) => [f.field, f.message]));
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

/** The single HTTP client for the app. `path` is relative to /api/v1, e.g. "/loans". */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, signal } = options;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    if (signal?.aborted) throw new ApiError(0, 'ABORTED', 'Request cancelled.');
    if (timedOut) throw new ApiError(0, 'TIMEOUT', 'The server took too long to respond. Please try again.');
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `Can't reach the MiniLedger server. Check your connection and that the API is running at ${API_URL}.`
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details
    );
  }
  return data as T;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ABORTED';
}
