import { DeliveriesController } from './deliveries.controller';
import type { DeliveriesService } from './deliveries.service';

describe('DeliveriesController', () => {
  let service: jest.Mocked<
    Pick<
      DeliveriesService,
      'create' | 'receiveGrn' | 'updateDelivery' | 'findPage' | 'findById' | 'deleteDelivery'
    >
  >;
  let controller: DeliveriesController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      receiveGrn: jest.fn(),
      updateDelivery: jest.fn(),
      findPage: jest.fn(),
      findById: jest.fn(),
      deleteDelivery: jest.fn(),
    };
    controller = new DeliveriesController(service as unknown as DeliveriesService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.2', headers: { 'user-agent': 'jest' } } as any;

  it('create forwards dto and audit context', async () => {
    const result = { id: 'd1' } as any;
    service.create.mockResolvedValue(result);
    const dto = { branchId: 'b1' } as any;
    await expect(controller.create(dto, user, req)).resolves.toBe(result);
    expect(service.create).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({ userId: 'u1', ip: '10.0.0.2', userAgent: 'jest' }),
    );
  });

  it('receiveGrn delegates by id', async () => {
    const detail = { id: 'd1' } as any;
    service.receiveGrn.mockResolvedValue(detail);
    const dto = { allocations: [] } as any;
    await expect(controller.receiveGrn('d1', dto, user, req)).resolves.toBe(detail);
    expect(service.receiveGrn).toHaveBeenCalledWith(
      'd1',
      dto,
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('updateDelivery delegates', async () => {
    service.updateDelivery.mockResolvedValue({ id: 'd1' } as any);
    await controller.updateDelivery('d1', { notes: 'x' } as any, user, req);
    expect(service.updateDelivery).toHaveBeenCalledWith(
      'd1',
      { notes: 'x' },
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('list returns an envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'd1' } as any], total: 1 });
    const res = await controller.list({ page: 1, pageSize: 10, branchId: 'b1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'b1' }));
    expect(res.meta.total).toBe(1);
  });

  it('getById delegates with companyId', async () => {
    const d = { id: 'd1' } as any;
    service.findById.mockResolvedValue(d);
    await expect(controller.getById('d1', 'c1')).resolves.toBe(d);
    expect(service.findById).toHaveBeenCalledWith('d1', 'c1');
  });

  it('deleteDelivery delegates with audit context', async () => {
    service.deleteDelivery.mockResolvedValue({ success: true });
    await expect(controller.deleteDelivery('d1', req, user)).resolves.toEqual({ success: true });
    expect(service.deleteDelivery).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
