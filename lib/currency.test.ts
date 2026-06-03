import { describe, test, expect } from 'vitest';
import {
  formatCurrency,
  formatCurrencyCompact,
  currencyHeader,
  getCurrencySymbol,
  SUPPORTED_CURRENCIES,
} from './currency';

describe('getCurrencySymbol', () => {
  test('returns known symbols', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('ZAR')).toBe('R');
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('GBP')).toBe('£');
    expect(getCurrencySymbol('KES')).toBe('KSh');
    expect(getCurrencySymbol('NGN')).toBe('₦');
  });

  test('falls back to the code itself for unknown currencies', () => {
    expect(getCurrencySymbol('XYZ')).toBe('XYZ');
  });
});

describe('SUPPORTED_CURRENCIES', () => {
  test('is sorted and includes core currencies', () => {
    expect(SUPPORTED_CURRENCIES).toContain('USD');
    expect(SUPPORTED_CURRENCIES).toContain('TZS');
    expect(SUPPORTED_CURRENCIES).toContain('ZAR');
    const sorted = [...SUPPORTED_CURRENCIES].sort();
    expect(SUPPORTED_CURRENCIES).toEqual(sorted);
  });
});

describe('formatCurrency', () => {
  test('formats USD with $ symbol, grouping and 2 decimals', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
  });

  test('formats EUR in de-DE style (symbol trailing, comma decimal)', () => {
    expect(formatCurrency(1234.5, 'EUR')).toBe('1.234,50 €');
  });

  test('formats GBP with £ symbol', () => {
    expect(formatCurrency(1234.5, 'GBP')).toBe('£1,234.50');
  });

  test('accepts numeric strings', () => {
    expect(formatCurrency('1234.5', 'USD')).toBe('$1,234.50');
  });

  test('returns em-dash for non-finite input', () => {
    expect(formatCurrency(NaN, 'USD')).toBe('—');
    expect(formatCurrency(Infinity, 'USD')).toBe('—');
    expect(formatCurrency('not-a-number', 'USD')).toBe('—');
  });

  test('respects fraction-digit overrides', () => {
    expect(formatCurrency(1000, 'USD', { minimumFractionDigits: 0, maximumFractionDigits: 0 })).toBe(
      '$1,000',
    );
  });

  test('compact notation abbreviates large values', () => {
    expect(formatCurrency(1_500_000, 'USD', { compact: true })).toBe('$1.50M');
    expect(formatCurrency(2500, 'USD', { compact: true })).toBe('$2.50K');
  });

  test('various currency symbols appear in output', () => {
    expect(formatCurrency(1234.5, 'KES')).toMatch(/Ksh/i);
    expect(formatCurrency(1234.5, 'NGN')).toContain('₦');
    expect(formatCurrency(50000, 'TZS')).toMatch(/TSh/i);
    expect(formatCurrency(1234, 'JPY')).toContain('1,234');
  });

  test('defaults to TZS when no currency is given', () => {
    expect(formatCurrency(1000)).toMatch(/TSh/i);
  });
});

describe('formatCurrencyCompact', () => {
  test('drops decimals', () => {
    expect(formatCurrencyCompact(50000, 'TZS')).toBe('TSh 50,000');
    expect(formatCurrencyCompact(1234.99, 'USD')).toBe('$1,235');
  });
});

describe('currencyHeader', () => {
  test('appends the currency symbol in parentheses', () => {
    expect(currencyHeader('Amount', 'ZAR')).toBe('Amount (R)');
    expect(currencyHeader('Total', 'USD')).toBe('Total ($)');
    expect(currencyHeader('Price', 'EUR')).toBe('Price (€)');
  });

  test('uses the raw code for unknown currencies', () => {
    expect(currencyHeader('Amount', 'XYZ')).toBe('Amount (XYZ)');
  });
});
