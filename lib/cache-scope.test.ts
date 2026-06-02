import { describe, expect, test } from 'vitest';
import { resolveAuthCacheScope } from './cache-scope';

describe('resolveAuthCacheScope', () => {
  test('does not reset before auth hydration is ready', () => {
    expect(resolveAuthCacheScope('u1', false, 'u2')).toEqual({
      shouldReset: false,
      nextUserId: 'u1',
    });
  });

  test('initializes without clearing on the first ready auth state', () => {
    expect(resolveAuthCacheScope(undefined, true, 'u1')).toEqual({
      shouldReset: false,
      nextUserId: 'u1',
    });
  });

  test('resets when the authenticated principal changes', () => {
    expect(resolveAuthCacheScope('u1', true, 'u2')).toEqual({
      shouldReset: true,
      nextUserId: 'u2',
    });
  });

  test('resets when a user logs out', () => {
    expect(resolveAuthCacheScope('u1', true, null)).toEqual({
      shouldReset: true,
      nextUserId: null,
    });
  });
});
