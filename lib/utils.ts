import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extract a user-friendly error message from an API error or unknown thrown value.
 * Handles the `apiFetch` error shape (`{ apiError: { message } }`) and plain Error objects.
 */
export function getErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err && typeof err === 'object') {
    const e = err as { apiError?: { message?: string }; message?: string };
    if (typeof e.apiError?.message === 'string' && e.apiError.message.length > 0)
      return e.apiError.message;
    if (typeof e.message === 'string' && e.message.length > 0) return e.message;
  }
  return fallback;
}
