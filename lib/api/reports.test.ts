import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from './client';
import { apiReports } from './reports';

const apiFetchMock = vi.mocked(apiFetch);

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({} as never);
});

describe('apiReports query building', () => {
  test('overview omits the query string when no filters set', async () => {
    await apiReports.overview({});
    expect(apiFetchMock).toHaveBeenCalledWith('reports/overview');
  });

  test('overview appends only truthy filter values', async () => {
    await apiReports.overview({ dateFrom: '2026-01-01', dateTo: '', companyId: 'c1' });
    expect(apiFetchMock).toHaveBeenCalledWith('reports/overview?dateFrom=2026-01-01&companyId=c1');
  });

  test('each report endpoint maps to its path with filters', async () => {
    const filters = { stationId: 's1' };
    await apiReports.dailyOperations(filters);
    await apiReports.stockLoss(filters);
    await apiReports.profitability(filters);
    await apiReports.creditCashflow(filters);
    await apiReports.stationComparison(filters);

    const paths = apiFetchMock.mock.calls.map((c) => c[0]);
    expect(paths).toEqual([
      'reports/daily-operations?stationId=s1',
      'reports/stock-loss?stationId=s1',
      'reports/profitability?stationId=s1',
      'reports/credit-cashflow?stationId=s1',
      'reports/station-comparison?stationId=s1',
    ]);
  });
});
