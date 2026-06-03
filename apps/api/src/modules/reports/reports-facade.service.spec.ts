import { ReportsFacade } from './reports-facade.service';

describe('ReportsFacade', () => {
  it('delegates all report query and refresh calls to backing services', async () => {
    const reports = {
      getOverview: jest.fn().mockReturnValue('overview'),
      getDailyOperations: jest.fn().mockReturnValue('daily'),
      getStockLoss: jest.fn().mockReturnValue('stock'),
      getProfitability: jest.fn().mockReturnValue('profit'),
      getCreditCashflow: jest.fn().mockReturnValue('cashflow'),
      getStationComparison: jest.fn().mockReturnValue('stations'),
    };
    const refresh = {
      refreshAll: jest.fn().mockResolvedValue({ ok: true, viewsRefreshed: [], durationMs: 1 }),
    };
    const facade = new ReportsFacade(reports as any, refresh as any);
    const query = { dateFrom: '2026-01-01' } as any;
    const ctx = { endpoint: '/reports', correlationId: 'corr', scope: { userId: 'u1', permissions: [] } } as any;

    expect(facade.getOverview(query, ctx)).toBe('overview');
    expect(facade.getDailyOperations(query, ctx)).toBe('daily');
    expect(facade.getStockLoss(query, ctx)).toBe('stock');
    expect(facade.getProfitability(query, ctx)).toBe('profit');
    expect(facade.getCreditCashflow(query, ctx)).toBe('cashflow');
    expect(facade.getStationComparison(query, ctx)).toBe('stations');
    await expect(facade.refreshMaterializedViews({ dateFrom: '2026-01-01' })).resolves.toMatchObject({
      ok: true,
    });

    for (const method of Object.values(reports)) {
      expect(method).toHaveBeenCalledWith(query, ctx);
    }
    expect(refresh.refreshAll).toHaveBeenCalledWith({ dateFrom: '2026-01-01' });
  });
});
