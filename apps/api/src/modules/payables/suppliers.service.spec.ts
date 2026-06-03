import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };

describe('SuppliersService', () => {
  let service: SuppliersService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(SuppliersService);
  });

  afterEach(() => drizzle.reset());

  const ctx = { userId: 'u1' };

  describe('findPage', () => {
    it('returns data and total, applying filters', async () => {
      drizzle.queue([{ id: 's1' }]);
      drizzle.queue([{ count: 7 }]);
      const res = await service.findPage({ companyId: 'c1', status: 'active', q: 'shell' });
      expect(res.total).toBe(7);
      expect(res.data).toEqual([{ id: 's1' }]);
    });

    it('defaults total to 0 when count missing', async () => {
      drizzle.queue([]);
      drizzle.queue([]);
      const res = await service.findPage({});
      expect(res.total).toBe(0);
    });
  });

  describe('findById', () => {
    it('returns the supplier', async () => {
      drizzle.queue([{ id: 's1', name: 'Acme' }]);
      await expect(service.findById('s1', 'c1')).resolves.toEqual({ id: 's1', name: 'Acme' });
    });

    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.findById('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('inserts, audits and returns the supplier', async () => {
      const row = { id: 's1', code: 'SUP1' };
      drizzle.queue([row]);
      const res = await service.create({ companyId: 'c1', code: ' SUP1 ', name: ' Acme ' }, ctx);
      expect(res).toEqual(row);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'suppliers', action: 'create' }),
      );
    });

    it('maps a unique-violation into a ConflictException', async () => {
      drizzle.db.returning.mockRejectedValueOnce(
        Object.assign(new Error('dup'), { code: '23505' }),
      );
      await expect(
        service.create({ companyId: 'c1', code: 'SUP1', name: 'Acme' }, ctx),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates without code change and audits', async () => {
      drizzle.queue([{ id: 's1', companyId: 'c1', code: 'SUP1' }]); // findById (before)
      drizzle.queue([{ id: 's1', name: 'New' }]); // update returning
      const res = await service.update('s1', { name: 'New' }, ctx);
      expect(res).toEqual({ id: 's1', name: 'New' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'suppliers', action: 'update' }),
      );
    });

    it('throws ConflictException when changing code to an existing one', async () => {
      drizzle.queue([{ id: 's1', companyId: 'c1', code: 'OLD' }]); // before
      drizzle.queue([{ id: 'other' }]); // existing code lookup -> conflict
      await expect(service.update('s1', { code: 'TAKEN' }, ctx)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when update returns nothing', async () => {
      drizzle.queue([{ id: 's1', companyId: 'c1', code: 'SUP1' }]); // before
      drizzle.queue([]); // update returning -> empty
      await expect(service.update('s1', { name: 'X' }, ctx)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes when there are no active invoices', async () => {
      drizzle.queue([{ id: 's1', companyId: 'c1', code: 'SUP1' }]); // findById
      drizzle.queue([{ count: 0 }]); // dependency count
      await service.remove('s1', ctx);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'suppliers', action: 'delete' }),
      );
    });

    it('throws BadRequestException when supplier has active invoices', async () => {
      drizzle.queue([{ id: 's1', companyId: 'c1', code: 'SUP1' }]);
      drizzle.queue([{ count: 3 }]);
      await expect(service.remove('s1', ctx)).rejects.toThrow(BadRequestException);
    });
  });
});
