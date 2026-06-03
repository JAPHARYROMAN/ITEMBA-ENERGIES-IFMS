import { PumpsController } from './pumps.controller';
import type { PumpsService } from './pumps.service';

describe('PumpsController', () => {
  let service: jest.Mocked<Pick<PumpsService, 'findPage' | 'findById' | 'create' | 'update' | 'remove'>>;
  let controller: PumpsController;

  beforeEach(() => {
    service = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new PumpsController(service as unknown as PumpsService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.2', headers: { 'user-agent': 'jest' } } as any;

  it('list returns envelope', async () => {
    service.findPage.mockResolvedValue({ data: [], total: 0 });
    const res = await controller.list({ page: 1, pageSize: 10, stationId: 's1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ stationId: 's1' }));
    expect(res.meta.total).toBe(0);
  });

  it('getById delegates', async () => {
    const pump = { id: 'p1' } as any;
    service.findById.mockResolvedValue(pump);
    await expect(controller.getById('p1')).resolves.toBe(pump);
    expect(service.findById).toHaveBeenCalledWith('p1');
  });

  it('create forwards dto', async () => {
    const created = { id: 'p9' } as any;
    service.create.mockResolvedValue(created);
    await expect(
      controller.create({ stationId: 's1', code: 'PUMP-9', name: 'P9' } as any, user, req),
    ).resolves.toBe(created);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ stationId: 's1', code: 'PUMP-9' }),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('update delegates', async () => {
    service.update.mockResolvedValue({ id: 'p1' } as any);
    await controller.update('p1', { status: 'inactive' } as any, user, req);
    expect(service.update).toHaveBeenCalledWith(
      'p1',
      { status: 'inactive' },
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('delete delegates', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.delete('p1', user, req);
    expect(service.remove).toHaveBeenCalledWith('p1', expect.objectContaining({ userId: 'u1' }));
  });
});
