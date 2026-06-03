import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupplierPaymentsService } from './supplier-payments.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };

describe('SupplierPaymentsService (class)', () => {
  let service: SupplierPaymentsService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    drizzle = createDrizzleMock();
    // The service uses `.for('update')` row locking; the shared chain mock does
    // not implement `.for`, so add it (returning the same thenable chain).
    const chain = drizzle.db.where();
    chain.for = jest.fn(() => chain);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierPaymentsService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(SupplierPaymentsService);
  });

  afterEach(() => drizzle.reset());

  const ctx = { userId: 'u1', ip: '127.0.0.1', userAgent: 'jest' };

  // Queue the branch -> station -> supplier validation reads common to create().
  function queueValidation(companyId = 'c1') {
    drizzle.queue([{ id: 'b1', stationId: 'st1' }]); // branch
    drizzle.queue([{ companyId }]); // station
    drizzle.queue([{ id: 's1', companyId }]); // supplier
  }

  describe('findPage', () => {
    it('returns data and total applying filters', async () => {
      drizzle.queue([{ id: 'p1' }]);
      drizzle.queue([{ count: 2 }]);
      const res = await service.findPage({
        companyId: 'c1',
        branchId: 'b1',
        supplierId: 's1',
        dateFrom: '2026-01-01',
        dateTo: '2026-06-01',
      });
      expect(res.data).toEqual([{ id: 'p1' }]);
      expect(res.total).toBe(2);
    });

    it('defaults total to 0 when count missing', async () => {
      drizzle.queue([]);
      drizzle.queue([]);
      const res = await service.findPage({});
      expect(res.total).toBe(0);
    });
  });

  describe('create - validation guards', () => {
    const base = { branchId: 'b1', supplierId: 's1', amount: 100, method: 'cash' };

    it('throws NotFoundException when branch missing', async () => {
      drizzle.queue([]); // branch
      await expect(service.create(base, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when station missing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 'st1' }]);
      drizzle.queue([]); // station
      await expect(service.create(base, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when supplier missing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 'st1' }]);
      drizzle.queue([{ companyId: 'c1' }]);
      drizzle.queue([]); // supplier
      await expect(service.create(base, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when supplier company mismatches', async () => {
      drizzle.queue([{ id: 'b1', stationId: 'st1' }]);
      drizzle.queue([{ companyId: 'c1' }]);
      drizzle.queue([{ id: 's1', companyId: 'OTHER' }]);
      await expect(service.create(base, ctx)).rejects.toThrow(/does not belong/);
    });

    it('rejects non-positive payment amount', async () => {
      queueValidation();
      await expect(service.create({ ...base, amount: 0 }, ctx)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('create - auto allocation (FIFO across invoices)', () => {
    it('spreads a payment across the oldest outstanding invoices and marks statuses', async () => {
      queueValidation();
      // buildAutoAllocations: unpaid invoices ordered by due date
      drizzle.queue([
        { id: 'inv1', balanceRemaining: '60.00' },
        { id: 'inv2', balanceRemaining: '80.00' },
      ]);
      // insert payment returning
      drizzle.queue([{ id: 'pay1', companyId: 'c1', amount: '100.00' }]);
      // alloc 1: insert allocation (awaited values), select inv balance, update
      drizzle.queue([]); // insert allocation values
      drizzle.queue([{ balanceRemaining: '60.00' }]); // select balance inv1
      drizzle.queue([]); // update inv1
      // alloc 2 (remaining 40 against inv2 balance 80 -> partial)
      drizzle.queue([]); // insert allocation values
      drizzle.queue([{ balanceRemaining: '80.00' }]); // select balance inv2
      drizzle.queue([]); // update inv2

      const res = await service.create(
        { branchId: 'b1', supplierId: 's1', amount: 100, method: ' cash ', referenceNo: ' R1 ' },
        ctx,
      );
      expect(res).toEqual({ id: 'pay1', companyId: 'c1', amount: '100.00' });

      // payment row trims method & reference
      const payValues = drizzle.db.values.mock.calls[0][0];
      expect(payValues.method).toBe('cash');
      expect(payValues.referenceNo).toBe('R1');
      expect(payValues.amount).toBe('100.00');

      // inv1 fully paid (60 allocated), inv2 partial (40 of 80)
      const inv1Set = drizzle.db.set.mock.calls[0][0];
      const inv2Set = drizzle.db.set.mock.calls[1][0];
      expect(inv1Set).toMatchObject({ balanceRemaining: '0.00', status: 'paid' });
      expect(inv2Set).toMatchObject({ balanceRemaining: '40.00', status: 'partial' });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'supplier_payments', action: 'create' }),
        expect.anything(),
      );
    });

    it('rejects auto allocation when supplier has no outstanding invoices', async () => {
      queueValidation();
      drizzle.queue([]); // no unpaid invoices
      await expect(
        service.create({ branchId: 'b1', supplierId: 's1', amount: 50, method: 'cash' }, ctx),
      ).rejects.toThrow(/no outstanding invoices/);
    });

    it('rejects over-payment that exceeds total outstanding', async () => {
      queueValidation();
      drizzle.queue([{ id: 'inv1', balanceRemaining: '30.00' }]); // only 30 available
      await expect(
        service.create({ branchId: 'b1', supplierId: 's1', amount: 100, method: 'cash' }, ctx),
      ).rejects.toThrow(/exceeds total outstanding/);
    });
  });

  describe('create - explicit allocation', () => {
    const payload = {
      branchId: 'b1',
      supplierId: 's1',
      amount: 100,
      method: 'cash',
      allocations: [{ invoiceId: 'inv1', amount: 100 }],
    };

    it('accepts explicit allocations within invoice balance', async () => {
      queueValidation();
      // validateExplicitAllocations: select invoices for update
      drizzle.queue([{ id: 'inv1', balanceRemaining: '150.00' }]);
      drizzle.queue([{ id: 'pay1', companyId: 'c1' }]); // insert payment returning
      drizzle.queue([]); // insert allocation values
      drizzle.queue([{ balanceRemaining: '150.00' }]); // select balance
      drizzle.queue([]); // update invoice

      const res = await service.create(payload, ctx);
      expect(res).toEqual({ id: 'pay1', companyId: 'c1' });
      const invSet = drizzle.db.set.mock.calls[0][0];
      // 150 - 100 = 50 remaining -> partial
      expect(invSet).toMatchObject({ balanceRemaining: '50.00', status: 'partial' });
    });

    it('rejects explicit allocation for an invoice not belonging to the supplier', async () => {
      queueValidation();
      drizzle.queue([]); // no matching invoices -> invMap empty
      await expect(service.create(payload, ctx)).rejects.toThrow(/not found or not for this supplier/);
    });

    it('rejects an explicit allocation exceeding the invoice balance', async () => {
      queueValidation();
      drizzle.queue([{ id: 'inv1', balanceRemaining: '40.00' }]); // less than 100
      await expect(service.create(payload, ctx)).rejects.toThrow(/exceeds invoice balance/);
    });

    it('rejects when explicit allocations do not sum to the payment amount', async () => {
      queueValidation();
      await expect(
        service.create(
          { ...payload, amount: 100, allocations: [{ invoiceId: 'inv1', amount: 60 }] },
          ctx,
        ),
      ).rejects.toThrow(/must equal payment amount/);
    });
  });

  describe('getById', () => {
    it('returns the payment with its allocations', async () => {
      drizzle.queue([{ id: 'pay1', amount: '100.00' }]); // payment
      drizzle.queue([{ invoiceId: 'inv1', amount: '100.00' }]); // allocations
      const res = await service.getById('pay1');
      expect(res).toMatchObject({
        id: 'pay1',
        allocations: [{ invoiceId: 'inv1', amount: '100.00' }],
      });
    });

    it('throws NotFoundException when payment missing', async () => {
      drizzle.queue([]); // payment
      await expect(service.getById('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('voidPayment', () => {
    it('reverses allocations, restores balances and soft-deletes the payment', async () => {
      drizzle.queue([{ id: 'pay1', companyId: 'c1', deletedAt: null }]); // payment for update
      drizzle.queue([{ invoiceId: 'inv1', amount: '40.00' }]); // allocations
      drizzle.queue([{ balanceRemaining: '60.00', totalAmount: '100.00' }]); // invoice for update

      const res = await service.voidPayment('pay1', ctx);
      expect(res).toEqual({ success: true });

      // invoice restored: 60 + 40 = 100 == total -> unpaid
      const invSet = drizzle.db.set.mock.calls[0][0];
      expect(invSet).toMatchObject({ balanceRemaining: '100.00', status: 'unpaid' });
      // payment soft-deleted
      const paySet = drizzle.db.set.mock.calls[1][0];
      expect(paySet.deletedAt).toBeInstanceOf(Date);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'supplier_payments', action: 'void' }),
        expect.anything(),
      );
    });

    it('marks invoice partial when reversal does not fully restore the balance', async () => {
      drizzle.queue([{ id: 'pay1', companyId: 'c1', deletedAt: null }]);
      drizzle.queue([{ invoiceId: 'inv1', amount: '30.00' }]);
      drizzle.queue([{ balanceRemaining: '0.00', totalAmount: '100.00' }]); // was fully paid
      await service.voidPayment('pay1', ctx);
      // 0 + 30 = 30 < total -> partial
      const invSet = drizzle.db.set.mock.calls[0][0];
      expect(invSet).toMatchObject({ balanceRemaining: '30.00', status: 'partial' });
    });

    it('throws NotFoundException when payment missing', async () => {
      drizzle.queue([]); // payment for update
      await expect(service.voidPayment('x', ctx)).rejects.toThrow(NotFoundException);
    });

    it('is a no-op when the payment is already soft-deleted', async () => {
      drizzle.queue([{ id: 'pay1', companyId: 'c1', deletedAt: new Date() }]);
      const res = await service.voidPayment('pay1', ctx);
      expect(res).toEqual({ success: true });
      expect(mockAudit.log).not.toHaveBeenCalled();
      expect(drizzle.db.set).not.toHaveBeenCalled();
    });
  });
});
