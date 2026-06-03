import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreditInvoicesService } from './credit-invoices.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

describe('CreditInvoicesService', () => {
  let service: CreditInvoicesService;
  let drizzle: DrizzleMock;
  let audit: { log: jest.Mock };

  const ctx = { userId: 'u1', ip: '127.0.0.1', userAgent: 'jest' };

  const customerRow = {
    id: 'cust1',
    companyId: 'co1',
    branchId: 'br1',
    creditLimit: '0',
    balance: '0',
    paymentTerms: 'net30',
  };

  const insertedInvoice = {
    id: 'inv1',
    companyId: 'co1',
    branchId: 'br1',
    customerId: 'cust1',
    invoiceNumber: 'INV-1',
    invoiceDate: new Date('2026-01-01'),
    dueDate: new Date('2026-01-31'),
    totalAmount: '21.00',
    balanceRemaining: '21.00',
    status: 'unpaid',
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    drizzle = createDrizzleMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditInvoicesService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(CreditInvoicesService);
  });

  afterEach(() => drizzle.reset());

  describe('findPage', () => {
    it('returns data + total with status/date filters', async () => {
      drizzle.queue([insertedInvoice]);
      drizzle.queue([{ count: 2 }]);
      const res = await service.findPage({
        companyId: 'co1',
        branchId: 'br1',
        customerId: 'cust1',
        status: 'unpaid',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
      });
      expect(res.data).toHaveLength(1);
      expect(res.total).toBe(2);
    });
  });

  describe('create', () => {
    it('rejects when no items provided', async () => {
      await expect(
        service.create({ customerId: 'cust1', items: [] }, ctx),
      ).rejects.toThrow('At least one item required');
    });

    it('throws NotFoundException when customer missing', async () => {
      drizzle.queue([]); // customer lookup
      await expect(
        service.create(
          { customerId: 'cust1', items: [{ productId: 'p1', quantity: 1, unitPrice: 10 }] },
          ctx,
        ),
      ).rejects.toThrow('Customer not found');
    });

    it('computes total from line items and inserts invoice + items', async () => {
      drizzle.queue([customerRow]); // customer
      drizzle.queue([insertedInvoice]); // tx insert invoice returning
      drizzle.queue([]); // tx.insert(invoiceItems).values(...) awaited
      drizzle.queue([]); // tx.update(customers) awaited
      drizzle.queue([
        { id: 'it1', invoiceId: 'inv1', productId: 'p1', quantity: '2.000', unitPrice: '10.00', tax: '1.00', total: '21.00' },
      ]); // post-tx items select
      const res = await service.create(
        {
          customerId: 'cust1',
          invoiceDate: '2026-01-01',
          items: [{ productId: 'p1', quantity: 2, unitPrice: 10, tax: 1 }],
        },
        ctx,
      );
      expect(res.totalAmount).toBe('21.00');
      expect(res.items).toHaveLength(1);
      expect(audit.log.mock.calls[0][0]).toEqual(
        expect.objectContaining({ entity: 'credit_invoices', action: 'create' }),
      );
    });

    it('enforces credit limit when exceeded', async () => {
      drizzle.queue([{ ...customerRow, creditLimit: '50', balance: '40' }]); // customer
      await expect(
        service.create(
          { customerId: 'cust1', items: [{ productId: 'p1', quantity: 1, unitPrice: 20 }] },
          ctx,
        ),
      ).rejects.toThrow(/Credit limit exceeded/);
    });

    it('allows invoice at exactly the credit limit', async () => {
      drizzle.queue([{ ...customerRow, creditLimit: '50', balance: '40' }]); // customer
      drizzle.queue([insertedInvoice]); // insert returning
      drizzle.queue([]); // tx.insert(invoiceItems) awaited
      drizzle.queue([]); // tx.update(customers) awaited
      drizzle.queue([]); // items select
      await expect(
        service.create(
          { customerId: 'cust1', items: [{ productId: 'p1', quantity: 1, unitPrice: 10 }] },
          ctx,
        ),
      ).resolves.toMatchObject({ id: 'inv1' });
    });
  });

  describe('getById', () => {
    it('returns invoice with items and customer info', async () => {
      drizzle.queue([
        { ...insertedInvoice, customerName: 'Acme', customerCode: 'C001' },
      ]); // join row
      drizzle.queue([{ id: 'it1', invoiceId: 'inv1', productId: 'p1', quantity: '2.000', unitPrice: '10.00', tax: '1.00', total: '21.00' }]);
      const res = (await service.getById('inv1', 'co1')) as any;
      expect(res.id).toBe('inv1');
      expect(res.items).toHaveLength(1);
      expect(res.customer.name).toBe('Acme');
    });

    it('throws NotFoundException when invoice missing', async () => {
      drizzle.queue([]);
      await expect(service.getById('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when invoice missing', async () => {
      drizzle.queue([]);
      await expect(service.update('nope', { dueDate: '2026-03-01' }, ctx)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects updates on non-unpaid invoices', async () => {
      drizzle.queue([{ ...insertedInvoice, status: 'partial' }]);
      await expect(service.update('inv1', { totalAmount: 30 }, ctx)).rejects.toThrow(
        'Only unpaid invoices can be updated',
      );
    });

    it('rejects a new total that would make balance negative', async () => {
      drizzle.queue([{ ...insertedInvoice, totalAmount: '100.00', balanceRemaining: '10.00' }]);
      // diff = 5 - 100 = -95, newBalance = 10 - 95 < 0
      await expect(service.update('inv1', { totalAmount: 5 }, ctx)).rejects.toThrow(
        'negative balance remaining',
      );
    });

    it('updates totalAmount and adjusts customer balance', async () => {
      drizzle.queue([{ ...insertedInvoice, totalAmount: '21.00', balanceRemaining: '21.00' }]); // existing
      drizzle.queue([{ ...insertedInvoice, totalAmount: '31.00', balanceRemaining: '31.00' }]); // tx update returning
      drizzle.queue([{ id: 'cust1', balance: '21.00' }]); // customer select in tx
      drizzle.queue([]); // tx.update(customers) awaited
      drizzle.queue([]); // post-tx items select
      const res = await service.update('inv1', { totalAmount: 31 }, ctx);
      expect(res.totalAmount).toBe('31.00');
      expect(audit.log.mock.calls[0][0]).toEqual(
        expect.objectContaining({ action: 'update' }),
      );
    });

    it('updates only dueDate without touching customer balance', async () => {
      drizzle.queue([insertedInvoice]); // existing
      drizzle.queue([{ ...insertedInvoice, dueDate: new Date('2026-03-01') }]); // returning
      drizzle.queue([]); // items
      const res = await service.update('inv1', { dueDate: '2026-03-01' }, ctx);
      expect(res.id).toBe('inv1');
    });
  });

  describe('deleteInvoice', () => {
    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.deleteInvoice('nope', ctx)).rejects.toThrow(NotFoundException);
    });

    it('rejects voiding an already-voided invoice', async () => {
      drizzle.queue([{ ...insertedInvoice, status: 'voided' }]);
      await expect(service.deleteInvoice('inv1', ctx)).rejects.toThrow('already voided');
    });

    it('rejects voiding an invoice with payment allocations', async () => {
      drizzle.queue([{ ...insertedInvoice, totalAmount: '21.00', balanceRemaining: '10.00' }]);
      await expect(service.deleteInvoice('inv1', ctx)).rejects.toThrow(
        /Cannot void an invoice that has existing payment allocations/,
      );
    });

    it('voids a clean invoice and reverses the customer balance', async () => {
      drizzle.queue([{ ...insertedInvoice, totalAmount: '21.00', balanceRemaining: '21.00' }]); // existing
      drizzle.queue([]); // tx.update(creditInvoices) awaited
      drizzle.queue([{ id: 'cust1', balance: '21.00' }]); // customer select in tx
      drizzle.queue([]); // tx.update(customers) awaited
      const res = await service.deleteInvoice('inv1', ctx);
      expect(res).toEqual({ success: true });
      expect(audit.log.mock.calls[0][0]).toEqual(
        expect.objectContaining({ action: 'delete' }),
      );
    });
  });
});
