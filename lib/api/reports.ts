import { apiFetch } from './client';

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  companyId?: string;
  stationId?: string;
  branchId?: string;
  productId?: string;
}

function withQuery(path: string, filters: ReportFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

export const apiReports = {
  overview: (filters: ReportFilters) => apiFetch(withQuery('reports/overview', filters)),
  dailyOperations: (filters: ReportFilters) =>
    apiFetch(withQuery('reports/daily-operations', filters)),
  stockLoss: (filters: ReportFilters) => apiFetch(withQuery('reports/stock-loss', filters)),
  profitability: (filters: ReportFilters) => apiFetch(withQuery('reports/profitability', filters)),
  creditCashflow: (filters: ReportFilters) =>
    apiFetch(withQuery('reports/credit-cashflow', filters)),
  stationComparison: (filters: ReportFilters) =>
    apiFetch(withQuery('reports/station-comparison', filters)),
};
