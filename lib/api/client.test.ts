import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, apiClient, normalizeError } from './client';
import * as tokenStore from './auth-token';

// In test/demo mode (no VITE_API_URL) the client base URL resolves to this.
const BASE = 'http://localhost:3001';
const api = (path: string) => `${BASE}/api${path}`;

type FetchMock = ReturnType<typeof vi.fn>;

/** Build a Response-like object good enough for apiFetch (status, ok, json). */
function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: '',
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('apiFetch - URL building', () => {
  test('prefixes BASE + /api and normalizes leading slash', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await apiFetch('auth/login');
    expect(fetchMock.mock.calls[0][0]).toBe(api('/auth/login'));
  });

  test('does not double the leading slash when path already starts with /', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch('/companies');
    expect(fetchMock.mock.calls[0][0]).toBe(api('/companies'));
  });

  test('preserves query strings in the path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch('exports?limit=10');
    expect(fetchMock.mock.calls[0][0]).toBe(api('/exports?limit=10'));
  });
});

describe('apiFetch - auth header injection', () => {
  test('injects Bearer Authorization header when an access token exists', async () => {
    vi.spyOn(tokenStore, 'getAccessToken').mockReturnValue('tok-123');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch('auth/me');

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok-123');
  });

  test('omits Authorization header when no token is present', async () => {
    vi.spyOn(tokenStore, 'getAccessToken').mockReturnValue(null);
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch('auth/me');

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
  });

  test('skipAuth bypasses token lookup and omits Authorization', async () => {
    const getAccess = vi.spyOn(tokenStore, 'getAccessToken').mockReturnValue('tok-123');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch('auth/login', { skipAuth: true });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
    expect(getAccess).not.toHaveBeenCalled();
  });

  test('sends credentials: include on every request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch('companies');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });
});

describe('apiFetch - body / JSON handling', () => {
  test('serializes a JSON body and sets Content-Type', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: '1' }));

    await apiFetch('companies', { method: 'POST', body: { name: 'Acme' } });

    const init = fetchMock.mock.calls[0][1];
    const headers = init.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'Acme' }));
    expect(init.method).toBe('POST');
  });

  test('omits body and Content-Type when no body given', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch('companies', { method: 'GET' });

    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBeUndefined();
    expect((init.headers as Headers).get('Content-Type')).toBeNull();
  });

  test('returns the parsed JSON response body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'x', name: 'Acme' }));
    const result = await apiFetch<{ id: string; name: string }>('companies/x');
    expect(result).toEqual({ id: 'x', name: 'Acme' });
  });

  test('falls back to {} when the response body is not valid JSON', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      statusText: '',
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    const result = await apiFetch('companies');
    expect(result).toEqual({});
  });
});

describe('apiFetch - ApiError normalization', () => {
  test('throws an Error with statusCode + apiError attached on non-2xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { message: 'Duplicate record' }));

    await expect(apiFetch('companies', { method: 'POST', body: {} })).rejects.toMatchObject({
      message: 'Duplicate record',
      statusCode: 409,
      apiError: { message: 'Duplicate record', statusCode: 409, details: { message: 'Duplicate record' } },
    });
  });

  test('joins an array message into a comma-separated string', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { message: ['email invalid', 'name required'] }));

    await expect(apiFetch('companies', { method: 'POST', body: {} })).rejects.toMatchObject({
      message: 'email invalid, name required',
      statusCode: 400,
    });
  });

  test('falls back to statusText when no message field present', async () => {
    fetchMock.mockResolvedValue({
      status: 500,
      ok: false,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as unknown as Response);

    await expect(apiFetch('companies')).rejects.toMatchObject({
      message: 'Internal Server Error',
      statusCode: 500,
    });
  });

  test('throws a reachability error (statusCode 0) when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiFetch('companies')).rejects.toMatchObject({
      statusCode: 0,
      apiError: { statusCode: 0 },
    });
  });
});

describe('normalizeError', () => {
  test('extracts nested message.message object shape', async () => {
    const res = { status: 422, statusText: '' } as Response;
    const err = await normalizeError(res, { message: { message: 'nested detail' } });
    expect(err).toEqual({
      message: 'nested detail',
      statusCode: 422,
      details: { message: { message: 'nested detail' } },
    });
  });
});

describe('apiFetch - 401 refresh-and-retry flow', () => {
  test('on 401 refreshes the token, rotates it, and retries once', async () => {
    sessionStorage.setItem('ifms_access_token', 'old-access');
    sessionStorage.setItem('ifms_refresh_token', 'refresh-1');

    fetchMock
      // first protected call -> 401
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      // /auth/refresh -> new token pair
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'new-access', refreshToken: 'refresh-2' }))
      // retried protected call -> 200
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await apiFetch('auth/me');
    expect(result).toEqual({ ok: true });

    // 3 calls: original, refresh, retry
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(api('/auth/refresh'));

    // token store rotated
    expect(sessionStorage.getItem('ifms_access_token')).toBe('new-access');
    expect(sessionStorage.getItem('ifms_refresh_token')).toBe('refresh-2');

    // retried request carries the new bearer token
    const retryHeaders = fetchMock.mock.calls[2][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-access');
  });

  test('does not attempt refresh when there is no refresh token', async () => {
    sessionStorage.setItem('ifms_access_token', 'old-access');
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Unauthorized' }));

    await expect(apiFetch('auth/me')).rejects.toMatchObject({ statusCode: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('does not refresh on 401 when skipAuth is set', async () => {
    sessionStorage.setItem('ifms_refresh_token', 'refresh-1');
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Bad creds' }));

    await expect(apiFetch('auth/login', { skipAuth: true })).rejects.toMatchObject({ statusCode: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('failed refresh clears tokens, dispatches logout event, and throws original 401', async () => {
    sessionStorage.setItem('ifms_access_token', 'old-access');
    sessionStorage.setItem('ifms_refresh_token', 'refresh-1');

    const logoutSpy = vi.fn();
    window.addEventListener('ifms:auth-logout', logoutSpy);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      // refresh call fails
      .mockResolvedValueOnce(jsonResponse(401, { message: 'refresh expired' }));

    await expect(apiFetch('auth/me')).rejects.toMatchObject({ statusCode: 401 });

    expect(sessionStorage.getItem('ifms_access_token')).toBeNull();
    expect(sessionStorage.getItem('ifms_refresh_token')).toBeNull();
    expect(logoutSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener('ifms:auth-logout', logoutSpy);
  });

  test('concurrent 401s share a single refresh call (refresh locking)', async () => {
    sessionStorage.setItem('ifms_access_token', 'old-access');
    sessionStorage.setItem('ifms_refresh_token', 'refresh-1');

    let refreshResolve!: (v: Response) => void;
    const refreshPending = new Promise<Response>((r) => {
      refreshResolve = r;
    });

    fetchMock.mockImplementation((url: string) => {
      if (url === api('/auth/refresh')) return refreshPending;
      // both protected calls hit 401 first, then 200 after retry
      const call = fetchMock.mock.calls.filter((c) => c[0] !== api('/auth/refresh')).length;
      // calls 1 & 2 are the initial 401s; later ones are retries
      return Promise.resolve(call <= 2 ? jsonResponse(401, { message: 'Unauthorized' }) : jsonResponse(200, { ok: true }));
    });

    const p1 = apiFetch('a');
    const p2 = apiFetch('b');

    // let both initial requests resolve to 401 and queue on the refresh promise
    await Promise.resolve();
    await Promise.resolve();

    refreshResolve(jsonResponse(200, { accessToken: 'new-access', refreshToken: 'refresh-2' }));

    await Promise.all([p1, p2]);

    const refreshCalls = fetchMock.mock.calls.filter((c) => c[0] === api('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });
});

describe('apiFetch - 5xx exponential backoff', () => {
  test('retries 503 up to 2 times with increasing backoff, then succeeds', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const promise = apiFetch('reports/overview');
    // first retry waits 1000ms, second waits 2000ms
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('gives up after 2 retries and throws when 5xx persists', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse(502, { message: 'Bad gateway' }));

    const promise = apiFetch('reports/overview');
    const assertion = expect(promise).rejects.toMatchObject({ statusCode: 502 });
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;

    // 1 initial + 2 retries
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('stops retrying as soon as a non-5xx status is returned', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(504, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const promise = apiFetch('reports/overview');
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('apiClient convenience methods', () => {
  test('get/post/put/patch/delete map to the right method + path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiClient.get('companies');
    await apiClient.post('companies', { a: 1 });
    await apiClient.put('companies/1', { a: 2 });
    await apiClient.patch('companies/1', { a: 3 });
    await apiClient.delete('companies/1');

    const calls = fetchMock.mock.calls;
    expect(calls[0][1].method).toBeUndefined(); // get: no explicit method
    expect(calls[0][0]).toBe(api('/companies'));
    expect(calls[1][1].method).toBe('POST');
    expect(calls[1][1].body).toBe(JSON.stringify({ a: 1 }));
    expect(calls[2][1].method).toBe('PUT');
    expect(calls[3][1].method).toBe('PATCH');
    expect(calls[4][1].method).toBe('DELETE');
    expect(calls[4][0]).toBe(api('/companies/1'));
  });
});
