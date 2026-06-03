import { ProductsController } from './products.controller';
import type { ProductsService } from './products.service';

describe('ProductsController', () => {
  let service: jest.Mocked<Pick<ProductsService, 'findPage' | 'findById' | 'create' | 'update' | 'remove'>>;
  let controller: ProductsController;

  beforeEach(() => {
    service = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new ProductsController(service as unknown as ProductsService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;

  it('list returns an envelope with data and total', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'p1' } as any], total: 1 });
    const res = await controller.list({ page: 1, pageSize: 10, companyId: 'c1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10, companyId: 'c1' }),
    );
    expect(res.data).toHaveLength(1);
    expect(res.meta.total).toBe(1);
  });

  it('getById delegates to service', async () => {
    const product = { id: 'p1' } as any;
    service.findById.mockResolvedValue(product);
    await expect(controller.getById('p1', 'c1')).resolves.toBe(product);
    expect(service.findById).toHaveBeenCalledWith('p1', 'c1');
  });

  it('create forwards dto and audit context', async () => {
    const created = { id: 'p9' } as any;
    service.create.mockResolvedValue(created);
    const dto = { companyId: 'c1', code: 'X', name: 'N', category: 'F', pricePerUnit: 5 } as any;
    await expect(controller.create(dto, user, req)).resolves.toBe(created);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', code: 'X' }),
      expect.objectContaining({ userId: 'u1', ip: '127.0.0.1', userAgent: 'jest' }),
    );
  });

  it('update forwards dto and audit context', async () => {
    const updated = { id: 'p1' } as any;
    service.update.mockResolvedValue(updated);
    await expect(controller.update('p1', { name: 'N2' } as any, user, req)).resolves.toBe(updated);
    expect(service.update).toHaveBeenCalledWith(
      'p1',
      { name: 'N2' },
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('delete delegates to service', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.delete('p1', user, req);
    expect(service.remove).toHaveBeenCalledWith('p1', expect.objectContaining({ userId: 'u1' }));
  });
});
