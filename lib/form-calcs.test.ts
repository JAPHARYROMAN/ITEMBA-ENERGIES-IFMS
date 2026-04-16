import { describe, test, expect } from 'vitest';
import { 
  computeMeterDelta, 
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
});
