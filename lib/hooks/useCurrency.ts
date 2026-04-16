import { useQuery } from "@tanstack/react-query";
import { apiSetup } from "../api/setup";
import { useActiveStation } from "./useActiveStation";
import {
  formatCurrency,
  formatCurrencyCompact,
  getCurrencySymbol,
  currencyHeader,
} from "../currency";

/**
 * Hook that resolves the active company's currency code and provides
 * formatting helpers bound to that currency.
 *
 * Usage:
 * ```tsx
 * const { currency, fmt, fmtCompact, symbol, header } = useCurrency();
 * <span>{fmt(1234.50)}</span>       // → "$1,234.50" or "R 1 234,50"
 * <span>{fmtCompact(50000)}</span>  // → "$50,000" or "R 50 000"
 * <th>{header('Amount')}</th>       // → "Amount ($)" or "Amount (R)"
 * ```
 */
export function useCurrency() {
  const { station } = useActiveStation();

  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: apiSetup.companies.list,
    staleTime: 10 * 60 * 1000,
  });

  // Resolve company from active station, or fall back to first company
  const company = station
    ? companies.find(
        (c) => c.id === (station as { companyId?: string }).companyId,
      )
    : companies[0];

  const currency = (company as { currency?: string })?.currency ?? "TZS";

  return {
    /** ISO 4217 currency code (e.g. 'USD', 'ZAR') */
    currency,
    /** Currency symbol (e.g. '$', 'R') */
    symbol: getCurrencySymbol(currency),
    /** Format a number as full currency: fmt(1234.5) → "$1,234.50" */
    fmt: (amount: number | string) => formatCurrency(amount, currency),
    /** Format without decimals: fmtCompact(50000) → "$50,000" */
    fmtCompact: (amount: number | string) =>
      formatCurrencyCompact(amount, currency),
    /** Column header with symbol: header('Amount') → "Amount ($)" */
    header: (label: string) => currencyHeader(label, currency),
  };
}
