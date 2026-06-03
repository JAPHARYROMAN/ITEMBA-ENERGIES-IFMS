import { NozzlesController } from './nozzles.controller';
import type { NozzlesService } from './nozzles.service';

describe('NozzlesController', () => {
  let service: jest.Mocked<Pick<NozzlesService, 'findPage' | 'findById' | 'create' | 'update' | 'remove'>>;
  let controller: NozzlesController;

  beforeEach(() => {
    service = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new NozzlesController(service as unknown as NozzlesService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.3', headers: { 'user-agent': 'jest' } } as any;

  it('list returns envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'n1' } as any], total: 1 });
    const res = await controller.list({ page: 1, pageSize: 10, stationId: 's1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ stationId: 's1' }));
    expect(res.meta.total).toBe(1);
  });

  it('getById delegates', async () => {
    const nozzle = { id: 'n1' } as any;
    service.findById.mockResolvedValue(nozzle);
    await expect(controller.getById('n1')).resolves.toBe(nozzle);
    expect(service.findById).toHaveBeenCalledWith('n1');
  });

  it('create forwards dto', async () => {
    const created = { id: 'n9' } as any;
    service.create.mockResolvedValue(created);
    const dto = { stationId: 's1', pumpId: 'p1', tankId: 't1', productId: 'pr1', code: 'NZ-9' } as any;
    await expect(controller.create(dto, user, req)).resolves.toBe(created);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ stationId: 's1', pumpId: 'p1', code: 'NZ-9' }),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('update delegates', async () => {
    service.update.mockResolvedValue({ id: 'n1' } as any);
    await controller.update('n1', { status: 'inactive' } as any, user, req);
    expect(service.update).toHaveBeenCalledWith(
      'n1',
      { status: 'inactive' },
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('delete delegates', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.delete('n1', user, req);
    expect(service.remove).toHaveBeenCalledWith('n1', expect.objectContaining({ userId: 'u1' }));
  });
});
