import { describe, test, expect } from 'vitest';
import {
  computeMeterDelta,
  computeLitersSoldFromMeters,
  computeExpectedRevenue,
  computeExpectedCash,
  computeVariance
} from './form-calcs';

describe('Form Calculation Module', () => {
  test('computeMeterDelta calculates difference correctly', () => {
    expect(computeMeterDelta(100, 150)).toBe(50);
    expect(computeMeterDelta(200, 100)).toBe(0); // Should not go negative
  });

  test('computeExpectedRevenue calculates total based on volume', () => {
    expect(computeExpectedRevenue(10, 1.5)).toBe(15);
  });

  test('computeExpectedCash subtracts non-cash correctly', () => {
    expect(computeExpectedCash(100, 20, 30)).toBe(50);
    expect(computeExpectedCash(50, 60, 0)).toBe(0); // Cannot be negative
  });

  test('computeVariance detects shortages and surpluses', () => {
    expect(computeVariance(100, 80)).toBe(-20);
    expect(computeVariance(100, 110)).toBe(10);
  });

  // ── Additional edge cases ────────────────────────────────────────────

  test('computeMeterDelta clamps equal/negative readings to zero', () => {
    expect(computeMeterDelta(100, 100)).toBe(0);
    expect(computeMeterDelta(0, 0)).toBe(0);
    expect(computeMeterDelta(500, 499.9)).toBe(0); // never negative
  });

  test('computeMeterDelta handles fractional litres', () => {
    expect(computeMeterDelta(100.25, 100.75)).toBeCloseTo(0.5, 5);
  });

  test('computeLitersSoldFromMeters is a 1:1 passthrough', () => {
    expect(computeLitersSoldFromMeters(0)).toBe(0);
    expect(computeLitersSoldFromMeters(42.5)).toBe(42.5);
  });

  test('computeExpectedRevenue handles zero price and zero volume', () => {
    expect(computeExpectedRevenue(0, 1.5)).toBe(0);
    expect(computeExpectedRevenue(10, 0)).toBe(0);
    expect(computeExpectedRevenue(3, 2.345)).toBeCloseTo(7.035, 5);
  });

  test('computeExpectedCash clamps to zero when non-cash exceeds revenue', () => {
    expect(computeExpectedCash(100, 70, 50)).toBe(0); // 100 - 120
    expect(computeExpectedCash(100, 0, 0)).toBe(100); // all cash
  });

  test('computeVariance is zero when expected equals actual', () => {
    expect(computeVariance(250, 250)).toBe(0);
    expect(computeVariance(0, 0)).toBe(0);
  });

  test('end-to-end shift reconciliation chains the helpers correctly', () => {
    const delta = computeMeterDelta(1000, 1500); // 500 L
    const liters = computeLitersSoldFromMeters(delta); // 500 L
    const revenue = computeExpectedRevenue(liters, 2); // 1000
    const expectedCash = computeExpectedCash(revenue, 200, 100); // 700
    const variance = computeVariance(expectedCash, 680); // -20 shortage
    expect(revenue).toBe(1000);
    expect(expectedCash).toBe(700);
    expect(variance).toBe(-20);
  });
});
