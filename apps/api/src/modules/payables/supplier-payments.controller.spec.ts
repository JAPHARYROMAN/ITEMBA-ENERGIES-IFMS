import { SupplierPaymentsController } from './supplier-payments.controller';
import type { SupplierPaymentsService } from './supplier-payments.service';

describe('SupplierPaymentsController', () => {
  let service: jest.Mocked<
    Pick<SupplierPaymentsService, 'create' | 'findPage' | 'getById' | 'voidPayment'>
  >;
  let controller: SupplierPaymentsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findPage: jest.fn(),
      getById: jest.fn(),
      voidPayment: jest.fn(),
    };
    controller = new SupplierPaymentsController(service as unknown as SupplierPaymentsService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.6', headers: { 'user-agent': 'jest' } } as any;

  it('create maps the payload and forwards audit context', async () => {
    service.create.mockResolvedValue({ id: 'sp1' } as any);
    const dto = {
      branchId: 'b1',
      supplierId: 'sup1',
      amount: 300,
      method: 'bank',
      paymentDate: '2026-01-01',
      referenceNo: 'REF-1',
      allocations: [{ invoiceId: 'si1', amount: 300 }],
    } as any;
    await controller.create(dto, user, req);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: 'sup1', amount: 300, method: 'bank' }),
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('list returns an envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'sp1' } as any], total: 2 });
    const res = await controller.list({ page: 1, pageSize: 10, supplierId: 'sup1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ supplierId: 'sup1' }));
    expect(res.meta.total).toBe(2);
  });

  it('getById delegates', async () => {
    const pay = { id: 'sp1' } as any;
    service.getById.mockResolvedValue(pay);
    await expect(controller.getById('sp1')).resolves.toBe(pay);
    expect(service.getById).toHaveBeenCalledWith('sp1');
  });

  it('voidPayment delegates with audit context', async () => {
    service.voidPayment.mockResolvedValue({ id: 'sp1' } as any);
    await controller.voidPayment('sp1', user, req);
    expect(service.voidPayment).toHaveBeenCalledWith(
      'sp1',
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
