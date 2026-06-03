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
});
