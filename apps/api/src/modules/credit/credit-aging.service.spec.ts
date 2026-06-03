import { Test, TestingModule } from '@nestjs/testing';
import { CreditAgingService } from './credit-aging.service';
import { DRIZZLE } from '../../database/database.module';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

describe('CreditAgingService', () => {
  let service: CreditAgingService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CreditAgingService, { provide: DRIZZLE, useValue: drizzle.db }],
    }).compile();
    service = module.get(CreditAgingService);
  });

  afterEach(() => drizzle.reset());

  const asOf = '2026-06-01';
  const days = (n: number) => new Date('2026-06-01T00:00:00.000Z').getTime() - n * 24 * 60 * 60 * 1000;

  it('buckets credit invoices by overdue age', async () => {
    drizzle.queue([
      { id: 'i1', dueDate: new Date(days(0)), balanceRemaining: '50' }, // due today -> current
      { id: 'i2', dueDate: new Date(days(20)), balanceRemaining: '60' }, // 1-30
      { id: 'i3', dueDate: new Date(days(95)), balanceRemaining: '70' }, // 90+
    ]);
    const report = await service.getAging({ asOf, companyId: 'c1' });
    expect(report.total).toBe(180);
    const byBucket = Object.fromEntries(report.buckets.map((b) => [b.bucket, b]));
    expect(byBucket.current.count).toBe(1);
    expect(byBucket['1-30'].amount).toBe(60);
    expect(byBucket['90+'].amount).toBe(70);
  });

  it('handles empty result and rounds total', async () => {
    drizzle.queue([]);
    const report = await service.getAging({ branchId: 'b1' });
    expect(report.total).toBe(0);
    expect(report.branchId).toBe('b1');
    expect(report.buckets).toHaveLength(5);
  });
});
