import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  migrateStorageIfNeeded,
} from './storage';

describe('storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('getStorageItem', () => {
    test('returns null for a missing key', () => {
      expect(getStorageItem('nope')).toBeNull();
    });

    test('parses and returns a stored JSON value', () => {
      localStorage.setItem('k', JSON.stringify({ a: 1, b: ['x'] }));
      expect(getStorageItem<{ a: number; b: string[] }>('k')).toEqual({ a: 1, b: ['x'] });
    });

    test('returns null when the stored value is invalid JSON', () => {
      localStorage.setItem('bad', '{not json');
      expect(getStorageItem('bad')).toBeNull();
    });

    test('returns null (not an error) when localStorage.getItem throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      expect(getStorageItem('k')).toBeNull();
    });

    test('round-trips a value set via setStorageItem', () => {
      setStorageItem('rt', 42);
      expect(getStorageItem<number>('rt')).toBe(42);
    });
  });

  describe('setStorageItem', () => {
    test('serializes the value and returns true on success', () => {
      expect(setStorageItem('s', { ok: true })).toBe(true);
      expect(localStorage.getItem('s')).toBe(JSON.stringify({ ok: true }));
    });

    test('returns false when setItem throws (e.g. quota exceeded)', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      expect(setStorageItem('s', 'v')).toBe(false);
    });
  });

  describe('removeStorageItem', () => {
    test('removes an existing key', () => {
      localStorage.setItem('r', '1');
      removeStorageItem('r');
      expect(localStorage.getItem('r')).toBeNull();
    });

    test('swallows errors thrown by removeItem', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      expect(() => removeStorageItem('r')).not.toThrow();
    });
  });

  describe('migrateStorageIfNeeded', () => {
    const VERSION_KEY = 'ifms-storage-version';

    afterEach(() => {
      localStorage.clear();
    });

    test('clears ifms-prefixed keys and stamps the version on a fresh/mismatched store', () => {
      localStorage.setItem('ifms-stale-a', '1');
      localStorage.setItem('ifms-stale-b', '2');
      localStorage.setItem('other-key', 'keep');

      migrateStorageIfNeeded();

      expect(localStorage.getItem('ifms-stale-a')).toBeNull();
      expect(localStorage.getItem('ifms-stale-b')).toBeNull();
      // Non-ifms keys are preserved.
      expect(localStorage.getItem('other-key')).toBe('keep');
      // Version is stamped to current.
      expect(localStorage.getItem(VERSION_KEY)).toBe('1');
    });

    test('is a no-op when the stored version already matches', () => {
      localStorage.setItem(VERSION_KEY, '1');
      localStorage.setItem('ifms-keep', 'present');

      migrateStorageIfNeeded();

      // Existing ifms data survives because no migration runs.
      expect(localStorage.getItem('ifms-keep')).toBe('present');
      expect(localStorage.getItem(VERSION_KEY)).toBe('1');
    });

    test('bails silently if localStorage is inaccessible', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      expect(() => migrateStorageIfNeeded()).not.toThrow();
    });
  });
});
