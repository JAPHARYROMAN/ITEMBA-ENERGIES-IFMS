import { SupplierInvoicesController } from './supplier-invoices.controller';
import type { SupplierInvoicesService } from './supplier-invoices.service';

describe('SupplierInvoicesController', () => {
  let service: jest.Mocked<
    Pick<SupplierInvoicesService, 'create' | 'findPage' | 'findById' | 'update' | 'deleteInvoice'>
  >;
  let controller: SupplierInvoicesController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findPage: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      deleteInvoice: jest.fn(),
    };
    controller = new SupplierInvoicesController(service as unknown as SupplierInvoicesService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.5', headers: { 'user-agent': 'jest' } } as any;

  it('create maps the payload and forwards audit context', async () => {
    service.create.mockResolvedValue({ id: 'si1' } as any);
    const dto = {
      branchId: 'b1',
      supplierId: 'sup1',
      invoiceNumber: 'INV-1',
      invoiceDate: '2026-01-01',
      dueDate: '2026-02-01',
      totalAmount: 500,
    } as any;
    await controller.create(dto, user, req);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: 'sup1', invoiceNumber: 'INV-1', totalAmount: 500 }),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('list returns an envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'si1' } as any], total: 1 });
    const res = await controller.list({ page: 1, pageSize: 10, supplierId: 'sup1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ supplierId: 'sup1' }));
    expect(res.meta.total).toBe(1);
  });

  it('getById delegates', async () => {
    const inv = { id: 'si1' } as any;
    service.findById.mockResolvedValue(inv);
    await expect(controller.getById('si1')).resolves.toBe(inv);
    expect(service.findById).toHaveBeenCalledWith('si1');
  });

  it('updateInvoice delegates with audit context', async () => {
    service.update.mockResolvedValue({ id: 'si1' } as any);
    await controller.updateInvoice('si1', { totalAmount: 600 } as any, user, req);
    expect(service.update).toHaveBeenCalledWith(
      'si1',
      { totalAmount: 600 },
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('deleteInvoice delegates with audit context', async () => {
    service.deleteInvoice.mockResolvedValue({ success: true });
    await expect(controller.deleteInvoice('si1', req, user)).resolves.toEqual({ success: true });
    expect(service.deleteInvoice).toHaveBeenCalledWith(
      'si1',
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
