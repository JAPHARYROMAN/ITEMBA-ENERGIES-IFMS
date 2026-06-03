import { CreditController } from './credit.controller';
import type { CreditAgingService } from './credit-aging.service';

describe('CreditController', () => {
  let agingService: jest.Mocked<Pick<CreditAgingService, 'getAging'>>;
  let controller: CreditController;

  beforeEach(() => {
    agingService = { getAging: jest.fn() };
    controller = new CreditController(agingService as unknown as CreditAgingService);
  });

  it('getAging delegates to the aging service', async () => {
    const report = { total: 5, buckets: [] } as any;
    agingService.getAging.mockResolvedValue(report);
    await expect(controller.getAging('b1', 'c1', '2026-06-01')).resolves.toBe(report);
    expect(agingService.getAging).toHaveBeenCalledWith({
      branchId: 'b1',
      companyId: 'c1',
      asOf: '2026-06-01',
    });
  });

  it('passes through undefined params', async () => {
    agingService.getAging.mockResolvedValue({} as any);
    await controller.getAging();
    expect(agingService.getAging).toHaveBeenCalledWith({
      branchId: undefined,
      companyId: undefined,
      asOf: undefined,
    });
  });
});
