import { describe, test, expect } from 'vitest';
import { getErrorMessage, cn } from './utils';

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

  test('ignores non-string apiError.message and falls back to Error.message', () => {
    const err = Object.assign(new Error('real error'), {
      apiError: { message: 42 as unknown as string },
    });
    expect(getErrorMessage(err)).toBe('real error');
  });

  test('returns fallback for an empty object with no usable fields', () => {
    expect(getErrorMessage({})).toBe('Something went wrong. Please try again.');
  });

  test('returns fallback for number and boolean inputs', () => {
    expect(getErrorMessage(0)).toBe('Something went wrong. Please try again.');
    expect(getErrorMessage(true)).toBe('Something went wrong. Please try again.');
  });
});

describe('cn', () => {
  test('joins truthy class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  test('drops falsy / conditional values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });

  test('merges conflicting tailwind classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm text-red-500', 'text-lg')).toBe('text-red-500 text-lg');
  });

  test('handles array inputs', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });
});
