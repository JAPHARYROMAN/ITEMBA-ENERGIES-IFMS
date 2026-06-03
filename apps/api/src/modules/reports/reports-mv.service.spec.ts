import { ReportsMvService, canUseViewsForDateRange } from './reports-mv.service';

describe('canUseViewsForDateRange', () => {
  it('returns true only when both dateFrom and dateTo are present', () => {
    expect(canUseViewsForDateRange({ dateFrom: '2026-01-01', dateTo: '2026-01-31' })).toBe(true);
    expect(canUseViewsForDateRange({ dateFrom: '2026-01-01' })).toBe(false);
    expect(canUseViewsForDateRange({ dateTo: '2026-01-31' })).toBe(false);
    expect(canUseViewsForDateRange({})).toBe(false);
  });
});

describe('ReportsMvService', () => {
  let execute: jest.Mock;
  let service: ReportsMvService;

  const range = { dateFrom: '2026-01-01', dateTo: '2026-01-31' };

  beforeEach(() => {
    execute = jest.fn();
    service = new ReportsMvService({ execute } as any);
  });

  describe('getSalesTrendFromViews', () => {
    it('returns null without a full date range (no DB call)', async () => {
      await expect(service.getSalesTrendFromViews({ dateFrom: '2026-01-01' })).resolves.toBeNull();
      expect(execute).not.toHaveBeenCalled();
    });

    it('maps rows and coerces amount to a number', async () => {
      execute.mockResolvedValue({ rows: [{ date: '2026-01-01', amount: '125.50' }] });
      const result = await service.getSalesTrendFromViews(range);
      expect(result).toEqual([{ date: '2026-01-01', amount: 125.5 }]);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('returns null when the view yields no rows', async () => {
      execute.mockResolvedValue({ rows: [] });
      await expect(service.getSalesTrendFromViews(range)).resolves.toBeNull();
    });

    it('returns null when rows is undefined', async () => {
      execute.mockResolvedValue({});
      await expect(service.getSalesTrendFromViews(range)).resolves.toBeNull();
    });

    it('swallows DB errors and returns null', async () => {
      execute.mockRejectedValue(new Error('relation does not exist'));
      await expect(service.getSalesTrendFromViews(range)).resolves.toBeNull();
    });

    it('builds conditions for single company/branch/station scope', async () => {
      execute.mockResolvedValue({ rows: [{ date: '2026-01-01', amount: '1' }] });
      await service.getSalesTrendFromViews({
        ...range,
        companyId: 'company-1',
        branchId: 'branch-1',
        stationId: 'station-1',
      });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('builds conditions for multi company/branch scope (IN lists)', async () => {
      execute.mockResolvedValue({ rows: [{ date: '2026-01-01', amount: '1' }] });
      await service.getSalesTrendFromViews({
        ...range,
        companyIds: ['c1', 'c2'],
        branchIds: ['b1', 'b2'],
      });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('defaults missing amount to zero', async () => {
      execute.mockResolvedValue({ rows: [{ date: '2026-01-02' }] });
      const result = await service.getSalesTrendFromViews(range);
      expect(result).toEqual([{ date: '2026-01-02', amount: 0 }]);
    });
  });

  describe('getPaymentMixFromViews', () => {
    it('returns null without a full date range', async () => {
      await expect(service.getPaymentMixFromViews({})).resolves.toBeNull();
      expect(execute).not.toHaveBeenCalled();
    });

    it('maps method -> name and amount -> value', async () => {
      execute.mockResolvedValue({ rows: [{ method: 'Cash', amount: '900' }] });
      const result = await service.getPaymentMixFromViews(range);
      expect(result).toEqual([{ name: 'Cash', value: 900 }]);
    });

    it('returns null when no rows', async () => {
      execute.mockResolvedValue({ rows: [] });
      await expect(service.getPaymentMixFromViews(range)).resolves.toBeNull();
    });

    it('swallows DB errors and returns null', async () => {
      execute.mockRejectedValue(new Error('boom'));
      await expect(service.getPaymentMixFromViews(range)).resolves.toBeNull();
    });

    it('applies company IN-list and station/branch scope branches', async () => {
      execute.mockResolvedValue({ rows: [{ method: 'Card', amount: '5' }] });
      await service.getPaymentMixFromViews({
        ...range,
        companyIds: ['c1', 'c2'],
        stationId: 's1',
        branchIds: ['b1'],
      });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('defaults missing amount to zero', async () => {
      execute.mockResolvedValue({ rows: [{ method: 'MobileMoney' }] });
      const result = await service.getPaymentMixFromViews(range);
      expect(result).toEqual([{ name: 'MobileMoney', value: 0 }]);
    });
  });
});
