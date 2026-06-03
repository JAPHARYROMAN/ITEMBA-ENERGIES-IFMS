import { PaymentsController } from './payments.controller';
import type { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  let service: jest.Mocked<
    Pick<PaymentsService, 'create' | 'findPage' | 'getById' | 'voidPayment'>
  >;
  let controller: PaymentsController;

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.7', headers: { 'user-agent': 'jest' } } as any;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findPage: jest.fn(),
      getById: jest.fn(),
      voidPayment: jest.fn(),
    };
    controller = new PaymentsController(service as unknown as PaymentsService);
  });

  it('create maps dto (including allocations) and forwards audit context', async () => {
    service.create.mockResolvedValue({ id: 'pay1' } as any);
    const dto = {
      customerId: 'cust1',
      amount: 100,
      method: 'cash',
      paymentDate: '2026-02-01',
      referenceNo: 'R1',
      allocations: [{ invoiceId: 'inv1', amount: 100 }],
    } as any;
    await controller.create(dto, user, req);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust1',
        amount: 100,
        allocations: [{ invoiceId: 'inv1', amount: 100 }],
      }),
      expect.objectContaining({ userId: 'u1', ip: '10.0.0.7' }),
    );
  });

  it('list returns an envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'pay1' } as any], total: 2 });
    const res = await controller.list({ page: 1, pageSize: 10, customerId: 'cust1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust1' }),
    );
    expect(res.meta.total).toBe(2);
  });

  it('getById delegates', async () => {
    const pay = { id: 'pay1' } as any;
    service.getById.mockResolvedValue(pay);
    await expect(controller.getById('pay1')).resolves.toBe(pay);
    expect(service.getById).toHaveBeenCalledWith('pay1');
  });

  it('voidPayment delegates with audit context', async () => {
    service.voidPayment.mockResolvedValue({ success: true });
    await expect(controller.voidPayment('pay1', user, req)).resolves.toEqual({ success: true });
    expect(service.voidPayment).toHaveBeenCalledWith(
      'pay1',
      expect.objectContaining({ userId: 'u1' }),
    );
  });
});
