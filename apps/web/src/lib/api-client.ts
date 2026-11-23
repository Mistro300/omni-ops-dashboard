import type { AuthResponse } from '@omni-ops/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let inMemoryAccessToken: string | null = null;
let singleFlightRefresh: Promise<AuthResponse | null> | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

/**
 * Single-flight refresh call: prevents concurrent 401s or React StrictMode
 * double-mounts from sending two simultaneous refresh requests that would
 * falsely trigger Refresh Token Reuse Detection.
 */
export async function performSingleFlightRefresh(): Promise<AuthResponse | null> {
  if (!singleFlightRefresh) {
    singleFlightRefresh = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          inMemoryAccessToken = null;
          return null;
        }
        const data = (await res.json()) as AuthResponse;
        inMemoryAccessToken = data.accessToken;
        return data;
      } catch {
        inMemoryAccessToken = null;
        return null;
      } finally {
        singleFlightRefresh = null;
      }
    })();
  }
  return singleFlightRefresh;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuthRefresh?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, skipAuthRefresh = false, headers, ...rest } = options;

  const buildHeaders = (): HeadersInit => {
    const h: Record<string, string> = {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers as Record<string, string> | undefined),
    };
    if (inMemoryAccessToken) {
      h.Authorization = `Bearer ${inMemoryAccessToken}`;
    }
    return h;
  };

  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;

  let res = await fetch(url, {
    ...rest,
    credentials: 'include',
    headers: buildHeaders(),
    body: serializedBody,
  });

  if (res.status === 401 && !skipAuthRefresh && !path.startsWith('/auth/login')) {
    const refreshed = await performSingleFlightRefresh();
    if (refreshed?.accessToken) {
      res = await fetch(url, {
        ...rest,
        credentials: 'include',
        headers: buildHeaders(),
        body: serializedBody,
      });
    }
  }

  if (!res.ok) {
    let payload: { message?: string | string[] } | null = null;
    try {
      payload = (await res.json()) as { message?: string | string[] };
    } catch {
      payload = null;
    }
    const message = Array.isArray(payload?.message)
      ? payload.message.join(' • ')
      : (payload?.message ?? `Request failed with status ${res.status}`);
    throw new ApiError(res.status, message, payload);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export type ExportOrBlobResult<TJson = unknown> =
  | {
      kind: 'blob';
      blob: Blob;
      filename: string;
      contentType: string;
      rowCount?: number;
    }
  | {
      kind: 'json';
      status: number;
      data: TJson;
    };

function parseFilenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1]?.trim() || fallback;
}

/**
 * Authenticated fetch helper supporting hybrid binary/JSON responses
 * (e.g. POST /reports/export returning 200 Blob or 202 JSON, or GET /reports/.../download).
 */
export async function apiFetchExportOrBlob<TJson = unknown>(
  path: string,
  options: ApiRequestOptions & { fallbackFilename?: string } = {},
): Promise<ExportOrBlobResult<TJson>> {
  const { body, skipAuthRefresh = false, headers, fallbackFilename = 'omniops-export', ...rest } =
    options;

  const buildHeaders = (): HeadersInit => {
    const h: Record<string, string> = {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers as Record<string, string> | undefined),
    };
    if (inMemoryAccessToken) {
      h.Authorization = `Bearer ${inMemoryAccessToken}`;
    }
    return h;
  };

  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;

  let res = await fetch(url, {
    ...rest,
    credentials: 'include',
    headers: buildHeaders(),
    body: serializedBody,
  });

  if (res.status === 401 && !skipAuthRefresh) {
    const refreshed = await performSingleFlightRefresh();
    if (refreshed?.accessToken) {
      res = await fetch(url, {
        ...rest,
        credentials: 'include',
        headers: buildHeaders(),
        body: serializedBody,
      });
    }
  }

  if (!res.ok) {
    let payload: { message?: string | string[] } | null = null;
    try {
      payload = (await res.json()) as { message?: string | string[] };
    } catch {
      payload = null;
    }
    const message = Array.isArray(payload?.message)
      ? payload.message.join(' • ')
      : (payload?.message ?? `Request failed with status ${res.status}`);
    throw new ApiError(res.status, message, payload);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as TJson;
    return { kind: 'json', status: res.status, data };
  }

  const blob = await res.blob();
  const filename = parseFilenameFromDisposition(
    res.headers.get('content-disposition'),
    fallbackFilename,
  );
  const rowCountHeader = res.headers.get('x-export-row-count');
  const rowCount = rowCountHeader ? Number.parseInt(rowCountHeader, 10) : undefined;

  return {
    kind: 'blob',
    blob,
    filename,
    contentType,
    rowCount: Number.isFinite(rowCount) ? rowCount : undefined,
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
