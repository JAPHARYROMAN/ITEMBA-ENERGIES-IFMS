import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

describe('CustomersService', () => {
  let service: CustomersService;
  let drizzle: DrizzleMock;
  let audit: { log: jest.Mock };

  const ctx = { userId: 'u1', ip: '127.0.0.1', userAgent: 'jest' };

  const fullCustomer = {
    id: 'cust1',
    companyId: 'co1',
    branchId: 'br1',
    code: 'C001',
    name: 'Acme',
    email: 'a@acme.test',
    phone: null,
    address: null,
    taxId: null,
    creditLimit: '1000',
    paymentTerms: 'net30',
    balance: '0',
    status: 'active',
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    drizzle = createDrizzleMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(CustomersService);
  });

  afterEach(() => drizzle.reset());

  describe('findPage', () => {
    it('returns data and total with search + filters applied', async () => {
      drizzle.queue([fullCustomer]); // data
      drizzle.queue([{ count: 1 }]); // count
      const res = await service.findPage({
        branchId: 'br1',
        companyId: 'co1',
        status: 'active',
        q: 'acme',
      });
      expect(res.data).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it('defaults total to 0 when count row missing', async () => {
      drizzle.queue([]);
      drizzle.queue([]);
      const res = await service.findPage({});
      expect(res.total).toBe(0);
    });
  });

  describe('findById', () => {
    it('returns the customer', async () => {
      drizzle.queue([fullCustomer]);
      await expect(service.findById('cust1', 'co1')).resolves.toMatchObject({ id: 'cust1' });
    });

    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('resolves company from branch->station, inserts, audits', async () => {
      drizzle.queue([{ id: 'br1', stationId: 'st1' }]); // branch
      drizzle.queue([{ companyId: 'co1' }]); // station
      drizzle.queue([fullCustomer]); // returning
      const res = await service.create(
        {
          branchId: 'br1',
          code: ' C001 ',
          name: ' Acme ',
          creditLimit: 1000,
          paymentTerms: 'net30',
        },
        ctx,
      );
      expect(res.id).toBe('cust1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'customers', action: 'create' }),
      );
    });

    it('throws NotFoundException when branch missing', async () => {
      drizzle.queue([]); // branch
      await expect(
        service.create(
          { branchId: 'x', code: 'C', name: 'N', creditLimit: 0, paymentTerms: 'net30' },
          ctx,
        ),
      ).rejects.toThrow('Branch not found');
    });

    it('throws NotFoundException when station missing', async () => {
      drizzle.queue([{ id: 'br1', stationId: 'st1' }]); // branch
      drizzle.queue([]); // station
      await expect(
        service.create(
          { branchId: 'br1', code: 'C', name: 'N', creditLimit: 0, paymentTerms: 'net30' },
          ctx,
        ),
      ).rejects.toThrow('Station not found');
    });
  });

  describe('update', () => {
    it('updates fields and audits before/after', async () => {
      drizzle.queue([fullCustomer]); // findById (before)
      drizzle.queue([{ ...fullCustomer, name: 'New Name' }]); // returning
      const res = await service.update('cust1', { name: ' New Name ', creditLimit: 2000 }, ctx);
      expect(res.name).toBe('New Name');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'customers', action: 'update' }),
      );
    });

    it('rejects a code change that collides with an existing customer', async () => {
      drizzle.queue([fullCustomer]); // findById (before, code C001)
      drizzle.queue([{ id: 'other' }]); // duplicate code lookup
      await expect(service.update('cust1', { code: 'C999' }, ctx)).rejects.toThrow(
        ConflictException,
      );
    });

    it('allows a code change when no collision exists', async () => {
      drizzle.queue([fullCustomer]); // findById
      drizzle.queue([]); // duplicate lookup -> none
      drizzle.queue([{ ...fullCustomer, code: 'C999' }]); // returning
      const res = await service.update('cust1', { code: 'C999' }, ctx);
      expect(res.code).toBe('C999');
    });

    it('throws NotFoundException when the customer does not exist', async () => {
      drizzle.queue([]); // findById -> none
      await expect(service.update('nope', { name: 'x' }, ctx)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes when there are no active invoices', async () => {
      drizzle.queue([fullCustomer]); // findById
      drizzle.queue([{ count: 0 }]); // dependency count
      await service.remove('cust1', ctx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'customers', action: 'delete' }),
      );
    });

    it('blocks deletion when active invoices exist', async () => {
      drizzle.queue([fullCustomer]); // findById
      drizzle.queue([{ count: 3 }]); // dependency count
      await expect(service.remove('cust1', ctx)).rejects.toThrow(BadRequestException);
    });
  });

  describe('softDelete', () => {
    it('soft-deletes and audits', async () => {
      drizzle.queue([fullCustomer]); // findById
      await service.softDelete('cust1', ctx);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'soft-delete' }),
      );
    });
  });

  describe('addNote / recordAction', () => {
    it('addNote verifies customer exists and logs note', async () => {
      drizzle.queue([fullCustomer]); // findById
      const res = await service.addNote('cust1', 'hello', ctx);
      expect(res.ok).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'customer_note', action: 'add-note' }),
      );
    });

    it('recordAction verifies customer exists and logs action', async () => {
      drizzle.queue([fullCustomer]); // findById
      const res = await service.recordAction('cust1', 'flag', { reason: 'late' }, ctx);
      expect(res).toEqual({ ok: true, action: 'flag' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'customer_action', action: 'flag' }),
      );
    });

    it('addNote throws when customer missing', async () => {
      drizzle.queue([]); // findById -> none
      await expect(service.addNote('nope', 'x', ctx)).rejects.toThrow(NotFoundException);
    });
  });
});
