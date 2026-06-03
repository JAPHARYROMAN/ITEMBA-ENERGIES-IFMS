import { TanksController } from './tanks.controller';
import type { TanksService } from './tanks.service';

describe('TanksController', () => {
  let service: jest.Mocked<Pick<TanksService, 'findPage' | 'findById' | 'create' | 'update' | 'remove'>>;
  let controller: TanksController;

  beforeEach(() => {
    service = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new TanksController(service as unknown as TanksService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.1', headers: { 'user-agent': 'jest' } } as any;

  it('list returns envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 't1' } as any], total: 3 });
    const res = await controller.list({ page: 1, pageSize: 20, branchId: 'b1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'b1' }));
    expect(res.meta.total).toBe(3);
  });

  it('getById delegates', async () => {
    const tank = { id: 't1' } as any;
    service.findById.mockResolvedValue(tank);
    await expect(controller.getById('t1', 'c1')).resolves.toBe(tank);
    expect(service.findById).toHaveBeenCalledWith('t1', 'c1');
  });

  it('create forwards dto and audit context', async () => {
    const created = { id: 't9' } as any;
    service.create.mockResolvedValue(created);
    const dto = { companyId: 'c1', branchId: 'b1', code: 'T-9', capacity: 1000, maxLevel: 950 } as any;
    await expect(controller.create(dto, user, req)).resolves.toBe(created);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', branchId: 'b1', code: 'T-9' }),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('update delegates', async () => {
    const updated = { id: 't1' } as any;
    service.update.mockResolvedValue(updated);
    await expect(controller.update('t1', { status: 'inactive' } as any, user, req)).resolves.toBe(
      updated,
    );
  });

  it('delete delegates', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.delete('t1', user, req);
    expect(service.remove).toHaveBeenCalledWith('t1', expect.objectContaining({ userId: 'u1' }));
  });
});
