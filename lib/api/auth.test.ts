import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the client so we assert the request shapes auth.ts builds, without real fetch.
vi.mock('./client', () => ({
  apiFetch: vi.fn(),
  clearTokens: vi.fn(),
}));

import { apiFetch, clearTokens } from './client';
import {
  login,
  getMe,
  signup,
  checkSignupAvailability,
  forgotPassword,
  resetPassword,
  logout,
} from './auth';

const apiFetchMock = vi.mocked(apiFetch);
const clearTokensMock = vi.mocked(clearTokens);

beforeEach(() => {
  apiFetchMock.mockReset();
  clearTokensMock.mockReset();
  apiFetchMock.mockResolvedValue({} as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('auth request shapes', () => {
  test('login POSTs credentials with skipAuth', async () => {
    apiFetchMock.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 3600 } as never);
    const result = await login('user@example.com', 'pw');

    expect(apiFetchMock).toHaveBeenCalledWith('auth/login', {
      method: 'POST',
      body: { email: 'user@example.com', password: 'pw' },
      skipAuth: true,
    });
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r', expiresIn: 3600 });
  });

  test('getMe GETs auth/me (authenticated)', async () => {
    await getMe();
    expect(apiFetchMock).toHaveBeenCalledWith('auth/me', { method: 'GET' });
  });

  test('signup POSTs payload with skipAuth', async () => {
    const payload = { name: 'Jo', email: 'jo@example.com', password: 'pw' };
    await signup(payload);
    expect(apiFetchMock).toHaveBeenCalledWith('auth/signup', {
      method: 'POST',
      body: payload,
      skipAuth: true,
    });
  });

  test('forgotPassword POSTs email with skipAuth', async () => {
    await forgotPassword('jo@example.com');
    expect(apiFetchMock).toHaveBeenCalledWith('auth/forgot-password', {
      method: 'POST',
      body: { email: 'jo@example.com' },
      skipAuth: true,
    });
  });

  test('resetPassword POSTs token + newPassword with skipAuth', async () => {
    await resetPassword('tok', 'newpw');
    expect(apiFetchMock).toHaveBeenCalledWith('auth/reset-password', {
      method: 'POST',
      body: { token: 'tok', newPassword: 'newpw' },
      skipAuth: true,
    });
  });
});

describe('checkSignupAvailability', () => {
  test('returns true when OPTIONS succeeds', async () => {
    apiFetchMock.mockResolvedValue(undefined as never);
    await expect(checkSignupAvailability()).resolves.toBe(true);
    expect(apiFetchMock).toHaveBeenCalledWith('auth/signup', { method: 'OPTIONS', skipAuth: true });
  });

  test('returns false on 404 (signup disabled)', async () => {
    apiFetchMock.mockRejectedValue(Object.assign(new Error('nope'), { statusCode: 404 }));
    await expect(checkSignupAvailability()).resolves.toBe(false);
  });

  test('returns false on 405 (method not allowed)', async () => {
    apiFetchMock.mockRejectedValue(Object.assign(new Error('nope'), { apiError: { statusCode: 405 } }));
    await expect(checkSignupAvailability()).resolves.toBe(false);
  });

  test('returns true on other errors (assume available)', async () => {
    apiFetchMock.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));
    await expect(checkSignupAvailability()).resolves.toBe(true);
  });
});

describe('logout', () => {
  test('POSTs refreshToken then clears tokens', async () => {
    await logout('refresh-1');
    expect(apiFetchMock).toHaveBeenCalledWith('auth/logout', {
      method: 'POST',
      body: { refreshToken: 'refresh-1' },
      skipAuth: true,
    });
    expect(clearTokensMock).toHaveBeenCalledTimes(1);
  });

  test('clears tokens even when the logout request fails (finally runs, error propagates)', async () => {
    apiFetchMock.mockRejectedValue(new Error('network'));
    await expect(logout('refresh-1')).rejects.toThrow('network');
    expect(clearTokensMock).toHaveBeenCalledTimes(1);
  });
});
