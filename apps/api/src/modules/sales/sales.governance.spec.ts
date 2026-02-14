import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { SalesService } from './sales.service';
import { SALE_STATUS_PENDING_VOID_APPROVAL } from '../../database/schema/sales/sales-transactions';

describe('SalesService governance integration', () => {
  it('voidTransaction marks sale pending void approval when governance request is created', async () => {
    const existing = {
      id: 'sale-1',
      companyId: 'c1',
      branchId: 'b1',
      totalAmount: '250.00',
      status: 'completed',
      deletedAt: null,
    };

    const selectWhere = jest.fn(async () => [existing]);
    const updateWhere = jest.fn(async () => []);
    const set = jest.fn().mockReturnValue({ where: updateWhere });

    const db = {
      select: jest.fn().mockReturnValue({ from: () => ({ where: selectWhere }) }),
      update: jest.fn().mockReturnValue({ set }),
    } as any;

    const audit = { log: jest.fn() } as any;
    const config = { get: jest.fn().mockReturnValue(0.01) } as unknown as ConfigService;
    const governance = {
      initiateControlledActionRequest: jest.fn(async () => ({ id: 'apr-2', status: 'submitted' })),
    } as any;

    const service = new SalesService(db, audit, config, governance);
    jest.spyOn(service, 'findById').mockResolvedValue({ id: 'sale-1', status: SALE_STATUS_PENDING_VOID_APPROVAL } as any);

    const result = await service.voidTransaction('sale-1', 'Fraud suspected', {
      userId: 'u1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(governance.initiateControlledActionRequest).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: SALE_STATUS_PENDING_VOID_APPROVAL }),
    );
    expect(result.status).toBe(SALE_STATUS_PENDING_VOID_APPROVAL);
  });
});
