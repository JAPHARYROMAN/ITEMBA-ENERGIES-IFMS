import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { NozzlesService } from './nozzles.service';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { createDrizzleMock, DrizzleMock } from './__testutils__/drizzle-mock';

const mockAudit = { log: jest.fn() };

describe('NozzlesService', () => {
  let service: NozzlesService;
  let drizzle: DrizzleMock;

  beforeEach(async () => {
    mockAudit.log.mockClear();
    drizzle = createDrizzleMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NozzlesService,
        { provide: DRIZZLE, useValue: drizzle.db },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(NozzlesService);
  });

  afterEach(() => drizzle.reset());

  it('findPage returns data and total', async () => {
    drizzle.queue([{ id: 'n1', code: 'NZ-1' }]);
    drizzle.queue([{ count: 1 }]);
    const res = await service.findPage({ stationId: 's1' });
    expect(res.total).toBe(1);
  });

  it('findById throws NotFoundException when missing', async () => {
    drizzle.queue([]);
    await expect(service.findById('x')).rejects.toThrow(NotFoundException);
  });

  const validCreate = {
    stationId: 's1',
    pumpId: 'pump1',
    tankId: 'tank1',
    productId: 'prod1',
    code: 'NZ-9',
  };

  it('create validates pump existence', async () => {
    drizzle.queue([]); // pump lookup -> not found
    await expect(service.create(validCreate, {})).rejects.toThrow(NotFoundException);
  });

  it('create validates tank existence', async () => {
    drizzle.queue([{ id: 'pump1' }]); // pump found
    drizzle.queue([]); // tank not found
    await expect(service.create(validCreate, {})).rejects.toThrow(NotFoundException);
  });

  it('create validates product existence', async () => {
    drizzle.queue([{ id: 'pump1' }]);
    drizzle.queue([{ id: 'tank1' }]);
    drizzle.queue([]); // product not found
    await expect(service.create(validCreate, {})).rejects.toThrow(NotFoundException);
  });

  it('create throws ConflictException when code exists', async () => {
    drizzle.queue([{ id: 'pump1' }]);
    drizzle.queue([{ id: 'tank1' }]);
    drizzle.queue([{ id: 'prod1' }]);
    drizzle.queue([{ id: 'dup' }]); // uniqueness conflict
    await expect(service.create(validCreate, {})).rejects.toThrow(ConflictException);
  });

  it('create inserts and audits on success', async () => {
    drizzle.queue([{ id: 'pump1' }]);
    drizzle.queue([{ id: 'tank1' }]);
    drizzle.queue([{ id: 'prod1' }]);
    drizzle.queue([]); // no existing code
    const ins = { id: 'n9', code: 'NZ-9' };
    drizzle.queue([ins]); // returning
    const res = await service.create(validCreate, { userId: 'u1' });
    expect(res).toEqual(ins);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'nozzles', action: 'create' }),
    );
  });

  it('update throws NotFoundException when missing', async () => {
    drizzle.queue([]);
    await expect(service.update('x', { status: 'inactive' }, {})).rejects.toThrow(NotFoundException);
  });

  it('remove soft-deletes and audits', async () => {
    drizzle.queue([{ id: 'n1', code: 'NZ-1' }]);
    drizzle.queue([]); // update
    await service.remove('n1', { userId: 'u1' });
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'nozzles', action: 'delete' }),
    );
  });

  it('findPage with no filters and ascending sort defaults total to 0', async () => {
    drizzle.queue([]); // data
    drizzle.queue([]); // count -> empty, so cr[0]?.count ?? 0
    const res = await service.findPage({ sort: 'code:asc' });
    expect(res.total).toBe(0);
    expect(res.data).toEqual([]);
  });

  it('findPage applies the q filter (single-condition branch falls away)', async () => {
    drizzle.queue([{ id: 'n1' }]);
    drizzle.queue([{ count: 1 }]);
    const res = await service.findPage({ q: 'NZ' });
    expect(res.total).toBe(1);
  });

  it('findById returns the row when found', async () => {
    const row = { id: 'n1', code: 'NZ-1', stationId: 's1' };
    drizzle.queue([row]);
    await expect(service.findById('n1')).resolves.toEqual(row);
  });

  it('create throws InternalServerErrorException when insert returns nothing', async () => {
    drizzle.queue([{ id: 'pump1' }]);
    drizzle.queue([{ id: 'tank1' }]);
    drizzle.queue([{ id: 'prod1' }]);
    drizzle.queue([]); // no existing code
    drizzle.queue([]); // returning empty
    await expect(service.create(validCreate, {})).rejects.toThrow('Insert failed');
  });

  it('create translates a pg unique violation into a ConflictException', async () => {
    drizzle.queue([{ id: 'pump1' }]);
    drizzle.queue([{ id: 'tank1' }]);
    drizzle.queue([{ id: 'prod1' }]);
    drizzle.queue([]); // no existing code
    const pgErr = Object.assign(new Error('dup'), { code: '23505' });
    (drizzle.db.returning as jest.Mock).mockReturnValueOnce(Promise.reject(pgErr));
    await expect(service.create(validCreate, {})).rejects.toThrow(ConflictException);
  });

  it('create defaults status to active when omitted', async () => {
    drizzle.queue([{ id: 'pump1' }]);
    drizzle.queue([{ id: 'tank1' }]);
    drizzle.queue([{ id: 'prod1' }]);
    drizzle.queue([]);
    const ins = { id: 'n9', code: 'NZ-9', status: 'active' };
    drizzle.queue([ins]);
    const res = await service.create(validCreate, {});
    const valuesArg = (drizzle.db.values as jest.Mock).mock.calls.at(-1)?.[0];
    expect(valuesArg).toMatchObject({ status: 'active', code: 'NZ-9' });
    expect(res).toEqual(ins);
  });

  it('update applies every field, trims the code, and audits', async () => {
    drizzle.queue([{ id: 'n1', code: 'OLD', stationId: 's1' }]); // findByIdOrNull
    drizzle.queue([]); // uniqueness check (code changed) -> none
    const upd = { id: 'n1', code: 'NEW' };
    drizzle.queue([upd]); // returning
    const res = await service.update(
      'n1',
      { stationId: 's2', pumpId: 'p2', tankId: 't2', productId: 'pr2', code: '  NEW  ', status: 'inactive' },
      { userId: 'u1' },
    );
    const setArg = (drizzle.db.set as jest.Mock).mock.calls.at(-1)?.[0];
    expect(setArg).toMatchObject({ stationId: 's2', pumpId: 'p2', tankId: 't2', productId: 'pr2', code: 'NEW', status: 'inactive', updatedBy: 'u1' });
    expect(res).toEqual(upd);
  });

  it('update throws ConflictException when the new code collides in the station', async () => {
    drizzle.queue([{ id: 'n1', code: 'OLD', stationId: 's1' }]);
    drizzle.queue([{ id: 'other' }]); // collision
    await expect(service.update('n1', { code: 'TAKEN' }, {})).rejects.toThrow(ConflictException);
  });

  it('update skips the uniqueness check when the code is unchanged', async () => {
    drizzle.queue([{ id: 'n1', code: 'SAME', stationId: 's1' }]);
    const upd = { id: 'n1', code: 'SAME' };
    drizzle.queue([upd]); // returning (no uniqueness select consumed)
    const res = await service.update('n1', { code: 'SAME' }, {});
    expect(res).toEqual(upd);
  });

  it('update throws NotFoundException when the row vanished before the write', async () => {
    drizzle.queue([{ id: 'n1', code: 'OLD', stationId: 's1' }]);
    drizzle.queue([]); // returning empty
    await expect(service.update('n1', { status: 'inactive' }, {})).rejects.toThrow(NotFoundException);
  });

  it('remove throws NotFoundException when the nozzle is missing', async () => {
    drizzle.queue([]);
    await expect(service.remove('x', {})).rejects.toThrow(NotFoundException);
  });
});
