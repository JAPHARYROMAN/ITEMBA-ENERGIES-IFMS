import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { AdminController } from './admin.controller';
import { ReportsRefreshDto } from './dto/reports-refresh.dto';

describe('AdminController', () => {
  it('delegates manual reports refresh with the requested date window', async () => {
    const reportsRefresh = {
      refreshAll: jest.fn().mockResolvedValue({ ok: true, viewsRefreshed: [], durationMs: 5 }),
    };
    const controller = new AdminController(reportsRefresh as any);

    await expect(
      controller.refreshReports({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }),
    ).resolves.toMatchObject({ ok: true });

    expect(reportsRefresh.refreshAll).toHaveBeenCalledWith({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
  });

  it('requires reports refresh permission metadata on the refresh endpoint', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.refreshReports)).toEqual([
      'reports:refresh',
    ]);
  });

  it('validates optional refresh date strings', async () => {
    const valid = plainToInstance(ReportsRefreshDto, {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    const invalid = plainToInstance(ReportsRefreshDto, {
      dateFrom: 'not-a-date',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toEqual([
      expect.objectContaining({ property: 'dateFrom' }),
    ]);
  });
});
