import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { ReportsController } from '../src/modules/reports/reports.controller';
import { ReportsService } from '../src/modules/reports/reports.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/modules/auth/guards/permissions.guard';

describe('Reports Overview Endpoint (e2e)', () => {
  let app: INestApplication;

  const reportsServiceMock = {
    getOverview: jest.fn(),
    getDailyOperations: jest.fn(),
    getStockLoss: jest.fn(),
    getProfitability: jest.fn(),
    getCreditCashflow: jest.fn(),
    getStationComparison: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: reportsServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { sub: 'auditor-1', email: 'auditor@ifms.com', permissions: ['reports:read'] };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns overview payload with expected keys', async () => {
    reportsServiceMock.getOverview.mockResolvedValueOnce({
      kpis: { totalSales: { value: 1000, change: 0, trend: 'neutral' } },
      salesTrend: [{ date: '2026-02-01', amount: 1000 }],
      paymentMix: [{ name: 'cash', value: 1000 }],
      varianceByStation: [{ station: 'A', variance: 0, status: 'Normal' }],
      topDebtors: [],
    });

    const res = await request(app.getHttpServer())
      .get('/reports/overview?dateFrom=2026-02-01&dateTo=2026-02-28')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(res.body.kpis).toBeDefined();
    expect(Array.isArray(res.body.salesTrend)).toBe(true);
    expect(Array.isArray(res.body.paymentMix)).toBe(true);
  });
});
