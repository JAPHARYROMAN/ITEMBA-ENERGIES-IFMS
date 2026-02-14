
/**
 * Core business logic for fuel management calculations.
 * Used for real-time form derivations and validation.
 */

export const computeMeterDelta = (opening: number, closing: number): number => {
  return Math.max(0, closing - opening);
};

export const computeLitersSoldFromMeters = (delta: number): number => {
  // In many IFMS systems, this handles a multiplier (e.g. 10x or 100x pulse factors)
  // Defaulting to 1:1 for this implementation.
  return delta;
};

export const computeExpectedRevenue = (liters: number, pricePerLiter: number): number => {
  return liters * pricePerLiter;
};

export const computeExpectedCash = (
  totalRevenue: number, 
  creditSales: number, 
  cardSales: number
): number => {
  // Expected cash = Total Revenue - (Non-Cash Payments)
  return Math.max(0, totalRevenue - (creditSales + cardSales));
};

export const computeVariance = (expectedCash: number, actualCash: number): number => {
  // Positive = Surplus, Negative = Shortage
  return actualCash - expectedCash;
};
