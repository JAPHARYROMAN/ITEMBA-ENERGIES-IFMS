import { ForbiddenException } from '@nestjs/common';
import { ReportsService, type ReportScopeContext, type ReportPerfContext } from './reports.service';
import { createDrizzleMock, type DrizzleMock } from '../setup/__testutils__/drizzle-mock';

describe('ReportsService tenant scope resolution', () => {
  const companyA = '11111111-1111-1111-1111-111111111111';
  const companyB = '22222222-2222-2222-2222-222222222222';
  const branchA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const service = new ReportsService(
    {} as any,
    { get: jest.fn((_key: string, fallback: unknown) => fallback) } as any,
    {} as any,
    { log: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
    {} as any,
    { recordReportCacheHit: jest.fn(), recordReportCacheMiss: jest.fn() } as any,
  );

  const resolveScopedFilters = (filters: Record<string, unknown>, scope: ReportScopeContext) =>
    (service as any).resolveScopedFilters(filters, scope);

  it('uses the single JWT company and branch when the query omits tenant IDs', () => {
    const scoped = resolveScopedFilters(
      { dateFrom: '2026-01-01', dateTo: '2026-01-31' },
      {
        userId: 'user-1',
        permissions: [`company:${companyA}`, `branch:${branchA}`],
      },
    );

    expect(scoped).toMatchObject({
      companyId: companyA,
      branchId: branchA,
    });
  });

  it('uses JWT scope arrays when the query omits tenant IDs for a multi-scope user', () => {
    const scoped = resolveScopedFilters(
      {},
      {
        userId: 'user-1',
        permissions: [
          `company:${companyA}`,
          `company:${companyB}`,
          `branch:${branchA}`,
          `branch:${branchB}`,
        ],
      },
    );

    expect(scoped.companyIds).toEqual([companyA, companyB]);
    expect(scoped.branchIds).toEqual([branchA, branchB]);
    expect(scoped.companyId).toBeUndefined();
    expect(scoped.branchId).toBeUndefined();
  });

  it('rejects company and branch IDs outside the JWT scope', () => {
    const scope = {
      userId: 'user-1',
      permissions: [`company:${companyA}`, `branch:${branchA}`],
    };

    expect(() => resolveScopedFilters({ companyId: companyB }, scope)).toThrow(ForbiddenException);
    expect(() => resolveScopedFilters({ branchId: branchB }, scope)).toThrow(ForbiddenException);
  });

  it('rejects report execution when the JWT has no tenant scope', () => {
    expect(() =>
      resolveScopedFilters({}, { userId: 'user-1', permissions: ['reports:read'] }),
    ).toThrow(ForbiddenException);
  });
});

describe('ReportsService cache key building', () => {
  const service = new ReportsService(
    {} as any,
    { get: jest.fn((_k: string, fallback: unknown) => fallback) } as any,
    {} as any,
    { log: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
    {} as any,
    { recordReportCacheHit: jest.fn(), recordReportCacheMiss: jest.fn() } as any,
  );

  const buildCacheKey = (scope: string, filters: any, ctx?: ReportScopeContext) =>
    (service as any).buildCacheKey(scope, filters, ctx);

  it('produces identical keys regardless of array ordering (stable stringify)', () => {
    const a = buildCacheKey('overview', { branchIds: ['b2', 'b1'], companyIds: ['c2', 'c1'] });
    const b = buildCacheKey('overview', { branchIds: ['b1', 'b2'], companyIds: ['c1', 'c2'] });
    expect(a).toBe(b);
  });

  it('differs by endpoint scope', () => {
    expect(buildCacheKey('overview', {})).not.toBe(buildCacheKey('profitability', {}));
  });

  it('differs by user scope and sorts permissions', () => {
    const k1 = buildCacheKey('overview', {}, {
      userId: 'u1',
      permissions: ['p2', 'p1'],
    } as ReportScopeContext);
    const k2 = buildCacheKey('overview', {}, {
      userId: 'u1',
      permissions: ['p1', 'p2'],
    } as ReportScopeContext);
    const k3 = buildCacheKey('overview', {}, {
      userId: 'u2',
      permissions: ['p1', 'p2'],
    } as ReportScopeContext);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it('treats anonymous scope as a deterministic default', () => {
    const normalizeScope = (service as any).normalizeScope.bind(service);
    expect(normalizeScope(undefined)).toMatchObject({ userId: 'anonymous', permissions: [] });
  });

  it('returns per-report TTL or default', () => {
    const getTtl = (service as any).getCacheTtlMs.bind(service);
    // station-comparison default is 120s = 120000ms; default falls back to 60000.
    expect(getTtl('station-comparison')).toBe(120_000);
    expect(getTtl('unknown-report')).toBe(60_000);
  });
});

describe('ReportsService report execution', () => {
  const companyA = '11111111-1111-1111-1111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  let drizzle: DrizzleMock;
  let logger: { log: jest.Mock; warn: jest.Mock; debug: jest.Mock };
  let opsMetrics: { recordReportCacheHit: jest.Mock; recordReportCacheMiss: jest.Mock };
  let reportsMv: {
    getSalesTrendFromViews: jest.Mock;
    getPaymentMixFromViews: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let service: ReportsService;

  const scope: ReportScopeContext = {
    userId: 'user-1',
    permissions: [`company:${companyA}`, `branch:${branchA}`],
    companyId: companyA,
    branchId: branchA,
    companyIds: [companyA],
    branchIds: [branchA],
  };

  const ctx: ReportPerfContext = {
    endpoint: '/reports/test',
    correlationId: 'corr-1',
    scope,
  };

  const makeService = (configOverrides: Record<string, unknown> = {}) => {
    const config = {
      get: jest.fn((key: string, fallback: unknown) =>
        key in configOverrides ? configOverrides[key] : fallback,
      ),
    };
    return new ReportsService(
      drizzle.db as any,
      config as any,
      audit as any,
      logger as any,
      reportsMv as any,
      opsMetrics as any,
    );
  };

  beforeEach(() => {
    drizzle = createDrizzleMock();
    logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    opsMetrics = { recordReportCacheHit: jest.fn(), recordReportCacheMiss: jest.fn() };
    reportsMv = {
      getSalesTrendFromViews: jest.fn().mockResolvedValue(null),
      getPaymentMixFromViews: jest.fn().mockResolvedValue(null),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = makeService();
  });

  describe('recordAction', () => {
    it('writes an audit entry and returns an action id', async () => {
      const res = await service.recordAction(
        { action: 'flag', targetId: 'shift-1', payload: { note: 'x' } } as any,
        { userId: 'user-1', ip: '127.0.0.1', userAgent: 'jest' },
      );
      expect(res.ok).toBe(true);
      expect(res.action).toBe('flag');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'reports_action', entityId: 'shift-1', action: 'flag' }),
      );
    });

    it('falls back to a generated actionId when no targetId given', async () => {
      const res = await service.recordAction({ action: 'note' } as any, {});
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: res.actionId, after: null }),
      );
    });
  });

  describe('getOverview', () => {
    it('aggregates KPIs and falls back to raw trend/mix when views return null', async () => {
      // KPI rows: sales, liters/cogs, variance, ar, ap.
      drizzle.queue([{ revenue: '1000' }]);
      drizzle.queue([{ liters: '500', cogs: '375' }]);
      drizzle.queue([{ avgAbs: '2.5' }]);
      drizzle.queue([{ overdue: '300' }]);
      drizzle.queue([{ overdue: '120' }]);
      // salesTrend raw
      drizzle.queue([{ date: '2026-01-01', amount: '1000' }]);
      // paymentMix raw
      drizzle.queue([{ name: 'Cash', value: '700' }]);
      // varianceByStation (variance is numeric here; service calls .toFixed)
      drizzle.queue([{ station: 'Alpha', variance: 600 }]);
      // topDebtors base rows (empty -> skip payment/invoice queries)
      drizzle.queue([]);

      const result = await service.getOverview({}, ctx);

      expect(result.kpis.totalSales.value).toBe(1000);
      expect(result.kpis.litersSold.value).toBe(500);
      expect(result.kpis.grossMargin.value).toBe(625);
      expect(result.kpis.receivables.value).toBe(300);
      expect(result.kpis.payables.value).toBe(120);
      expect(result.salesTrend).toEqual([{ date: '2026-01-01', amount: 1000 }]);
      expect(result.paymentMix).toEqual([{ name: 'Cash', value: 700 }]);
      // variance > 500 => Critical
      expect(result.varianceByStation[0].status).toBe('Critical');
      expect(reportsMv.getSalesTrendFromViews).toHaveBeenCalled();
      expect(opsMetrics.recordReportCacheMiss).toHaveBeenCalled();
    });

    it('prefers materialized view results when available', async () => {
      reportsMv.getSalesTrendFromViews.mockResolvedValue([{ date: '2026-01-01', amount: 42 }]);
      reportsMv.getPaymentMixFromViews.mockResolvedValue([{ name: 'Card', value: 9 }]);
      // KPI rows.
      drizzle.queue([{ revenue: '0' }]);
      drizzle.queue([{ liters: '0', cogs: '0' }]);
      drizzle.queue([{ avgAbs: '0' }]);
      drizzle.queue([{ overdue: '0' }]);
      drizzle.queue([{ overdue: '0' }]);
      // varianceByStation
      drizzle.queue([]);
      // topDebtors base rows
      drizzle.queue([]);

      const result = await service.getOverview({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }, ctx);
      expect(result.salesTrend).toEqual([{ date: '2026-01-01', amount: 42 }]);
      expect(result.paymentMix).toEqual([{ name: 'Card', value: 9 }]);
    });

    it('serves a cache hit on the second identical call without re-querying', async () => {
      drizzle.queue([{ revenue: '10' }]);
      drizzle.queue([{ liters: '5', cogs: '3' }]);
      drizzle.queue([{ avgAbs: '0' }]);
      drizzle.queue([{ overdue: '0' }]);
      drizzle.queue([{ overdue: '0' }]);
      drizzle.queue([]);
      drizzle.queue([]);

      const first = await service.getOverview({}, ctx);
      const selectCallsAfterFirst = (drizzle.db.select as jest.Mock).mock.calls.length;
      const second = await service.getOverview({}, ctx);

      expect(second).toEqual(first);
      expect((drizzle.db.select as jest.Mock).mock.calls.length).toBe(selectCallsAfterFirst);
      expect(opsMetrics.recordReportCacheHit).toHaveBeenCalledTimes(1);
    });

    it('does not cache when caching is disabled', async () => {
      service = makeService({ REPORTS_CACHE_ENABLED: false });
      const queueOverview = () => {
        drizzle.queue([{ revenue: '1' }]);
        drizzle.queue([{ liters: '1', cogs: '0' }]);
        drizzle.queue([{ avgAbs: '0' }]);
        drizzle.queue([{ overdue: '0' }]);
        drizzle.queue([{ overdue: '0' }]);
        drizzle.queue([]);
        drizzle.queue([]);
      };
      queueOverview();
      await service.getOverview({}, ctx);
      queueOverview();
      await service.getOverview({}, ctx);
      expect(opsMetrics.recordReportCacheHit).not.toHaveBeenCalled();
    });
  });

  describe('getDailyOperations', () => {
    it('computes shift stats, efficiency, and compliance', async () => {
      // shift performance rows
      drizzle.queue([
        {
          id: 's1',
          startTime: new Date(),
          endTime: null,
          status: 'open',
          cashierName: null,
          expectedSales: '100',
          actualSales: '90',
          variance: '3',
        },
        {
          id: 's2',
          startTime: new Date(),
          endTime: new Date(),
          status: 'closed',
          cashierName: 'Bob',
          expectedSales: '200',
          actualSales: '200',
          variance: '10',
        },
      ]);
      // pump performance rows
      drizzle.queue([
        { pumpCode: 'P1', nozzleCode: 'N1', product: 'Diesel', liters: '500', avgPrice: '1.5' },
      ]);
      // payment mix raw
      drizzle.queue([{ name: 'Cash', value: '50' }]);

      const result = await service.getDailyOperations({}, ctx);
      expect(result.shifts).toHaveLength(2);
      // s1 unassigned cashier defaults
      expect(result.shifts[0].cashierName).toBe('Unassigned');
      // efficiency 90/100 = 90
      expect(result.shifts[0].efficiency).toBe(90);
      // avg variance (3 + 10)/2 = 6.5
      expect(result.stats.avgShiftVariance).toBe(6.5);
      // one shift within +/-5 (variance 3) of 2 => 50%
      expect(result.stats.auditCompliancePct).toBe(50);
      expect(result.stats.pendingClosures).toBe(1);
      expect(result.pumps[0].product).toBe('Diesel');
    });

    it('handles empty shift data without dividing by zero', async () => {
      drizzle.queue([]); // shifts
      drizzle.queue([]); // pumps
      drizzle.queue([]); // payment mix raw
      const result = await service.getDailyOperations({}, ctx);
      expect(result.stats.avgShiftVariance).toBe(0);
      expect(result.stats.auditCompliancePct).toBe(0);
      expect(result.stats.pendingClosures).toBe(0);
    });
  });

  describe('getStockLoss', () => {
    it('computes net loss and shrinkage summary', async () => {
      // tank loss rows
      drizzle.queue([
        { tankId: 't1', station: 'Alpha', product: 'Diesel', currentLevel: '900', variance: '-100' },
      ]);
      // shrinkage trend
      drizzle.queue([{ date: '2026-01-01', rate: '1.2' }]);
      // delivery reconciliation
      drizzle.queue([{ id: 'd1', date: '2026-01-01', ordered: '1000', received: '980' }]);

      const result = await service.getStockLoss({}, ctx);
      expect(result.tankLosses[0].variance).toBe(-100);
      // expected = actual - variance = 900 - (-100) = 1000
      expect(result.tankLosses[0].expected).toBe(1000);
      expect(result.summary.netLossLiters).toBe(-100);
      expect(result.deliveryReconciliation[0].variance).toBe(-20);
    });

    it('falls back to product "Unknown" and zero shrinkage on empty losses', async () => {
      drizzle.queue([
        { tankId: 't1', station: 'Alpha', product: null, currentLevel: '0', variance: '0' },
      ]);
      drizzle.queue([]);
      drizzle.queue([]);
      const result = await service.getStockLoss({}, ctx);
      expect(result.tankLosses[0].product).toBe('Unknown');
    });
  });

  describe('getProfitability', () => {
    it('computes margins and price-impact simulation', async () => {
      // metrics row
      drizzle.queue([{ revenue: '1000', liters: '400' }]);
      // margin by product
      drizzle.queue([{ name: 'Diesel', revenue: '1000', liters: '400' }]);
      // station contribution
      drizzle.queue([
        { id: 'st1', name: 'Alpha', location: 'Loc', revenue: '1000', liters: '400' },
      ]);
      const result = await service.getProfitability({}, ctx);
      // cogs = 400 * 0.75 = 300; gross = 700
      expect(result.metrics.grossProfit.value).toBe(700);
      expect(result.marginByProduct[0].margin).toBe(700);
      expect(result.stationContribution[0].grossMargin).toBe(700);
      // price impact is deterministic
      expect(result.priceImpact.delta.revenue).toBeCloseTo(5000, 0);
    });
  });

  describe('getCreditCashflow', () => {
    it('buckets AR aging and computes collection efficiency', async () => {
      const now = Date.now();
      const day = 86400000;
      // arAging rows: one current (15 days overdue) one 90+
      drizzle.queue([
        { dueDate: new Date(now - 15 * day), amount: '100' },
        { dueDate: new Date(now - 120 * day), amount: '50' },
      ]);
      // apAging rows
      drizzle.queue([
        { dueDate: new Date(now - day), amount: '40' },
        { dueDate: new Date(now + 5 * day), amount: '10' },
        { dueDate: new Date(now + 20 * day), amount: '20' },
      ]);
      // topDebtors base rows (empty)
      drizzle.queue([]);

      const result = await service.getCreditCashflow({}, ctx);
      const current = result.arAging.find((b) => b.bucket === '0-30 Days');
      const over90 = result.arAging.find((b) => b.bucket === '90+ Days');
      expect(current?.amount).toBe(100);
      expect(over90?.amount).toBe(50);
      // total AR 150, overdue (non 0-30) = 50 => efficiency = (100/150)*100 = 66.7
      expect(result.liquidity.collectionEfficiencyPct).toBe(66.7);
      // payables buckets
      const dueNow = result.apAging.find((b) => b.bucket === 'Due Now');
      expect(dueNow?.amount).toBe(40);
      expect(result.liquidity.totalPayables).toBe(70);
    });
  });

  describe('getStationComparison', () => {
    it('ranks stations by contribution and attaches trend', async () => {
      // station contribution rows
      drizzle.queue([
        { id: 'st1', name: 'Alpha', location: 'A', revenue: '1000', liters: '400' },
        { id: 'st2', name: 'Beta', location: 'B', revenue: '2000', liters: '800' },
      ]);
      // trend rows
      drizzle.queue([
        { stationId: 'st1', value: '1000' },
        { stationId: 'st2', value: '2000' },
      ]);

      const result = await service.getStationComparison({}, ctx);
      // Beta has higher contribution => rank 1
      expect(result[0].name).toBe('Beta');
      expect(result[0].rank).toBe(1);
      expect(result[0].trend).toEqual([{ value: 2000 }]);
      expect(result[1].name).toBe('Alpha');
    });
  });

  describe('getTopDebtors enrichment', () => {
    it('joins payment and invoice rows and classifies utilization/overdue', async () => {
      const now = Date.now();
      const day = 86400000;
      // base rows
      drizzle.queue([
        { id: 'cust-1', name: 'Acme', balance: '950', limit: '1000' },
      ]);
      // payment rows
      drizzle.queue([
        { customerId: 'cust-1', paymentNumber: 'PMT-1', amount: '200', paymentDate: new Date(now) },
      ]);
      // invoice rows
      drizzle.queue([
        {
          customerId: 'cust-1',
          invoiceNumber: 'INV-1',
          amount: '500',
          invoiceDate: new Date(now - 10 * day),
          dueDate: new Date(now - day),
        },
      ]);

      const result = await (service as any).getTopDebtors({
        companyId: companyA,
        branchId: branchA,
      });
      expect(result[0].utilization).toBe(95);
      expect(result[0].status).toBe('At Risk');
      expect(result[0].lastPaymentAmount).toBe(200);
      expect(result[0].invoices[0].status).toBe('Overdue');
    });

    it('skips payment/invoice queries when no debtors found', async () => {
      drizzle.queue([]); // base rows empty
      const result = await (service as any).getTopDebtors({ companyId: companyA });
      expect(result).toEqual([]);
    });
  });

  describe('slow query + EXPLAIN handling', () => {
    it('emits a slow-query warning when total exceeds threshold', async () => {
      service = makeService({ REPORTS_SLOW_QUERY_THRESHOLD_MS: 0 });
      drizzle.queue([{ revenue: '0' }]);
      drizzle.queue([{ liters: '0', cogs: '0' }]);
      drizzle.queue([{ avgAbs: '0' }]);
      drizzle.queue([{ overdue: '0' }]);
      drizzle.queue([{ overdue: '0' }]);
      drizzle.queue([]);
      drizzle.queue([]);
      await service.getOverview({}, ctx);
      const warnedSlow = logger.warn.mock.calls.some((c) =>
        String(c[0]).includes('reports.slow_query'),
      );
      expect(warnedSlow).toBe(true);
    });

    it('execQuery runs EXPLAIN when enabled and logs the plan', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevExplain = process.env.REPORTS_EXPLAIN;
      process.env.NODE_ENV = 'development';
      process.env.REPORTS_EXPLAIN = 'true';
      try {
        service = makeService();
        drizzle.db.execute.mockResolvedValue([{ plan: 'Seq Scan' }]);
        const query: any = Promise.resolve([{ ok: 1 }]);
        query.toSQL = () => ({ sql: 'SELECT $1', params: [42] });
        const result = await (service as any).execQuery('label', query);
        expect(result).toEqual([{ ok: 1 }]);
        expect(drizzle.db.execute).toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.REPORTS_EXPLAIN = prevExplain;
      }
    });

    it('execQuery logs a warning when EXPLAIN fails but still returns rows', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevExplain = process.env.REPORTS_EXPLAIN;
      process.env.NODE_ENV = 'development';
      process.env.REPORTS_EXPLAIN = 'true';
      try {
        service = makeService();
        drizzle.db.execute.mockRejectedValue(new Error('explain failed'));
        const query: any = Promise.resolve([{ ok: 1 }]);
        query.toSQL = () => ({ sql: 'SELECT $1', params: ['x'] });
        const result = await (service as any).execQuery('lbl', query);
        expect(result).toEqual([{ ok: 1 }]);
        const warned = logger.warn.mock.calls.some((c) =>
          String(c[0]).includes('reports.explain_failed'),
        );
        expect(warned).toBe(true);
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.REPORTS_EXPLAIN = prevExplain;
      }
    });
  });

  describe('inlineSql literal coercion', () => {
    it('renders different JS types as SQL literals', () => {
      const toLit = (service as any).toSqlLiteral.bind(service);
      expect(toLit(null)).toBe('null');
      expect(toLit(undefined)).toBe('null');
      expect(toLit(42)).toBe('42');
      expect(toLit(true)).toBe('true');
      expect(toLit(false)).toBe('false');
      const d = new Date('2026-01-01T00:00:00.000Z');
      expect(toLit(d)).toBe(`'2026-01-01T00:00:00.000Z'`);
      expect(toLit("O'Brien")).toBe(`'O''Brien'`);
    });

    it('substitutes positional params in inlineSql', () => {
      const inline = (service as any).inlineSql.bind(service);
      expect(inline('SELECT $1, $2', [1, 'a'])).toBe(`SELECT 1, 'a'`);
      // $10 must not be clobbered by $1 substitution
      const out = inline('VALUES ($1, $11)', [Array.from({ length: 11 }, (_v, i) => i + 1)].flat());
      expect(out).toContain('1');
    });
  });
});
