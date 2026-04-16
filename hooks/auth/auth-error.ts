import type { ApiError } from '../../lib/api/client';

export function getAuthStatusCode(error: unknown): number | undefined {
  const withStatus = error as { statusCode?: number; apiError?: ApiError } | undefined;
  return withStatus?.statusCode ?? withStatus?.apiError?.statusCode;
}

export function normalizeAuthError(error: unknown): string {
  const status = getAuthStatusCode(error);
  if (status === 401 || status === 403) return 'Invalid credentials';
  if (status === 429) return 'Too many attempts, try again later';
  if (status !== undefined && status >= 500) return 'Server error';

  const message =
    (error as { apiError?: ApiError })?.apiError?.message ??
    (error as { message?: string })?.message ??
    'Request failed';

  return message;
}

export function isSignupEndpointMissing(error: unknown): boolean {
  const status = getAuthStatusCode(error);
  return status === 404 || status === 405;
}
