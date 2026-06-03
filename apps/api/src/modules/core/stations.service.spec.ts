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
});
