import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CreditStatementService } from './credit-statement.service';
import { DRIZZLE } from '../../database/database.module';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

describe('CreditStatementService', () => {
  let service: CreditStatementService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CreditStatementService, { provide: DRIZZLE, useValue: drizzle.db }],
    }).compile();
    service = module.get(CreditStatementService);
  });

  afterEach(() => drizzle.reset());

  it('throws NotFoundException when the customer does not exist', async () => {
    drizzle.queue([]);
    await expect(service.getStatement('c1', '2026-01-01', '2026-06-01')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('computes opening balance and running balance, invoices ordered before same-day payments', async () => {
    drizzle.queue([{ id: 'c1', name: 'Bob' }]); // customer
    drizzle.queue([{ totalAmount: '800' }]); // invoices before
    drizzle.queue([{ amount: '300' }]); // payments before -> opening 500
    drizzle.queue([
      { id: 'inv1', invoiceNumber: 'INV-1', invoiceDate: new Date('2026-02-01'), totalAmount: '200' },
    ]); // invoices in period
    drizzle.queue([
      { id: 'pay1', paymentNumber: 'PAY-1', paymentDate: new Date('2026-02-01'), amount: '100' },
    ]); // payments in period (same date -> invoice first)

    const stmt = await service.getStatement('c1', '2026-01-01', '2026-06-01');
    expect(stmt.customerName).toBe('Bob');
    expect(stmt.openingBalance).toBe(500);
    expect(stmt.lines[0]).toMatchObject({ type: 'invoice', runningBalance: 700 });
    expect(stmt.lines[1]).toMatchObject({ type: 'payment', runningBalance: 600 });
    expect(stmt.closingBalance).toBe(600);
  });

  it('handles a customer with no activity', async () => {
    drizzle.queue([{ id: 'c1', name: 'Empty' }]);
    drizzle.queue([]);
    drizzle.queue([]);
    drizzle.queue([]);
    drizzle.queue([]);
    const stmt = await service.getStatement('c1', '2026-01-01', '2026-06-01');
    expect(stmt.openingBalance).toBe(0);
    expect(stmt.lines).toHaveLength(0);
    expect(stmt.closingBalance).toBe(0);
  });
});
