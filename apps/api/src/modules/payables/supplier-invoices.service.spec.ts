import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };

describe('SupplierInvoicesService', () => {
  let service: SupplierInvoicesService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierInvoicesService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(SupplierInvoicesService);
  });

  afterEach(() => drizzle.reset());

  const ctx = { userId: 'u1', ip: '127.0.0.1', userAgent: 'jest' };

  describe('findPage', () => {
    it('returns data and total applying all filters', async () => {
      drizzle.queue([{ id: 'i1' }]);
      drizzle.queue([{ count: 4 }]);
      const res = await service.findPage({
        companyId: 'c1',
        branchId: 'b1',
        supplierId: 's1',
        status: 'unpaid',
        dateFrom: '2026-01-01',
        dateTo: '2026-06-01',
      });
      expect(res.data).toEqual([{ id: 'i1' }]);
      expect(res.total).toBe(4);
    });

    it('defaults total to 0 when the count row is missing', async () => {
      drizzle.queue([]);
      drizzle.queue([]);
      const res = await service.findPage({});
      expect(res.total).toBe(0);
      expect(res.data).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns the invoice', async () => {
      drizzle.queue([{ id: 'i1', invoiceNumber: 'INV-1' }]);
      await expect(service.findById('i1')).resolves.toEqual({
        id: 'i1',
        invoiceNumber: 'INV-1',
      });
    });

    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.findById('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const payload = {
      branchId: 'b1',
      supplierId: 's1',
      invoiceNumber: '  INV-1  ',
      invoiceDate: '2026-02-01',
      dueDate: '2026-03-01',
      totalAmount: 1000,
    };

    it('validates chain, inserts, audits and returns the invoice', async () => {
      drizzle.queue([{ id: 'b1', stationId: 'st1' }]); // branch
      drizzle.queue([{ companyId: 'c1' }]); // station
      drizzle.queue([{ id: 's1', companyId: 'c1' }]); // supplier
      const inserted = { id: 'i1', invoiceNumber: 'INV-1', totalAmount: '1000.00', balanceRemaining: '1000.00', status: 'unpaid' };
      drizzle.queue([inserted]); // insert returning

      const res = await service.create(payload, ctx);
      expect(res).toEqual(inserted);
      // balanceRemaining seeded equal to totalAmount
      const values = drizzle.db.values.mock.calls[0][0];
      expect(values.totalAmount).toBe('1000.00');
      expect(values.balanceRemaining).toBe('1000.00');
      expect(values.invoiceNumber).toBe('INV-1'); // trimmed
      expect(values.status).toBe('unpaid');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'supplier_invoices', action: 'create', entityId: 'i1' }),
      );
    });

    it('throws NotFoundException when branch missing', async () => {
      drizzle.queue([]); // branch
      await expect(service.create(payload, ctx)).rejects.toThrow(NotFoundException);
      expect(mockAudit.log).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when station missing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 'st1' }]);
      drizzle.queue([]); // station
      await expect(service.create(payload, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when supplier missing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 'st1' }]);
      drizzle.queue([{ companyId: 'c1' }]);
      drizzle.queue([]); // supplier
      await expect(service.create(payload, ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when supplier company mismatches branch company', async () => {
      drizzle.queue([{ id: 'b1', stationId: 'st1' }]);
      drizzle.queue([{ companyId: 'c1' }]);
      drizzle.queue([{ id: 's1', companyId: 'OTHER' }]);
      await expect(service.create(payload, ctx)).rejects.toThrow(
        /does not belong to branch company/,
      );
    });

    it('throws InternalServerErrorException when insert returns nothing', async () => {
      drizzle.queue([{ id: 'b1', stationId: 'st1' }]);
      drizzle.queue([{ companyId: 'c1' }]);
      drizzle.queue([{ id: 's1', companyId: 'c1' }]);
      drizzle.queue([]); // insert returning empty
      await expect(service.create(payload, ctx)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('update', () => {
    it('updates invoiceNumber and dueDate and audits', async () => {
      drizzle.queue([
        { id: 'i1', status: 'unpaid', totalAmount: '1000.00', balanceRemaining: '1000.00' },
      ]); // existing
      drizzle.queue([{ id: 'i1', invoiceNumber: 'NEW' }]); // update returning
      const res = await service.update('i1', { invoiceNumber: ' NEW ', dueDate: '2026-04-01' }, ctx);
      expect(res).toEqual({ id: 'i1', invoiceNumber: 'NEW' });
      const setArg = drizzle.db.set.mock.calls[0][0];
      expect(setArg.invoiceNumber).toBe('NEW');
      expect(setArg.dueDate).toBeInstanceOf(Date);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'supplier_invoices', action: 'update' }),
      );
    });

    it('recomputes balanceRemaining when totalAmount increases', async () => {
      drizzle.queue([
        { id: 'i1', status: 'partial', totalAmount: '1000.00', balanceRemaining: '400.00' },
      ]);
      drizzle.queue([{ id: 'i1' }]);
      await service.update('i1', { totalAmount: 1200 }, ctx);
      const setArg = drizzle.db.set.mock.calls[0][0];
      // diff +200 -> balance 400 + 200 = 600
      expect(setArg.totalAmount).toBe('1200.00');
      expect(setArg.balanceRemaining).toBe('600.00');
    });

    it('throws when new total would drive balance negative', async () => {
      drizzle.queue([
        { id: 'i1', status: 'partial', totalAmount: '1000.00', balanceRemaining: '100.00' },
      ]);
      // reducing total by 200 -> balance 100 - 200 = -100
      await expect(service.update('i1', { totalAmount: 800 }, ctx)).rejects.toThrow(
        /negative balance/,
      );
    });

    it('throws NotFoundException when invoice missing', async () => {
      drizzle.queue([]); // existing
      await expect(service.update('x', { invoiceNumber: 'A' }, ctx)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects updating a voided invoice', async () => {
      drizzle.queue([{ id: 'i1', status: 'voided', totalAmount: '1', balanceRemaining: '1' }]);
      await expect(service.update('i1', { invoiceNumber: 'A' }, ctx)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects updating a fully paid invoice', async () => {
      drizzle.queue([{ id: 'i1', status: 'paid', totalAmount: '1', balanceRemaining: '0' }]);
      await expect(service.update('i1', { invoiceNumber: 'A' }, ctx)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws InternalServerErrorException when update returns nothing', async () => {
      drizzle.queue([{ id: 'i1', status: 'unpaid', totalAmount: '1', balanceRemaining: '1' }]);
      drizzle.queue([]); // update returning empty
      await expect(service.update('i1', { invoiceNumber: 'A' }, ctx)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('deleteInvoice', () => {
    it('voids an unpaid invoice within a transaction and audits', async () => {
      drizzle.queue([
        { id: 'i1', status: 'unpaid', totalAmount: '1000.00', balanceRemaining: '1000.00' },
      ]); // select
      const res = await service.deleteInvoice('i1', ctx);
      expect(res).toEqual({ success: true });
      expect(drizzle.db.transaction).toHaveBeenCalled();
      const setArg = drizzle.db.set.mock.calls[0][0];
      expect(setArg.status).toBe('voided');
      expect(setArg.deletedAt).toBeInstanceOf(Date);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'supplier_invoices', action: 'delete' }),
        expect.anything(),
      );
    });

    it('throws NotFoundException when invoice missing', async () => {
      drizzle.queue([]);
      await expect(service.deleteInvoice('x', ctx)).rejects.toThrow(NotFoundException);
    });

    it('throws when invoice already voided', async () => {
      drizzle.queue([{ id: 'i1', status: 'voided', totalAmount: '1', balanceRemaining: '1' }]);
      await expect(service.deleteInvoice('i1', ctx)).rejects.toThrow(/already voided/);
    });

    it('refuses to void an invoice that has payment allocations', async () => {
      drizzle.queue([
        { id: 'i1', status: 'partial', totalAmount: '1000.00', balanceRemaining: '600.00' },
      ]);
      await expect(service.deleteInvoice('i1', ctx)).rejects.toThrow(
        /existing payment allocations/,
      );
    });
  });
});
