import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth-token';
import { frontendEnv } from '../env.client';

const BASE = frontendEnv.apiBaseUrl;
const API_PREFIX = '/api';

export interface ApiError {
  message: string;
  statusCode: number;
  details?: unknown;
}

function buildUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${API_PREFIX}${p}`;
}

async function doRefresh(): Promise<{ accessToken: string; refreshToken: string }> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');
  const url = buildUrl('auth/refresh');
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      credentials: 'include',
    });
  } catch {
    throw Object.assign(new Error(`Unable to reach API at ${BASE}. Ensure backend is running.`), { statusCode: 0 });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.message ?? 'Refresh failed') as Error, { statusCode: res.status });
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

export async function normalizeError(res: Response, body: unknown): Promise<ApiError> {
  const statusCode = res.status;
  const details = body;
  const msg =
    (body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string')
      ? (body as { message: string }).message
      : (body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'object' && (body as { message: { message?: string } }).message?.message)
        ? String((body as { message: { message: string } }).message.message)
      : Array.isArray((body as { message?: unknown })?.message)
        ? (body as { message: string[] }).message.join(', ')
        : res.statusText || 'Request failed';
  return { message: msg, statusCode, details };
}

export type RequestInitWithBody = Omit<RequestInit, 'body'> & { body?: unknown };

let refreshPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null;

/**
 * Fetch with base URL, Authorization header, and 401 → refresh once then retry.
 * Use for all authenticated API calls. For public routes (login), pass skipAuth: true.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInitWithBody & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, body, ...rest } = init;
  const url = buildUrl(path);
  const headers = new Headers(rest.headers as HeadersInit);
  if (body !== undefined && body !== null) {
    headers.set('Content-Type', 'application/json');
  }
  if (!skipAuth) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const doRequest = async (): Promise<Response> => {
    try {
      return await fetch(url, {
        ...rest,
        headers,
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        credentials: 'include', // send cookies on same-origin or when API allows CORS credentials
      });
    } catch (e) {
      const msg = `Cannot reach API at ${url}. Start the backend (e.g. \`npm run start:dev\` in apps/api) and ensure FRONTEND_ORIGIN includes this site (e.g. http://localhost:5173).`;
      throw Object.assign(new Error(msg), {
        statusCode: 0,
        apiError: { message: msg, statusCode: 0 },
      });
    }
  };

  let res = await doRequest();

  if (res.status === 401 && !skipAuth && getRefreshToken()) {
    try {
      if (!refreshPromise) refreshPromise = doRefresh();
      await refreshPromise;
      refreshPromise = null;
      const newToken = getAccessToken();
      if (newToken) headers.set('Authorization', `Bearer ${newToken}`);
      res = await doRequest();
    } catch {
      refreshPromise = null;
      clearTokens();
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ifms:auth-logout'));
      const body = await res.json().catch(() => ({}));
      const err = await normalizeError(res, body);
      throw Object.assign(new Error(err.message), { statusCode: err.statusCode, apiError: err });
    }
  }

  const responseBody = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = await normalizeError(res, responseBody);
    throw Object.assign(new Error(err.message), { statusCode: err.statusCode, apiError: err });
  }
  return responseBody as T;
}

export { clearTokens, getAccessToken, getRefreshToken, setTokens };
