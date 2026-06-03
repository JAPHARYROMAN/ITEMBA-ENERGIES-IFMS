import { CreditInvoicesController } from './credit-invoices.controller';
import type { CreditInvoicesService } from './credit-invoices.service';

describe('CreditInvoicesController', () => {
  let service: jest.Mocked<
    Pick<CreditInvoicesService, 'create' | 'findPage' | 'getById' | 'update' | 'deleteInvoice'>
  >;
  let controller: CreditInvoicesController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findPage: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      deleteInvoice: jest.fn(),
    };
    controller = new CreditInvoicesController(service as unknown as CreditInvoicesService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.4', headers: { 'user-agent': 'jest' } } as any;

  it('create maps the dto items and forwards audit context', async () => {
    service.create.mockResolvedValue({ id: 'ci1' } as any);
    const dto = {
      customerId: 'cust1',
      invoiceDate: '2026-01-01',
      dueDate: '2026-02-01',
      items: [{ productId: 'p1', quantity: 2, unitPrice: 10, tax: 1 }],
    } as any;
    await controller.create(dto, user, req);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust1',
        items: [{ productId: 'p1', quantity: 2, unitPrice: 10, tax: 1 }],
      }),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('list returns an envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'ci1' } as any], total: 3 });
    const res = await controller.list({ page: 1, pageSize: 10, customerId: 'cust1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'cust1' }));
    expect(res.meta.total).toBe(3);
  });

  it('getById delegates', async () => {
    const inv = { id: 'ci1' } as any;
    service.getById.mockResolvedValue(inv);
    await expect(controller.getById('ci1')).resolves.toBe(inv);
    expect(service.getById).toHaveBeenCalledWith('ci1');
  });

  it('updateInvoice delegates with audit context', async () => {
    service.update.mockResolvedValue({ id: 'ci1' } as any);
    await controller.updateInvoice('ci1', { dueDate: '2026-03-01' } as any, user, req);
    expect(service.update).toHaveBeenCalledWith(
      'ci1',
      { dueDate: '2026-03-01' },
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('deleteInvoice delegates with audit context', async () => {
    service.deleteInvoice.mockResolvedValue({ success: true });
    await expect(controller.deleteInvoice('ci1', req, user)).resolves.toEqual({ success: true });
    expect(service.deleteInvoice).toHaveBeenCalledWith(
      'ci1',
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
