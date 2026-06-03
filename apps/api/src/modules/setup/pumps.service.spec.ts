import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PumpsService } from './pumps.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from './__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };

describe('PumpsService', () => {
  let service: PumpsService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PumpsService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(PumpsService);
  });

  afterEach(() => drizzle.reset());

  it('findPage returns data and total', async () => {
    drizzle.queue([{ id: 'p1', code: 'PUMP-1' }]);
    drizzle.queue([{ count: 2 }]);
    const res = await service.findPage({ stationId: 's1', q: 'PUMP' });
    expect(res.total).toBe(2);
    expect(res.data).toHaveLength(1);
  });

  it('findById throws NotFoundException when missing', async () => {
    drizzle.queue([]);
    await expect(service.findById('x')).rejects.toThrow(NotFoundException);
  });

  it('create inserts and audits', async () => {
    drizzle.queue([]); // uniqueness
    const ins = { id: 'p9', stationId: 's1', code: 'PUMP-9' };
    drizzle.queue([ins]);
    const res = await service.create({ stationId: 's1', code: ' PUMP-9 ', name: 'Pump 9' }, { userId: 'u1' });
    expect(res).toEqual(ins);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'pumps', action: 'create' }),
    );
  });

  it('create throws ConflictException on duplicate code', async () => {
    drizzle.queue([{ id: 'dup' }]);
    await expect(service.create({ stationId: 's1', code: 'PUMP-1' }, {})).rejects.toThrow(
      ConflictException,
    );
  });

  it('update throws NotFoundException when missing', async () => {
    drizzle.queue([]);
    await expect(service.update('x', { status: 'inactive' }, {})).rejects.toThrow(NotFoundException);
  });

  it('update succeeds when found', async () => {
    drizzle.queue([{ id: 'p1', stationId: 's1', code: 'OLD' }]);
    const upd = { id: 'p1', code: 'OLD', status: 'inactive' };
    drizzle.queue([upd]);
    const res = await service.update('p1', { status: 'inactive' }, { userId: 'u1' });
    expect(res).toEqual(upd);
  });

  it('remove throws NotFoundException when missing', async () => {
    drizzle.queue([]);
    await expect(service.remove('x', {})).rejects.toThrow(NotFoundException);
  });

  it('remove soft-deletes and audits', async () => {
    drizzle.queue([{ id: 'p1', code: 'PUMP-1' }]);
    drizzle.queue([]); // update
    await service.remove('p1', { userId: 'u1' });
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'pumps', action: 'delete' }),
    );
  });
});
