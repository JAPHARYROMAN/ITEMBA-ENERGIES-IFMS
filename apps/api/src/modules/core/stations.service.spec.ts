import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { StationsService } from './stations.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };

describe('StationsService', () => {
  let service: StationsService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StationsService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(StationsService);
  });

  afterEach(() => drizzle.reset());

  it('findPage returns data and total', async () => {
    drizzle.queue([{ id: 'st1', code: 'ST-1' }]);
    drizzle.queue([{ count: 3 }]);
    const res = await service.findPage({ companyId: 'c1', q: 'ST' });
    expect(res.total).toBe(3);
  });

  it('findById throws NotFoundException when missing', async () => {
    drizzle.queue([]);
    await expect(service.findById('x')).rejects.toThrow(NotFoundException);
  });

  describe('create', () => {
    it('throws ConflictException when code exists in company', async () => {
      drizzle.queue([{ id: 'dup' }]); // assertCodeUniqueInCompany
      await expect(
        service.create({ companyId: 'c1', code: 'ST-1', name: 'Station' }, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('inserts and audits on success', async () => {
      drizzle.queue([]); // uniqueness ok
      const ins = { id: 'st9', companyId: 'c1', code: 'ST-9' };
      drizzle.queue([ins]); // returning
      const res = await service.create(
        { companyId: 'c1', code: ' ST-9 ', name: ' Station ', location: ' Town ' },
        { userId: 'u1' },
      );
      expect(res).toEqual(ins);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'stations', action: 'create' }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]); // findByIdOrNull
      await expect(service.update('x', { name: 'N' }, {})).rejects.toThrow(NotFoundException);
    });

    it('updates and audits when found', async () => {
      drizzle.queue([{ id: 'st1', companyId: 'c1', code: 'OLD' }]);
      const upd = { id: 'st1', code: 'OLD', name: 'New' };
      drizzle.queue([upd]);
      const res = await service.update('st1', { name: 'New' }, { userId: 'u1' });
      expect(res).toEqual(upd);
    });

    it('checks code uniqueness when code changes', async () => {
      drizzle.queue([{ id: 'st1', companyId: 'c1', code: 'OLD' }]);
      drizzle.queue([{ id: 'other' }]); // conflict
      await expect(service.update('st1', { code: 'TAKEN' }, {})).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.remove('x', {})).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes and audits when found', async () => {
      drizzle.queue([{ id: 'st1', code: 'ST-1' }]); // findByIdOrNull
      drizzle.queue([]); // update
      await service.remove('st1', { userId: 'u1' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'stations', action: 'delete' }),
      );
    });
  });

  describe('extra branch coverage', () => {
    it('findPage with no filters and ascending sort defaults total to 0', async () => {
      drizzle.queue([]);
      drizzle.queue([]); // count empty
      const res = await service.findPage({ sort: 'name:asc' });
      expect(res).toEqual({ data: [], total: 0 });
    });

    it('findById returns the row when found', async () => {
      const row = { id: 'st1', code: 'ST-1' };
      drizzle.queue([row]);
      await expect(service.findById('st1')).resolves.toEqual(row);
    });

    it('create defaults nullable fields and status', async () => {
      drizzle.queue([]); // uniqueness
      drizzle.queue([{ id: 'st9' }]);
      await service.create({ companyId: 'c1', code: 'ST', name: 'Station' }, {});
      const valuesArg = (drizzle.db.values as jest.Mock).mock.calls.at(-1)?.[0];
      expect(valuesArg).toMatchObject({ location: null, manager: null, status: 'active' });
    });

    it('create throws InternalServerErrorException when insert returns nothing', async () => {
      drizzle.queue([]);
      drizzle.queue([]); // returning empty
      await expect(service.create({ companyId: 'c1', code: 'ST', name: 'N' }, {})).rejects.toThrow('Insert failed');
    });

    it('create translates a pg unique violation into a ConflictException', async () => {
      drizzle.queue([]);
      const pgErr = Object.assign(new Error('dup'), { code: '23505' });
      (drizzle.db.returning as jest.Mock).mockReturnValueOnce(Promise.reject(pgErr));
      await expect(service.create({ companyId: 'c1', code: 'ST', name: 'N' }, {})).rejects.toThrow(ConflictException);
    });

    it('update applies every field and skips uniqueness when code unchanged', async () => {
      drizzle.queue([{ id: 'st1', companyId: 'c1', code: 'SAME' }]);
      const upd = { id: 'st1', code: 'SAME' };
      drizzle.queue([upd]);
      await service.update(
        'st1',
        { companyId: 'c2', code: 'SAME', name: ' N ', location: ' Town ', manager: ' Mgr ', status: 'inactive' },
        { userId: 'u1' },
      );
      const setArg = (drizzle.db.set as jest.Mock).mock.calls.at(-1)?.[0];
      expect(setArg).toMatchObject({ companyId: 'c2', code: 'SAME', name: 'N', location: 'Town', manager: 'Mgr', status: 'inactive', updatedBy: 'u1' });
    });

    it('trims provided location and manager values on update', async () => {
      drizzle.queue([{ id: 'st1', companyId: 'c1', code: 'OLD' }]);
      drizzle.queue([{ id: 'st1' }]);
      await service.update('st1', { location: '  Town  ', manager: '  Mgr  ' }, {});
      const setArg = (drizzle.db.set as jest.Mock).mock.calls.at(-1)?.[0];
      expect(setArg).toMatchObject({ location: 'Town', manager: 'Mgr' });
    });

    it('update throws NotFoundException when the write returns no row', async () => {
      drizzle.queue([{ id: 'st1', companyId: 'c1', code: 'OLD' }]);
      drizzle.queue([]); // returning empty
      await expect(service.update('st1', { name: 'x' }, {})).rejects.toThrow(NotFoundException);
    });

    it('update translates a pg unique violation into a ConflictException', async () => {
      drizzle.queue([{ id: 'st1', companyId: 'c1', code: 'OLD' }]);
      drizzle.queue([]); // uniqueness ok (code changed)
      const pgErr = Object.assign(new Error('dup'), { code: '23505' });
      (drizzle.db.returning as jest.Mock).mockReturnValueOnce(Promise.reject(pgErr));
      await expect(service.update('st1', { code: 'DUP' }, {})).rejects.toThrow(ConflictException);
    });
  });
});
