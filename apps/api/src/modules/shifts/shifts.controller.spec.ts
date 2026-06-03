import { ShiftsController } from './shifts.controller';
import type { ShiftsService } from './shifts.service';

describe('ShiftsController', () => {
  let service: jest.Mocked<
    Pick<
      ShiftsService,
      'open' | 'close' | 'findPage' | 'findById' | 'submitForApproval' | 'approve'
    >
  >;
  let controller: ShiftsController;

  beforeEach(() => {
    service = {
      open: jest.fn(),
      close: jest.fn(),
      findPage: jest.fn(),
      findById: jest.fn(),
      submitForApproval: jest.fn(),
      approve: jest.fn(),
    };
    controller = new ShiftsController(service as unknown as ShiftsService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.5', headers: { 'user-agent': 'jest' } } as any;

  it('open forwards dto and audit context', async () => {
    const shift = { id: 's1' } as any;
    service.open.mockResolvedValue(shift);
    const dto = { branchId: 'b1', stationId: 'st1' } as any;
    await expect(controller.open(dto, user, req)).resolves.toBe(shift);
    expect(service.open).toHaveBeenCalledWith(dto, expect.objectContaining({ userId: 'u1' }));
  });

  it('close forwards id, dto and audit context', async () => {
    const shift = { id: 's1', status: 'closed' } as any;
    service.close.mockResolvedValue(shift);
    const dto = { readings: [] } as any;
    await expect(controller.close('s1', dto, user, req)).resolves.toBe(shift);
    expect(service.close).toHaveBeenCalledWith('s1', dto, expect.objectContaining({ userId: 'u1' }));
  });

  it('list returns envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 's1' } as any], total: 2 });
    const res = await controller.list({ page: 1, pageSize: 10, branchId: 'b1', status: 'open' } as any);
    expect(service.findPage).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'b1', status: 'open' }),
    );
    expect(res.meta.total).toBe(2);
  });

  it('getById delegates', async () => {
    const shift = { id: 's1' } as any;
    service.findById.mockResolvedValue(shift);
    await expect(controller.getById('s1', 'c1')).resolves.toBe(shift);
    expect(service.findById).toHaveBeenCalledWith('s1', 'c1');
  });

  it('submitForApproval delegates', async () => {
    service.submitForApproval.mockResolvedValue({ id: 's1' } as any);
    await controller.submitForApproval('s1', user, req);
    expect(service.submitForApproval).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('approve delegates', async () => {
    service.approve.mockResolvedValue({ id: 's1' } as any);
    await controller.approve('s1', user, req);
    expect(service.approve).toHaveBeenCalledWith('s1', expect.objectContaining({ userId: 'u1' }));
  });
});
