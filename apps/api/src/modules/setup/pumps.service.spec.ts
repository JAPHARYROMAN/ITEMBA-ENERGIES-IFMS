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

  it('findPage with no filters and ascending sort defaults total to 0', async () => {
    drizzle.queue([]); // data
    drizzle.queue([]); // count empty
    const res = await service.findPage({ sort: 'name:asc' });
    expect(res).toEqual({ data: [], total: 0 });
  });

  it('findById returns the row when found', async () => {
    const row = { id: 'p1', code: 'PUMP-1' };
    drizzle.queue([row]);
    await expect(service.findById('p1')).resolves.toEqual(row);
  });

  it('create defaults name to null and status to active', async () => {
    drizzle.queue([]); // uniqueness
    drizzle.queue([{ id: 'p9' }]);
    await service.create({ stationId: 's1', code: 'P' }, {});
    const valuesArg = (drizzle.db.values as jest.Mock).mock.calls.at(-1)?.[0];
    expect(valuesArg).toMatchObject({ name: null, status: 'active' });
  });

  it('create throws InternalServerErrorException when insert returns nothing', async () => {
    drizzle.queue([]); // uniqueness ok
    drizzle.queue([]); // returning empty
    await expect(service.create({ stationId: 's1', code: 'P' }, {})).rejects.toThrow('Insert failed');
  });

  it('create translates a pg unique violation into a ConflictException', async () => {
    drizzle.queue([]);
    const pgErr = Object.assign(new Error('dup'), { code: '23505' });
    (drizzle.db.returning as jest.Mock).mockReturnValueOnce(Promise.reject(pgErr));
    await expect(service.create({ stationId: 's1', code: 'P' }, {})).rejects.toThrow(ConflictException);
  });

  it('update applies all fields and skips uniqueness when code unchanged', async () => {
    drizzle.queue([{ id: 'p1', stationId: 's1', code: 'SAME' }]);
    const upd = { id: 'p1', code: 'SAME' };
    drizzle.queue([upd]);
    await service.update('p1', { stationId: 's2', code: 'SAME', name: ' Pump ', status: 'inactive' }, { userId: 'u1' });
    const setArg = (drizzle.db.set as jest.Mock).mock.calls.at(-1)?.[0];
    expect(setArg).toMatchObject({ stationId: 's2', code: 'SAME', name: 'Pump', status: 'inactive', updatedBy: 'u1' });
  });

  it('update throws ConflictException when the new code collides', async () => {
    drizzle.queue([{ id: 'p1', stationId: 's1', code: 'OLD' }]);
    drizzle.queue([{ id: 'other' }]);
    await expect(service.update('p1', { code: 'TAKEN' }, {})).rejects.toThrow(ConflictException);
  });

  it('update throws NotFoundException when the write returns no row', async () => {
    drizzle.queue([{ id: 'p1', stationId: 's1', code: 'OLD' }]);
    drizzle.queue([]); // returning empty
    await expect(service.update('p1', { status: 'inactive' }, {})).rejects.toThrow(NotFoundException);
  });
});
