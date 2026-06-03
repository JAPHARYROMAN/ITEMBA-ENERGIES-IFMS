import { TransfersController } from './transfers.controller';
import type { TransfersService } from './transfers.service';

describe('TransfersController', () => {
  let service: jest.Mocked<
    Pick<
      TransfersService,
      'tankToTank' | 'stationToStation' | 'findPage' | 'findById' | 'updateTransfer' | 'deleteTransfer'
    >
  >;
  let controller: TransfersController;

  beforeEach(() => {
    service = {
      tankToTank: jest.fn(),
      stationToStation: jest.fn(),
      findPage: jest.fn(),
      findById: jest.fn(),
      updateTransfer: jest.fn(),
      deleteTransfer: jest.fn(),
    };
    controller = new TransfersController(service as unknown as TransfersService);
  });

  const user = { sub: 'u1' } as any;
  const req = { ip: '10.0.0.9', headers: { 'user-agent': 'jest' } } as any;

  it('tankToTank forwards dto and audit context', async () => {
    const result = { id: 'tr1' } as any;
    service.tankToTank.mockResolvedValue(result);
    const dto = { fromTankId: 'a', toTankId: 'b', quantity: 100 } as any;
    await expect(controller.tankToTank(dto, user, req)).resolves.toBe(result);
    expect(service.tankToTank).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({ userId: 'u1', ip: '10.0.0.9', userAgent: 'jest' }),
    );
  });

  it('stationToStation forwards dto and audit context', async () => {
    const result = { id: 'tr2' } as any;
    service.stationToStation.mockResolvedValue(result);
    const dto = { fromTankId: 'a', toTankId: 'b', quantity: 50 } as any;
    await expect(controller.stationToStation(dto, user, req)).resolves.toBe(result);
    expect(service.stationToStation).toHaveBeenCalledWith(dto, expect.objectContaining({ userId: 'u1' }));
  });

  it('list returns envelope', async () => {
    service.findPage.mockResolvedValue({ data: [{ id: 'tr1' } as any], total: 1 });
    const res = await controller.list({ page: 1, pageSize: 10, branchId: 'b1' } as any);
    expect(service.findPage).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'b1' }));
    expect(res.meta.total).toBe(1);
  });

  it('getById delegates', async () => {
    const t = { id: 'tr1' } as any;
    service.findById.mockResolvedValue(t);
    await expect(controller.getById('tr1')).resolves.toBe(t);
    expect(service.findById).toHaveBeenCalledWith('tr1');
  });

  it('updateTransfer delegates', async () => {
    service.updateTransfer.mockResolvedValue({ id: 'tr1' } as any);
    await controller.updateTransfer('tr1', { referenceNote: 'x' } as any, user, req);
    expect(service.updateTransfer).toHaveBeenCalledWith(
      'tr1',
      { referenceNote: 'x' },
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('deleteTransfer delegates', async () => {
    service.deleteTransfer.mockResolvedValue({ success: true });
    await expect(controller.deleteTransfer('tr1', req, user)).resolves.toEqual({ success: true });
    expect(service.deleteTransfer).toHaveBeenCalledWith('tr1', expect.objectContaining({ userId: 'u1' }));
  });
});
