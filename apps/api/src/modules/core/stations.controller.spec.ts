import { StationsController } from './stations.controller';
import type { StationsService } from './stations.service';

describe('StationsController', () => {
  let service: jest.Mocked<Pick<StationsService, 'findPage' | 'findById' | 'create' | 'update' | 'remove'>>;
  let controller: StationsController;

  beforeEach(() => {
    service = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new StationsController(service as unknown as StationsService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.6', headers: { 'user-agent': 'jest' } } as any;

  it('list returns envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'st1' } as any], total: 1 });
    const res = await controller.list({ page: 1, pageSize: 10, companyId: 'c1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1' }));
    expect(res.meta.total).toBe(1);
  });

  it('getById delegates', async () => {
    const station = { id: 'st1' } as any;
    service.findById.mockResolvedValue(station);
    await expect(controller.getById('st1')).resolves.toBe(station);
  });

  it('create forwards dto', async () => {
    service.create.mockResolvedValue({ id: 'st9' } as any);
    await controller.create({ companyId: 'c1', code: 'ST-9', name: 'S' } as any, user, req);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', code: 'ST-9' }),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('update delegates', async () => {
    service.update.mockResolvedValue({ id: 'st1' } as any);
    await controller.update('st1', { name: 'N' } as any, user, req);
    expect(service.update).toHaveBeenCalledWith('st1', { name: 'N' }, expect.objectContaining({ userId: 'u1' }));
  });

  it('delete delegates', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.delete('st1', user, req);
    expect(service.remove).toHaveBeenCalledWith('st1', expect.objectContaining({ userId: 'u1' }));
  });
});
