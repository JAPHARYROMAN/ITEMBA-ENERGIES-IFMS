import { CompaniesController } from './companies.controller';
import type { CompaniesService } from './companies.service';

describe('CompaniesController', () => {
  let service: jest.Mocked<Pick<CompaniesService, 'findPage' | 'findById' | 'create' | 'update' | 'remove'>>;
  let controller: CompaniesController;

  beforeEach(() => {
    service = {
      findPage: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new CompaniesController(service as unknown as CompaniesService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.4', headers: { 'user-agent': 'jest' } } as any;

  it('list returns envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'co1' } as any], total: 1 });
    const res = await controller.list({ page: 1, pageSize: 10, q: 'Acme' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ q: 'Acme' }));
    expect(res.meta.total).toBe(1);
  });

  it('getById delegates', async () => {
    const company = { id: 'co1' } as any;
    service.findById.mockResolvedValue(company);
    await expect(controller.getById('co1')).resolves.toBe(company);
    expect(service.findById).toHaveBeenCalledWith('co1');
  });

  it('create forwards dto', async () => {
    service.create.mockResolvedValue({ id: 'co9' } as any);
    await controller.create({ code: 'CO-9', name: 'Acme' } as any, user, req);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CO-9', name: 'Acme' }),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('update delegates', async () => {
    service.update.mockResolvedValue({ id: 'co1' } as any);
    await controller.update('co1', { name: 'N' } as any, user, req);
    expect(service.update).toHaveBeenCalledWith('co1', { name: 'N' }, expect.objectContaining({ userId: 'u1' }));
  });

  it('delete delegates', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.delete('co1', user, req);
    expect(service.remove).toHaveBeenCalledWith('co1', expect.objectContaining({ userId: 'u1' }));
  });
});
