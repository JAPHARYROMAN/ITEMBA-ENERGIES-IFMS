import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TanksService } from './tanks.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from './__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };

describe('TanksService', () => {
  let service: TanksService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TanksService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(TanksService);
  });

  afterEach(() => drizzle.reset());

  describe('findPage', () => {
    it('returns data and total', async () => {
      const rows = [{ id: 't1', code: 'T-01' }];
      drizzle.queue(rows);
      drizzle.queue([{ count: 4 }]);
      const res = await service.findPage({ companyId: 'c1', branchId: 'b1', q: 'T' });
      expect(res.data).toEqual(rows);
      expect(res.total).toBe(4);
    });
  });

  describe('findById', () => {
    it('returns tank when found', async () => {
      const row = { id: 't1', companyId: 'c1', code: 'T-01' };
      drizzle.queue([row]);
      await expect(service.findById('t1', 'c1')).resolves.toEqual(row);
    });
    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.findById('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('inserts a tank and audits', async () => {
      drizzle.queue([]); // uniqueness check
      const ins = { id: 't9', companyId: 'c1', branchId: 'b1', code: 'T-09' };
      drizzle.queue([ins]); // returning
      const res = await service.create(
        { companyId: 'c1', branchId: 'b1', code: ' T-09 ', capacity: 1000, maxLevel: 950 },
        { userId: 'u1' },
      );
      expect(res).toEqual(ins);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'tanks', action: 'create' }),
      );
    });

    it('throws ConflictException when code exists in branch', async () => {
      drizzle.queue([{ id: 'dup' }]); // uniqueness check finds row
      await expect(
        service.create(
          { companyId: 'c1', branchId: 'b1', code: 'T-01', capacity: 1, maxLevel: 1 },
          {},
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when tank missing', async () => {
      drizzle.queue([]); // findByIdOrNull
      await expect(service.update('x', { status: 'inactive' }, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates and audits when found', async () => {
      drizzle.queue([{ id: 't1', companyId: 'c1', branchId: 'b1', code: 'OLD' }]);
      const upd = { id: 't1', code: 'OLD', status: 'inactive' };
      drizzle.queue([upd]);
      const res = await service.update('t1', { status: 'inactive' }, { userId: 'u1' });
      expect(res).toEqual(upd);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'tanks', action: 'update' }),
      );
    });

    it('rejects duplicate code on update', async () => {
      drizzle.queue([{ id: 't1', companyId: 'c1', branchId: 'b1', code: 'OLD' }]);
      drizzle.queue([{ id: 'other' }]); // uniqueness conflict
      await expect(service.update('t1', { code: 'TAKEN' }, {})).rejects.toThrow(ConflictException);
    });
  });

  describe('findPage extra branches', () => {
    it('returns empty result with no filters and ascending sort', async () => {
      drizzle.queue([]); // data
      drizzle.queue([]); // count empty -> total 0
      const res = await service.findPage({ sort: 'code:asc' });
      expect(res).toEqual({ data: [], total: 0 });
    });
  });

  describe('findById without companyId', () => {
    it('returns the row when found and no company scope supplied', async () => {
      const row = { id: 't1', code: 'T-01' };
      drizzle.queue([row]);
      await expect(service.findById('t1')).resolves.toEqual(row);
    });
  });

  describe('create extra branches', () => {
    it('throws InternalServerErrorException when insert returns nothing', async () => {
      drizzle.queue([]); // uniqueness ok
      drizzle.queue([]); // returning empty
      await expect(
        service.create({ companyId: 'c1', branchId: 'b1', code: 'T', capacity: 1, maxLevel: 1 }, {}),
      ).rejects.toThrow('Insert failed');
    });

    it('translates a pg unique violation into a ConflictException', async () => {
      drizzle.queue([]); // uniqueness ok
      const pgErr = Object.assign(new Error('dup'), { code: '23505' });
      (drizzle.db.returning as jest.Mock).mockReturnValueOnce(Promise.reject(pgErr));
      await expect(
        service.create({ companyId: 'c1', branchId: 'b1', code: 'T', capacity: 1, maxLevel: 1 }, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows non-unique-violation insert errors', async () => {
      drizzle.queue([]);
      (drizzle.db.returning as jest.Mock).mockReturnValueOnce(Promise.reject(new Error('boom')));
      await expect(
        service.create({ companyId: 'c1', branchId: 'b1', code: 'T', capacity: 1, maxLevel: 1 }, {}),
      ).rejects.toThrow('boom');
    });

    it('applies defaults for optional numeric and nullable fields', async () => {
      drizzle.queue([]); // uniqueness ok
      drizzle.queue([{ id: 't9' }]); // returning
      await service.create({ companyId: 'c1', branchId: 'b1', code: 'T', capacity: 1000, maxLevel: 900 }, {});
      const valuesArg = (drizzle.db.values as jest.Mock).mock.calls.at(-1)?.[0];
      expect(valuesArg).toMatchObject({
        productId: null,
        minLevel: '0',
        currentLevel: '0',
        calibrationProfile: null,
        status: 'active',
      });
    });

    it('passes through explicit optional fields', async () => {
      drizzle.queue([]);
      drizzle.queue([{ id: 't9' }]);
      await service.create(
        { companyId: 'c1', branchId: 'b1', productId: 'p1', code: 'T', capacity: 1000, minLevel: 10, maxLevel: 900, currentLevel: 500, calibrationProfile: 'cal', status: 'inactive' },
        {},
      );
      const valuesArg = (drizzle.db.values as jest.Mock).mock.calls.at(-1)?.[0];
      expect(valuesArg).toMatchObject({
        productId: 'p1', minLevel: '10', currentLevel: '500', calibrationProfile: 'cal', status: 'inactive',
      });
    });
  });

  describe('update extra branches', () => {
    it('applies every field and skips the uniqueness check when code is unchanged', async () => {
      drizzle.queue([{ id: 't1', companyId: 'c1', branchId: 'b1', code: 'SAME' }]);
      const upd = { id: 't1', code: 'SAME' };
      drizzle.queue([upd]); // returning (no uniqueness select consumed)
      const res = await service.update(
        't1',
        { companyId: 'c2', branchId: 'b2', productId: 'p2', code: 'SAME', capacity: 1, minLevel: 2, maxLevel: 3, currentLevel: 4, calibrationProfile: 'cal', status: 'inactive' },
        { userId: 'u1' },
      );
      const setArg = (drizzle.db.set as jest.Mock).mock.calls.at(-1)?.[0];
      expect(setArg).toMatchObject({ companyId: 'c2', branchId: 'b2', productId: 'p2', code: 'SAME', capacity: '1', minLevel: '2', maxLevel: '3', currentLevel: '4', calibrationProfile: 'cal', status: 'inactive', updatedBy: 'u1' });
      expect(res).toEqual(upd);
    });

    it('throws NotFoundException when the update returns no row', async () => {
      drizzle.queue([{ id: 't1', companyId: 'c1', branchId: 'b1', code: 'OLD' }]);
      drizzle.queue([]); // returning empty
      await expect(service.update('t1', { status: 'inactive' }, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.remove('x', {})).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when tank has active nozzles', async () => {
      drizzle.queue([{ id: 't1', code: 'T-01' }]); // findByIdOrNull
      drizzle.queue([{ count: 2 }]); // nozzle dependency
      await expect(service.remove('t1', {})).rejects.toThrow(BadRequestException);
    });

    it('soft-deletes and audits when no dependencies', async () => {
      drizzle.queue([{ id: 't1', code: 'T-01' }]);
      drizzle.queue([{ count: 0 }]);
      drizzle.queue([]); // update
      await service.remove('t1', { userId: 'u1' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'tanks', action: 'delete' }),
      );
    });
  });
});
