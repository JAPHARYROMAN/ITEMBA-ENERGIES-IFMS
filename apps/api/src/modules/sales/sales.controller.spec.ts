import { SalesController } from './sales.controller';
import type { SalesService } from './sales.service';

describe('SalesController', () => {
  let service: jest.Mocked<
    Pick<SalesService, 'createPosSale' | 'findPage' | 'findById' | 'voidTransaction'>
  >;
  let controller: SalesController;

  beforeEach(() => {
    service = {
      createPosSale: jest.fn(),
      findPage: jest.fn(),
      findById: jest.fn(),
      voidTransaction: jest.fn(),
    };
    controller = new SalesController(service as unknown as SalesService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.3', headers: { 'user-agent': 'jest' } } as any;

  it('createPosSale forwards dto and audit context', async () => {
    const result = { id: 'sale1' } as any;
    service.createPosSale.mockResolvedValue(result);
    const dto = { branchId: 'b1', items: [] } as any;
    await expect(controller.createPosSale(dto, user, req)).resolves.toBe(result);
    expect(service.createPosSale).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({ userId: 'u1', ip: '10.0.0.3', userAgent: 'jest' }),
    );
  });

  it('list returns an envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'sale1' } as any], total: 2 });
    const res = await controller.list({ page: 1, pageSize: 10, status: 'completed' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(res.meta.total).toBe(2);
  });

  it('getById delegates with companyId', async () => {
    const s = { id: 'sale1' } as any;
    service.findById.mockResolvedValue(s);
    await expect(controller.getById('sale1', 'c1')).resolves.toBe(s);
    expect(service.findById).toHaveBeenCalledWith('sale1', 'c1');
  });

  it('void passes the reason and audit context', async () => {
    service.voidTransaction.mockResolvedValue({ id: 'sale1' } as any);
    await controller.void('sale1', { reason: 'mistake' } as any, user, req);
    expect(service.voidTransaction).toHaveBeenCalledWith(
      'sale1',
      'mistake',
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
