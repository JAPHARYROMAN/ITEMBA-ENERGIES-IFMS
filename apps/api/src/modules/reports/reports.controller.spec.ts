import { ReportsController } from './reports.controller';
import type { ReportsService } from './reports.service';

describe('ReportsController', () => {
  let service: jest.Mocked<
    Pick<
      ReportsService,
      | 'getOverview'
      | 'getDailyOperations'
      | 'getStockLoss'
      | 'getProfitability'
      | 'getCreditCashflow'
      | 'getStationComparison'
      | 'recordAction'
    >
  >;
  let controller: ReportsController;

  const companyA = '11111111-1111-1111-1111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const user = {
    sub: 'user-1',
    permissions: [`company:${companyA}`, `branch:${branchA}`, 'reports:read'],
  } as any;

  const makeRes = () => {
    const headers: Record<string, string> = {};
    return {
      headers,
      statusCode: 200,
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
      status: jest.fn(function (this: any, code: number) {
        this.statusCode = code;
        return this;
      }),
    };
  };

  beforeEach(() => {
    service = {
      getOverview: jest.fn(),
      getDailyOperations: jest.fn(),
      getStockLoss: jest.fn(),
      getProfitability: jest.fn(),
      getCreditCashflow: jest.fn(),
      getStationComparison: jest.fn(),
      recordAction: jest.fn(),
    };
    controller = new ReportsController(service as unknown as ReportsService);
  });

  it('overview sets an ETag and returns the payload when no matching if-none-match', async () => {
    const payload = { kpis: { totalSales: 10 } };
    service.getOverview.mockResolvedValue(payload as any);
    const req = { id: 'corr-1', headers: {} } as any;
    const res = makeRes();
    const result = await controller.overview({} as any, req, res as any, user);
    expect(result).toBe(payload);
    expect(res.setHeader).toHaveBeenCalledWith('ETag', expect.stringMatching(/^".+"$/));
    // scope derived from permissions is passed to the service
    expect(service.getOverview).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        endpoint: '/reports/overview',
        scope: expect.objectContaining({ companyId: companyA, branchId: branchA }),
      }),
    );
  });

  it('overview returns 304 when if-none-match equals the computed ETag', async () => {
    const payload = { a: 1 };
    service.getOverview.mockResolvedValue(payload as any);
    const res1 = makeRes();
    await controller.overview({} as any, { id: 'c', headers: {} } as any, res1 as any, user);
    const etag = res1.headers['ETag'];

    const res2 = makeRes();
    const result = await controller.overview(
      {} as any,
      { id: 'c', headers: { 'if-none-match': etag } } as any,
      res2 as any,
      user,
    );
    expect(res2.status).toHaveBeenCalledWith(304);
    expect(result).toBeUndefined();
  });

  it('falls back to correlationId n/a when req has no id', async () => {
    service.getDailyOperations.mockResolvedValue({} as any);
    const res = makeRes();
    await controller.dailyOperations({} as any, { headers: {} } as any, res as any, user);
    expect(service.getDailyOperations).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ correlationId: 'n/a' }),
    );
  });

  it.each([
    ['stockLoss', 'getStockLoss', '/reports/stock-loss'],
    ['profitability', 'getProfitability', '/reports/profitability'],
    ['creditCashflow', 'getCreditCashflow', '/reports/credit-cashflow'],
    ['stationComparison', 'getStationComparison', '/reports/station-comparison'],
  ] as const)('%s delegates to the service with the right endpoint', async (method, svcMethod, endpoint) => {
    (service[svcMethod] as jest.Mock).mockResolvedValue({ ok: true } as any);
    const res = makeRes();
    await (controller as any)[method]({}, { id: 'c', headers: {} }, res, user);
    expect(service[svcMethod]).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ endpoint }),
    );
  });

  it('recordAction forwards request metadata', async () => {
    service.recordAction.mockResolvedValue({ ok: true, actionId: 'a1', action: 'flag' } as any);
    const req = { ip: '1.2.3.4', headers: { 'user-agent': 'jest' } } as any;
    const dto = { action: 'flag' } as any;
    await controller.recordAction(dto, user, req);
    expect(service.recordAction).toHaveBeenCalledWith(dto, {
      userId: 'user-1',
      ip: '1.2.3.4',
      userAgent: 'jest',
    });
  });
});
