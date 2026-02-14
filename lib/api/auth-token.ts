/**
 * Token storage for API auth. Uses sessionStorage (cleared when tab closes).
 * API client reads from here for Authorization header and refresh flow.
 */
const ACCESS_KEY = 'ifms_access_token';
const REFRESH_KEY = 'ifms_refresh_token';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  sessionStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}
