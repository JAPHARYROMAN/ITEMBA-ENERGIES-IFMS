import { Test, TestingModule } from '@nestjs/testing';
import { PayablesAgingService } from './payables-aging.service';
import { DRIZZLE } from '../../database/database.module';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

describe('PayablesAgingService', () => {
  let service: PayablesAgingService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayablesAgingService, { provide: DRIZZLE, useValue: drizzle.db }],
    }).compile();
    service = module.get(PayablesAgingService);
  });

  afterEach(() => drizzle.reset());

  const asOf = '2026-06-01';
  const days = (n: number) => new Date('2026-06-01T00:00:00.000Z').getTime() - n * 24 * 60 * 60 * 1000;

  it('buckets invoices by overdue age and totals them', async () => {
    drizzle.queue([
      { id: 'i1', dueDate: new Date(days(-5)), balanceRemaining: '100' }, // not yet due -> current
      { id: 'i2', dueDate: new Date(days(10)), balanceRemaining: '200' }, // 1-30
      { id: 'i3', dueDate: new Date(days(45)), balanceRemaining: '300' }, // 31-60
      { id: 'i4', dueDate: new Date(days(75)), balanceRemaining: '400' }, // 61-90
      { id: 'i5', dueDate: new Date(days(120)), balanceRemaining: '500' }, // 90+
    ]);
    const report = await service.getAging({ asOf, branchId: 'b1', companyId: 'c1' });
    expect(report.total).toBe(1500);
    expect(report.branchId).toBe('b1');
    expect(report.companyId).toBe('c1');
    expect(report.asOf).toBe('2026-06-01');
    const byBucket = Object.fromEntries(report.buckets.map((b) => [b.bucket, b]));
    expect(byBucket.current.amount).toBe(100);
    expect(byBucket['1-30'].amount).toBe(200);
    expect(byBucket['31-60'].amount).toBe(300);
    expect(byBucket['61-90'].amount).toBe(400);
    expect(byBucket['90+'].amount).toBe(500);
    expect(byBucket['90+'].count).toBe(1);
  });

  it('returns zeroed buckets when there are no outstanding invoices', async () => {
    drizzle.queue([]);
    const report = await service.getAging({});
    expect(report.total).toBe(0);
    expect(report.buckets.every((b) => b.amount === 0 && b.count === 0)).toBe(true);
  });

  it('defaults asOf to today when not provided', async () => {
    drizzle.queue([]);
    const report = await service.getAging({});
    expect(report.asOf).toBe(new Date().toISOString().slice(0, 10));
  });
});
