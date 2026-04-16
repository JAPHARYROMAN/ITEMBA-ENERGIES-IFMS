import { apiFetch, clearTokens } from './client';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  status: string;
  permissions: string[];
}

export interface SignupPayload {
  name: string;
  email: string;
  password: string;
}

export async function login(email: string, password: string): Promise<TokenPair> {
  return apiFetch<TokenPair>('auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });
}

export async function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>('auth/me', { method: 'GET' });
}

export async function signup(payload: SignupPayload): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>('auth/signup', {
    method: 'POST',
    body: payload,
    skipAuth: true,
  });
}

export async function checkSignupAvailability(): Promise<boolean> {
  try {
    await apiFetch('auth/signup', { method: 'OPTIONS', skipAuth: true });
    return true;
  } catch (error) {
    const statusCode = (error as { statusCode?: number; apiError?: { statusCode?: number } })?.statusCode
      ?? (error as { apiError?: { statusCode?: number } })?.apiError?.statusCode;
    if (statusCode === 404 || statusCode === 405) return false;
    return true;
  }
}

export async function forgotPassword(email: string): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>('auth/forgot-password', {
    method: 'POST',
    body: { email },
    skipAuth: true,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message?: string }> {
  return apiFetch<{ message?: string }>('auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
    skipAuth: true,
  });
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    await apiFetch('auth/logout', { method: 'POST', body: { refreshToken }, skipAuth: true });
  } finally {
    clearTokens();
  }
}
