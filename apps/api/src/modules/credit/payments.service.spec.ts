import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

import { aggregatePaymentAllocations, PaymentsService } from './payments.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

describe('aggregatePaymentAllocations', () => {
  it('aggregates duplicate invoice allocations before balance validation', () => {
    expect(
      aggregatePaymentAllocations(
        [
          { invoiceId: 'inv-1', amount: 40 },
          { invoiceId: 'inv-1', amount: 10 },
          { invoiceId: 'inv-2', amount: 25.25 },
        ],
        75.25,
      ),
    ).toEqual([
      { invoiceId: 'inv-1', amount: 50 },
      { invoiceId: 'inv-2', amount: 25.25 },
    ]);
  });

  it('rejects allocations that do not sum to the payment amount', () => {
    expect(() => aggregatePaymentAllocations([{ invoiceId: 'inv-1', amount: 10 }], 11)).toThrow(
      BadRequestException,
    );
  });

  it('rejects an allocation with a missing invoiceId', () => {
    expect(() =>
      aggregatePaymentAllocations([{ invoiceId: '', amount: 10 }], 10),
    ).toThrow('invoiceId is required');
  });

  it('rejects a non-positive payment amount', () => {
    expect(() => aggregatePaymentAllocations([{ invoiceId: 'inv-1', amount: 5 }], 0)).toThrow(
      'Payment amount must be greater than zero',
    );
  });
});

/**
 * The shared drizzle chain mock does not implement `.for('update')` (row locking),
 * which the payments service uses heavily. Patch it onto the chain so the chain
 * remains awaitable / continues to serve queued results.
 */
function patchForUpdate(db: any): void {
  const chain = db.select();
  chain.for = jest.fn(() => chain);
}

describe('PaymentsService', () => {
  let service: PaymentsService;
  let drizzle: DrizzleMock;
  let audit: { log: jest.Mock };

  const ctx = { userId: 'u1', ip: '127.0.0.1', userAgent: 'jest' };

  const customerBasic = { id: 'cust1', companyId: 'co1', branchId: 'br1' };

  const insertedPayment = {
    id: 'pay1',
    companyId: 'co1',
    branchId: 'br1',
    customerId: 'cust1',
    paymentNumber: 'PAY-1',
    amount: '100.00',
    method: 'cash',
    paymentDate: new Date('2026-02-01'),
    referenceNo: null,
    createdAt: new Date('2026-02-01'),
  };

  beforeEach(async () => {
    drizzle = createDrizzleMock();
    patchForUpdate(drizzle.db);
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(PaymentsService);
  });

  afterEach(() => drizzle.reset());

  describe('findPage', () => {
    it('returns data + total with filters', async () => {
      drizzle.queue([insertedPayment]);
      drizzle.queue([{ count: 1 }]);
      const res = await service.findPage({
        companyId: 'co1',
        branchId: 'br1',
        customerId: 'cust1',
        dateFrom: '2026-01-01',
        dateTo: '2026-03-01',
      });
      expect(res.data).toHaveLength(1);
      expect(res.total).toBe(1);
    });
  });

  describe('getById', () => {
    it('returns payment with allocations', async () => {
      drizzle.queue([insertedPayment]);
      drizzle.queue([{ invoiceId: 'inv1', amount: '100.00' }]);
      const res = await service.getById('pay1');
      expect(res.id).toBe('pay1');
      expect(res.allocations).toHaveLength(1);
    });

    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.getById('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create - auto allocation', () => {
    it('throws NotFoundException when customer missing', async () => {
      drizzle.queue([]); // customerBasic lookup
      await expect(
        service.create({ customerId: 'nope', amount: 100, method: 'cash' }, ctx),
      ).rejects.toThrow('Customer not found');
    });

    it('auto-allocates across oldest invoices and updates balances', async () => {
      drizzle.queue([customerBasic]); // customerBasic
      drizzle.queue([{ balance: '150.00' }]); // locked customer (for update)
      drizzle.queue([
        { id: 'inv1', balanceRemaining: '60.00' },
        { id: 'inv2', balanceRemaining: '80.00' },
      ]); // buildAutoAllocations unpaid select (60 -> inv1, 40 -> inv2)
      drizzle.queue([insertedPayment]); // insert payment returning
      // allocation 1 (inv1, 60)
      drizzle.queue([]); // insert paymentAllocations awaited
      drizzle.queue([{ balanceRemaining: '60.00' }]); // inv1 balance select
      drizzle.queue([]); // update inv1 awaited
      // allocation 2 (inv2, 40)
      drizzle.queue([]); // insert paymentAllocations awaited
      drizzle.queue([{ balanceRemaining: '80.00' }]); // inv2 balance select
      drizzle.queue([]); // update inv2 awaited
      drizzle.queue([]); // update customer balance awaited
      const res = await service.create({ customerId: 'cust1', amount: 100, method: 'cash' }, ctx);
      expect(res.id).toBe('pay1');
      expect(audit.log.mock.calls[0][0]).toEqual(
        expect.objectContaining({ entity: 'payments', action: 'create' }),
      );
    });

    it('rejects when customer balance is below the payment amount', async () => {
      drizzle.queue([customerBasic]); // customerBasic
      drizzle.queue([{ balance: '50.00' }]); // locked customer
      await expect(
        service.create({ customerId: 'cust1', amount: 100, method: 'cash' }, ctx),
      ).rejects.toThrow(/balance .* is less than payment amount/);
    });

    it('rejects when there are no outstanding invoices to allocate against', async () => {
      drizzle.queue([customerBasic]);
      drizzle.queue([{ balance: '500.00' }]); // locked
      drizzle.queue([]); // no unpaid invoices
      await expect(
        service.create({ customerId: 'cust1', amount: 100, method: 'cash' }, ctx),
      ).rejects.toThrow('no outstanding invoices');
    });

    it('rejects when payment exceeds total outstanding (over-allocation)', async () => {
      drizzle.queue([customerBasic]);
      drizzle.queue([{ balance: '500.00' }]); // locked
      drizzle.queue([{ id: 'inv1', balanceRemaining: '40.00' }]); // only 40 outstanding
      await expect(
        service.create({ customerId: 'cust1', amount: 100, method: 'cash' }, ctx),
      ).rejects.toThrow(/exceeds total outstanding/);
    });
  });

  describe('create - explicit allocation', () => {
    it('rejects an allocation exceeding the invoice balance', async () => {
      drizzle.queue([customerBasic]);
      drizzle.queue([{ balance: '500.00' }]); // locked
      drizzle.queue([{ id: 'inv1', balanceRemaining: '30.00' }]); // validateExplicitAllocations select
      await expect(
        service.create(
          {
            customerId: 'cust1',
            amount: 100,
            method: 'cash',
            allocations: [{ invoiceId: 'inv1', amount: 100 }],
          },
          ctx,
        ),
      ).rejects.toThrow(/exceeds invoice balance/);
    });

    it('rejects an allocation against an invoice not belonging to the customer', async () => {
      drizzle.queue([customerBasic]);
      drizzle.queue([{ balance: '500.00' }]); // locked
      drizzle.queue([]); // no invoices found for customer
      await expect(
        service.create(
          {
            customerId: 'cust1',
            amount: 100,
            method: 'cash',
            allocations: [{ invoiceId: 'inv9', amount: 100 }],
          },
          ctx,
        ),
      ).rejects.toThrow(/not found or not for this customer/);
    });

    it('processes valid explicit allocations', async () => {
      drizzle.queue([customerBasic]);
      drizzle.queue([{ balance: '500.00' }]); // locked
      drizzle.queue([{ id: 'inv1', balanceRemaining: '100.00' }]); // validateExplicitAllocations
      drizzle.queue([insertedPayment]); // insert returning
      drizzle.queue([]); // insert paymentAllocations awaited
      drizzle.queue([{ balanceRemaining: '100.00' }]); // inv1 balance select
      drizzle.queue([]); // update inv1 awaited
      drizzle.queue([]); // update customer balance awaited
      const res = await service.create(
        {
          customerId: 'cust1',
          amount: 100,
          method: 'cash',
          allocations: [{ invoiceId: 'inv1', amount: 100 }],
        },
        ctx,
      );
      expect(res.id).toBe('pay1');
    });
  });

  describe('voidPayment', () => {
    it('throws NotFoundException when payment missing', async () => {
      drizzle.queue([]); // payment select
      await expect(service.voidPayment('nope', ctx)).rejects.toThrow(NotFoundException);
    });

    it('returns early (no-op) when payment already soft-deleted', async () => {
      drizzle.queue([{ id: 'pay1', deletedAt: new Date(), customerId: 'cust1', amount: '100.00', companyId: 'co1' }]);
      const res = await service.voidPayment('pay1', ctx);
      expect(res).toEqual({ success: true });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('reverses allocations, restores customer balance, and soft-deletes', async () => {
      drizzle.queue([
        { id: 'pay1', deletedAt: null, customerId: 'cust1', amount: '100.00', companyId: 'co1' },
      ]); // payment (for update)
      drizzle.queue([{ invoiceId: 'inv1', amount: '100.00' }]); // allocations
      drizzle.queue([{ balanceRemaining: '0.00', totalAmount: '100.00' }]); // inv1 select (for update)
      drizzle.queue([]); // tx.update(creditInvoices) awaited
      drizzle.queue([{ balance: '0.00' }]); // customer select (for update)
      drizzle.queue([]); // tx.update(customers) awaited
      drizzle.queue([]); // tx.update(payments) awaited
      const res = await service.voidPayment('pay1', ctx);
      expect(res).toEqual({ success: true });
      expect(audit.log.mock.calls[0][0]).toEqual(
        expect.objectContaining({ entity: 'payments', action: 'void' }),
      );
    });
  });
});
