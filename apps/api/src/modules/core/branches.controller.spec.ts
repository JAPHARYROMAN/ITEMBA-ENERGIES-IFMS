import { BranchesController } from './branches.controller';
import type { BranchesService } from './branches.service';

describe('BranchesController', () => {
  let service: jest.Mocked<Pick<BranchesService, 'findPage' | 'findById' | 'create' | 'update' | 'remove'>>;
  let controller: BranchesController;

  beforeEach(() => {
    service = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new BranchesController(service as unknown as BranchesService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.7', headers: { 'user-agent': 'jest' } } as any;

  it('list returns envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'br1' } as any], total: 1 });
    const res = await controller.list({ page: 1, pageSize: 10, stationId: 's1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ stationId: 's1' }));
    expect(res.meta.total).toBe(1);
  });

  it('getById delegates', async () => {
    const branch = { id: 'br1' } as any;
    service.findById.mockResolvedValue(branch);
    await expect(controller.getById('br1')).resolves.toBe(branch);
  });

  it('create forwards dto', async () => {
    service.create.mockResolvedValue({ id: 'br9' } as any);
    await controller.create({ stationId: 's1', code: 'BR-9', name: 'B' } as any, user, req);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ stationId: 's1', code: 'BR-9' }),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('update delegates', async () => {
    service.update.mockResolvedValue({ id: 'br1' } as any);
    await controller.update('br1', { name: 'N' } as any, user, req);
    expect(service.update).toHaveBeenCalledWith('br1', { name: 'N' }, expect.objectContaining({ userId: 'u1' }));
  });

  it('delete delegates', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.delete('br1', user, req);
    expect(service.remove).toHaveBeenCalledWith('br1', expect.objectContaining({ userId: 'u1' }));
  });
});
