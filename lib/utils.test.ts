import { describe, test, expect } from 'vitest';
import { getErrorMessage } from './utils';

describe('getErrorMessage', () => {
  test('extracts apiError.message from apiFetch error shape', () => {
    const err = Object.assign(new Error('wrapper'), {
      statusCode: 409,
      apiError: { message: 'Duplicate record', statusCode: 409 },
    });
    expect(getErrorMessage(err)).toBe('Duplicate record');
  });

  test('falls back to Error.message when no apiError', () => {
    const err = new Error('Network failure');
    expect(getErrorMessage(err)).toBe('Network failure');
  });

  test('returns fallback for non-objects', () => {
    expect(getErrorMessage(null)).toBe('Something went wrong. Please try again.');
    expect(getErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
    expect(getErrorMessage('string error')).toBe('Something went wrong. Please try again.');
  });

  test('uses custom fallback message', () => {
    expect(getErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
  });

  test('prefers apiError.message over Error.message', () => {
    const err = Object.assign(new Error('generic'), {
      apiError: { message: 'Specific server error' },
    });
    expect(getErrorMessage(err)).toBe('Specific server error');
  });

  test('skips empty apiError.message and uses Error.message', () => {
    const err = Object.assign(new Error('fallback msg'), {
      apiError: { message: '' },
    });
    expect(getErrorMessage(err)).toBe('fallback msg');
  });

  test('returns fallback when both messages empty', () => {
    const err = { apiError: { message: '' }, message: '' };
    expect(getErrorMessage(err)).toBe('Something went wrong. Please try again.');
  });
});
