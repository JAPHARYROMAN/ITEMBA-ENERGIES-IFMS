import { PayablesController } from './payables.controller';
import type { PayablesAgingService } from './payables-aging.service';

describe('PayablesController', () => {
  let agingService: jest.Mocked<Pick<PayablesAgingService, 'getAging'>>;
  let controller: PayablesController;

  beforeEach(() => {
    agingService = { getAging: jest.fn() };
    controller = new PayablesController(agingService as unknown as PayablesAgingService);
  });

  it('getAging forwards query params to the service', async () => {
    const report = { total: 0, buckets: [] } as any;
    agingService.getAging.mockResolvedValue(report);
    await expect(controller.getAging('b1', 'c1', '2026-06-01')).resolves.toBe(report);
    expect(agingService.getAging).toHaveBeenCalledWith({
      branchId: 'b1',
      companyId: 'c1',
      asOf: '2026-06-01',
    });
  });
});
