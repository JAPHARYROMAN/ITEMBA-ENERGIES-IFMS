/**
 * Currency formatting utilities.
 *
 * All monetary display should go through these helpers so that the
 * currency symbol and formatting rules come from the company's
 * configured ISO 4217 code instead of being hardcoded.
 */

/** Common currency metadata for display */
const CURRENCY_META: Record<string, { symbol: string; locale: string }> = {
  USD: { symbol: "$", locale: "en-US" },
  ZAR: { symbol: "R", locale: "en-ZA" },
  EUR: { symbol: "€", locale: "de-DE" },
  GBP: { symbol: "£", locale: "en-GB" },
  KES: { symbol: "KSh", locale: "en-KE" },
  NGN: { symbol: "₦", locale: "en-NG" },
  GHS: { symbol: "GH₵", locale: "en-GH" },
  TZS: { symbol: "TSh", locale: "en-TZ" },
  UGX: { symbol: "USh", locale: "en-UG" },
  BWP: { symbol: "P", locale: "en-BW" },
  MZN: { symbol: "MT", locale: "pt-MZ" },
  ZMW: { symbol: "ZK", locale: "en-ZM" },
  MWK: { symbol: "MK", locale: "en-MW" },
  INR: { symbol: "₹", locale: "en-IN" },
  JPY: { symbol: "¥", locale: "ja-JP" },
  CNY: { symbol: "¥", locale: "zh-CN" },
  AUD: { symbol: "A$", locale: "en-AU" },
  CAD: { symbol: "C$", locale: "en-CA" },
  BRL: { symbol: "R$", locale: "pt-BR" },
  AED: { symbol: "د.إ", locale: "ar-AE" },
};

/** List of supported currencies for the setup UI */
export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_META).sort();

/** Get the symbol for a currency code */
export function getCurrencySymbol(currencyCode: string): string {
  return CURRENCY_META[currencyCode]?.symbol ?? currencyCode;
}

/**
 * Format a number as currency.
 *
 * @param amount     The numeric value to format
 * @param currency   ISO 4217 code (e.g. 'USD', 'ZAR')
 * @param options    Override fraction digits, compact notation, etc.
 *
 * @example
 * formatCurrency(1234.5, 'USD')   // → "$1,234.50"
 * formatCurrency(1234.5, 'ZAR')   // → "R 1 234,50"
 * formatCurrency(1234.5, 'EUR')   // → "1.234,50 €"
 */
export function formatCurrency(
  amount: number | string,
  currency = "TZS",
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    compact?: boolean;
  },
): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(num)) return "—";

  const meta = CURRENCY_META[currency];
  const locale = meta?.locale ?? "en-US";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: options?.minimumFractionDigits ?? 2,
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
      ...(options?.compact && { notation: "compact" }),
    }).format(num);
  } catch {
    // Fallback for unsupported currency codes
    const symbol = meta?.symbol ?? currency;
    return `${symbol}${num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

/**
 * Format a number as currency without decimals (for large values in dashboards).
 */
export function formatCurrencyCompact(
  amount: number | string,
  currency = "USD",
): string {
  return formatCurrency(amount, currency, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Get the column header label with currency symbol.
 * e.g. "Amount (R)" for ZAR, "Amount ($)" for USD
 */
export function currencyHeader(label: string, currency = "USD"): string {
  return `${label} (${getCurrencySymbol(currency)})`;
}
