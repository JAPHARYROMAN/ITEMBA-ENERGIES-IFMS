import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from '../setup/__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };

describe('BranchesService', () => {
  let service: BranchesService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(BranchesService);
  });

  afterEach(() => drizzle.reset());

  it('findPage returns data and total', async () => {
    drizzle.queue([{ id: 'br1', code: 'BR-1' }]);
    drizzle.queue([{ count: 2 }]);
    const res = await service.findPage({ stationId: 's1', q: 'BR' });
    expect(res.total).toBe(2);
  });

  it('findById throws NotFoundException when missing', async () => {
    drizzle.queue([]);
    await expect(service.findById('x')).rejects.toThrow(NotFoundException);
  });

  describe('create', () => {
    it('throws ConflictException when code exists in station', async () => {
      drizzle.queue([{ id: 'dup' }]); // assertCodeUniqueInStation finds row
      await expect(
        service.create({ stationId: 's1', code: 'BR-1', name: 'Branch' }, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when station missing', async () => {
      drizzle.queue([]); // uniqueness ok
      drizzle.queue([]); // station lookup -> none
      await expect(
        service.create({ stationId: 's1', code: 'BR-9', name: 'Branch' }, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('inserts and audits on success', async () => {
      drizzle.queue([]); // uniqueness ok
      drizzle.queue([{ companyId: 'c1' }]); // station lookup
      const ins = { id: 'br9', stationId: 's1', code: 'BR-9' };
      drizzle.queue([ins]); // returning
      const res = await service.create({ stationId: 's1', code: ' BR-9 ', name: ' Branch ' }, { userId: 'u1' });
      expect(res).toEqual(ins);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'branches', action: 'create' }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]); // findByIdOrNull
      await expect(service.update('x', { name: 'N' }, {})).rejects.toThrow(NotFoundException);
    });

    it('updates and audits when found', async () => {
      drizzle.queue([{ id: 'br1', stationId: 's1', code: 'OLD' }]);
      const upd = { id: 'br1', code: 'OLD', name: 'New' };
      drizzle.queue([upd]);
      const res = await service.update('br1', { name: 'New' }, { userId: 'u1' });
      expect(res).toEqual(upd);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when missing', async () => {
      drizzle.queue([]);
      await expect(service.remove('x', {})).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when branch has active tanks', async () => {
      drizzle.queue([{ id: 'br1', code: 'BR-1' }]); // findByIdOrNull
      drizzle.queue([{ count: 1 }]); // tanks dependency
      await expect(service.remove('br1', {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when branch has active customers', async () => {
      drizzle.queue([{ id: 'br1', code: 'BR-1' }]);
      drizzle.queue([{ count: 0 }]); // no tanks
      drizzle.queue([{ count: 2 }]); // customers dependency
      await expect(service.remove('br1', {})).rejects.toThrow(BadRequestException);
    });

    it('soft-deletes and audits when no dependencies', async () => {
      drizzle.queue([{ id: 'br1', code: 'BR-1' }]);
      drizzle.queue([{ count: 0 }]);
      drizzle.queue([{ count: 0 }]);
      drizzle.queue([]); // update
      await service.remove('br1', { userId: 'u1' });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'branches', action: 'delete' }),
      );
    });
  });
});
