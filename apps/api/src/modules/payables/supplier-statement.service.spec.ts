import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SupplierStatementService } from './supplier-statement.service';
import { DRIZZLE } from '../../database/database.module';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

describe('SupplierStatementService', () => {
  let service: SupplierStatementService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupplierStatementService, { provide: DRIZZLE, useValue: drizzle.db }],
    }).compile();
    service = module.get(SupplierStatementService);
  });

  afterEach(() => drizzle.reset());

  it('throws NotFoundException when the supplier does not exist', async () => {
    drizzle.queue([]); // supplier lookup
    await expect(service.getStatement('s1', '2026-01-01', '2026-06-01')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('builds a statement with opening balance and a running balance per line', async () => {
    drizzle.queue([{ id: 's1', name: 'Acme' }]); // supplier
    drizzle.queue([{ totalAmount: '1000' }]); // invoicesBefore -> opening invoices
    drizzle.queue([{ amount: '400' }]); // paymentsBefore -> opening payments (opening balance 600)
    drizzle.queue([
      { id: 'inv1', invoiceNumber: 'INV-1', invoiceDate: new Date('2026-02-10'), totalAmount: '500' },
    ]); // invoices in period
    drizzle.queue([
      { id: 'pay1aaaaaaaa', paymentDate: new Date('2026-02-15'), amount: '200', referenceNo: 'PAY-9' },
    ]); // payments in period

    const stmt = await service.getStatement('s1', '2026-01-01', '2026-06-01');
    expect(stmt.supplierName).toBe('Acme');
    expect(stmt.openingBalance).toBe(600);
    expect(stmt.lines).toHaveLength(2);
    // invoice on 02-10 first: 600 + 500 = 1100
    expect(stmt.lines[0]).toMatchObject({ type: 'invoice', reference: 'INV-1', runningBalance: 1100 });
    // payment on 02-15 next: 1100 - 200 = 900
    expect(stmt.lines[1]).toMatchObject({ type: 'payment', reference: 'PAY-9', runningBalance: 900 });
    expect(stmt.closingBalance).toBe(900);
  });

  it('falls back to a synthetic reference when payment has no referenceNo', async () => {
    drizzle.queue([{ id: 's1', name: 'Acme' }]);
    drizzle.queue([]); // no invoices before
    drizzle.queue([]); // no payments before
    drizzle.queue([]); // no invoices in period
    drizzle.queue([
      { id: 'abcdef1234567890', paymentDate: new Date('2026-03-01'), amount: '100', referenceNo: '  ' },
    ]);
    const stmt = await service.getStatement('s1', '2026-01-01', '2026-06-01');
    expect(stmt.openingBalance).toBe(0);
    expect(stmt.lines[0].reference).toBe('Payment abcdef12');
    expect(stmt.closingBalance).toBe(-100);
  });
});
