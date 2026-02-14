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

export async function logout(refreshToken: string): Promise<void> {
  try {
    await apiFetch('auth/logout', { method: 'POST', body: { refreshToken }, skipAuth: true });
  } finally {
    clearTokens();
  }
}
