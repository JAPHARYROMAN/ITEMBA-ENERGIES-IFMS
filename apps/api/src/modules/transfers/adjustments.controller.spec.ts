import { AdjustmentsController } from './adjustments.controller';
import type { AdjustmentsService } from './adjustments.service';

describe('AdjustmentsController', () => {
  let service: jest.Mocked<Pick<AdjustmentsService, 'create' | 'findPage' | 'findById'>>;
  let controller: AdjustmentsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findPage: jest.fn(),
      findById: jest.fn(),
    };
    controller = new AdjustmentsController(service as unknown as AdjustmentsService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.8', headers: { 'user-agent': 'jest' } } as any;

  it('create forwards dto and audit context', async () => {
    const created = { id: 'adj1' } as any;
    service.create.mockResolvedValue(created);
    const dto = { branchId: 'b1', tankId: 't1', volumeDelta: 5, reason: 'x' } as any;
    await expect(controller.create(dto, user, req)).resolves.toBe(created);
    expect(service.create).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({ userId: 'u1', ip: '10.0.0.8', userAgent: 'jest' }),
    );
  });

  it('list returns envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'adj1' } as any], total: 1 });
    const res = await controller.list({ page: 1, pageSize: 10, tankId: 't1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ tankId: 't1' }));
    expect(res.meta.total).toBe(1);
  });

  it('getById delegates', async () => {
    const adj = { id: 'adj1' } as any;
    service.findById.mockResolvedValue(adj);
    await expect(controller.getById('adj1')).resolves.toBe(adj);
    expect(service.findById).toHaveBeenCalledWith('adj1');
  });
});
