import { describe, test, expect } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  DASHBOARD_CHART_MONTHS,
  MAX_DISCOUNT,
  QUICK_PAYMENT_PRESETS,
  CLOSE_SHIFT_DRAFT_KEY,
  OPEN_SHIFT_DRAFT_KEY,
  EXPORT_POLL_INTERVAL_MS,
  EXPORT_INITIAL_DELAY_MS,
  DATE_PRESETS,
} from './constants';

describe('app constants', () => {
  test('default page size is one of the offered options', () => {
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE);
  });

  test('page size options are ascending and positive', () => {
    const arr = [...PAGE_SIZE_OPTIONS];
    expect(arr).toEqual([...arr].sort((a, b) => a - b));
    expect(arr.every((n) => n > 0)).toBe(true);
  });

  test('dashboard chart months is a sensible positive integer', () => {
    expect(Number.isInteger(DASHBOARD_CHART_MONTHS)).toBe(true);
    expect(DASHBOARD_CHART_MONTHS).toBe(7);
  });

  test('max discount is a percentage within 0-100', () => {
    expect(MAX_DISCOUNT).toBe(50);
    expect(MAX_DISCOUNT).toBeGreaterThan(0);
    expect(MAX_DISCOUNT).toBeLessThanOrEqual(100);
  });

  test('quick payment presets are positive', () => {
    expect(QUICK_PAYMENT_PRESETS.every((n) => n > 0)).toBe(true);
  });

  test('shift draft localStorage keys are distinct and namespaced', () => {
    expect(CLOSE_SHIFT_DRAFT_KEY).not.toBe(OPEN_SHIFT_DRAFT_KEY);
    expect(CLOSE_SHIFT_DRAFT_KEY).toMatch(/^ifms-/);
    expect(OPEN_SHIFT_DRAFT_KEY).toMatch(/^ifms-/);
  });

  test('export timings are positive millisecond values', () => {
    expect(EXPORT_POLL_INTERVAL_MS).toBeGreaterThan(0);
    expect(EXPORT_INITIAL_DELAY_MS).toBeGreaterThan(0);
  });

  test('date presets are ascending day counts', () => {
    const arr = [...DATE_PRESETS];
    expect(arr).toEqual([...arr].sort((a, b) => a - b));
    expect(arr).toContain(7);
    expect(arr).toContain(30);
  });
});
