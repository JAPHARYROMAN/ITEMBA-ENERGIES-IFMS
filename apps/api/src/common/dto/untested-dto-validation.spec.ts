import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto, normalizePagination, getDefaultPage, getDefaultPageSize, getMaxPageSize } from './pagination.dto';
import { ListFilterDto } from './list-filter.dto';
import { SortDto, parseSort } from './sort.dto';
import { ReportsRefreshDto } from '../../modules/admin/dto/reports-refresh.dto';
import { CreateExportDto, ExportClientContextDto } from '../../modules/exports/dto/create-export.dto';
import { ExportIdParamDto } from '../../modules/exports/dto/export-id-param.dto';
import { ListExportsQueryDto } from '../../modules/exports/dto/list-exports-query.dto';
import { SetLegalHoldDto } from '../../modules/exports/dto/set-legal-hold.dto';
import { VerifyReportQueryDto } from '../../modules/exports/dto/verify-report-query.dto';
import { ReportActionDto } from '../../modules/reports/dto/report-action.dto';
import { ReportsQueryDto } from '../../modules/reports/dto/reports-query.dto';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

async function errorsFor<T extends object>(cls: new () => T, payload: object): Promise<string[]> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object);
  return errors.map((error) => error.property);
}

describe('previously-untested DTO validation', () => {
  describe('PaginationDto', () => {
    it('accepts valid page/pageSize and coerces numeric strings', async () => {
      expect(await errorsFor(PaginationDto, { page: '2', pageSize: '50' })).toEqual([]);
    });

    it('accepts an empty payload (defaults apply)', async () => {
      expect(await errorsFor(PaginationDto, {})).toEqual([]);
    });

    it('rejects page below the minimum', async () => {
      expect(await errorsFor(PaginationDto, { page: 0 })).toContain('page');
    });

    it('rejects pageSize above the maximum', async () => {
      expect(await errorsFor(PaginationDto, { pageSize: 101 })).toContain('pageSize');
    });

    it('rejects a non-integer pageSize', async () => {
      expect(await errorsFor(PaginationDto, { pageSize: 'abc' })).toContain('pageSize');
    });
  });

  describe('normalizePagination', () => {
    it('returns defaults when given undefined', () => {
      expect(normalizePagination()).toEqual({ page: 1, pageSize: 25, offset: 0, limit: 25 });
    });

    it('clamps page to a minimum of 1', () => {
      expect(normalizePagination(-5, 10)).toMatchObject({ page: 1, offset: 0 });
    });

    it('clamps pageSize to the maximum', () => {
      expect(normalizePagination(2, 999)).toMatchObject({ pageSize: 100, limit: 100, offset: 100 });
    });

    it('clamps pageSize to a minimum of 1', () => {
      expect(normalizePagination(3, 0)).toMatchObject({ pageSize: 25 });
    });

    it('computes offset from valid page/pageSize', () => {
      expect(normalizePagination(3, 10)).toEqual({ page: 3, pageSize: 10, offset: 20, limit: 10 });
    });

    it('exposes the default constants', () => {
      expect(getDefaultPage()).toBe(1);
      expect(getDefaultPageSize()).toBe(25);
      expect(getMaxPageSize()).toBe(100);
    });
  });

  describe('ListFilterDto', () => {
    it('accepts a fully valid filter', async () => {
      expect(
        await errorsFor(ListFilterDto, {
          companyId: UUID,
          branchId: UUID,
          dateFrom: '2025-01-01',
          dateTo: '2025-12-31',
          q: 'fuel',
        }),
      ).toEqual([]);
    });

    it('accepts an empty filter', async () => {
      expect(await errorsFor(ListFilterDto, {})).toEqual([]);
    });

    it('rejects a non-UUID companyId', async () => {
      expect(await errorsFor(ListFilterDto, { companyId: 'nope' })).toContain('companyId');
    });

    it('rejects a malformed date string', async () => {
      expect(await errorsFor(ListFilterDto, { dateFrom: 'not-a-date' })).toContain('dateFrom');
    });

    it('rejects a search string over the max length', async () => {
      expect(await errorsFor(ListFilterDto, { q: 'x'.repeat(201) })).toContain('q');
    });
  });

  describe('SortDto and parseSort', () => {
    it('accepts a well-formed sort string', async () => {
      expect(await errorsFor(SortDto, { sort: 'created_at:desc' })).toEqual([]);
    });

    it('accepts an omitted sort', async () => {
      expect(await errorsFor(SortDto, {})).toEqual([]);
    });

    it('rejects a sort missing the direction', async () => {
      expect(await errorsFor(SortDto, { sort: 'created_at' })).toContain('sort');
    });

    it('parseSort returns null for undefined', () => {
      expect(parseSort()).toBeNull();
    });

    it('parseSort returns null for an invalid pattern', () => {
      expect(parseSort('bad sort')).toBeNull();
    });

    it('parseSort lowercases the direction', () => {
      expect(parseSort('name:ASC')).toEqual({ field: 'name', direction: 'asc' });
    });
  });

  describe('ReportsRefreshDto', () => {
    it('accepts valid dates', async () => {
      expect(await errorsFor(ReportsRefreshDto, { dateFrom: '2025-01-01', dateTo: '2025-01-31' })).toEqual([]);
    });

    it('accepts an empty payload', async () => {
      expect(await errorsFor(ReportsRefreshDto, {})).toEqual([]);
    });

    it('rejects a bad dateTo', async () => {
      expect(await errorsFor(ReportsRefreshDto, { dateTo: 'xyz' })).toContain('dateTo');
    });
  });

  describe('CreateExportDto', () => {
    it('accepts a minimal valid export request', async () => {
      expect(await errorsFor(CreateExportDto, { format: 'pdf', exportType: 'reports.overview' })).toEqual([]);
    });

    it('accepts a request with params and nested client context', async () => {
      expect(
        await errorsFor(CreateExportDto, {
          format: 'csv',
          exportType: 'reports.overview',
          params: { foo: 'bar' },
          clientContext: { requestedFromUrl: '/app', timezone: 'UTC' },
        }),
      ).toEqual([]);
    });

    it('rejects an unsupported format', async () => {
      expect(await errorsFor(CreateExportDto, { format: 'xlsx', exportType: 'reports.overview' })).toContain('format');
    });

    it('rejects a missing format and exportType', async () => {
      const props = await errorsFor(CreateExportDto, {});
      expect(props).toEqual(expect.arrayContaining(['format', 'exportType']));
    });

    it('rejects non-object params', async () => {
      expect(
        await errorsFor(CreateExportDto, { format: 'pdf', exportType: 'reports.overview', params: 'nope' }),
      ).toContain('params');
    });

    it('validates the nested client context', async () => {
      const props = await errorsFor(CreateExportDto, {
        format: 'pdf',
        exportType: 'reports.overview',
        clientContext: { requestedFromUrl: 123 },
      });
      expect(props).toContain('clientContext');
    });

    it('ExportClientContextDto rejects non-string timezone', async () => {
      expect(await errorsFor(ExportClientContextDto, { timezone: 5 })).toContain('timezone');
    });
  });

  describe('ExportIdParamDto', () => {
    it('accepts a valid UUID', async () => {
      expect(await errorsFor(ExportIdParamDto, { exportId: UUID })).toEqual([]);
    });

    it('rejects a non-UUID', async () => {
      expect(await errorsFor(ExportIdParamDto, { exportId: 'abc' })).toContain('exportId');
    });
  });

  describe('ListExportsQueryDto', () => {
    it('accepts a valid query', async () => {
      expect(await errorsFor(ListExportsQueryDto, { limit: 50, companyId: UUID, branchId: UUID })).toEqual([]);
    });

    it('accepts an empty query (limit default)', async () => {
      expect(await errorsFor(ListExportsQueryDto, {})).toEqual([]);
    });

    it('rejects a limit below the minimum', async () => {
      expect(await errorsFor(ListExportsQueryDto, { limit: 0 })).toContain('limit');
    });

    it('rejects a limit above the maximum', async () => {
      expect(await errorsFor(ListExportsQueryDto, { limit: 201 })).toContain('limit');
    });

    it('rejects a non-UUID branchId', async () => {
      expect(await errorsFor(ListExportsQueryDto, { branchId: 'x' })).toContain('branchId');
    });
  });

  describe('SetLegalHoldDto', () => {
    it('accepts enabled with a reason', async () => {
      expect(await errorsFor(SetLegalHoldDto, { enabled: true, reason: 'investigation' })).toEqual([]);
    });

    it('accepts enabled without a reason', async () => {
      expect(await errorsFor(SetLegalHoldDto, { enabled: false })).toEqual([]);
    });

    it('rejects a non-boolean enabled', async () => {
      expect(await errorsFor(SetLegalHoldDto, { enabled: 'yes' })).toContain('enabled');
    });

    it('rejects a missing enabled flag', async () => {
      expect(await errorsFor(SetLegalHoldDto, {})).toContain('enabled');
    });

    it('rejects an over-length reason', async () => {
      expect(await errorsFor(SetLegalHoldDto, { enabled: true, reason: 'r'.repeat(513) })).toContain('reason');
    });
  });

  describe('VerifyReportQueryDto', () => {
    it('accepts a sufficiently long token', async () => {
      expect(await errorsFor(VerifyReportQueryDto, { token: 'a'.repeat(20) })).toEqual([]);
    });

    it('accepts an omitted token', async () => {
      expect(await errorsFor(VerifyReportQueryDto, {})).toEqual([]);
    });

    it('rejects a token shorter than the minimum length', async () => {
      expect(await errorsFor(VerifyReportQueryDto, { token: 'short' })).toContain('token');
    });

    it('rejects a non-string token', async () => {
      expect(await errorsFor(VerifyReportQueryDto, { token: 123456789012345678 })).toContain('token');
    });
  });

  describe('ReportActionDto', () => {
    it('accepts a valid action with optional target and payload', async () => {
      expect(
        await errorsFor(ReportActionDto, { action: 'classify-loss', targetId: UUID, payload: { note: 'x' } }),
      ).toEqual([]);
    });

    it('accepts the minimal action-only payload', async () => {
      expect(await errorsFor(ReportActionDto, { action: 'bulk-reminders' })).toEqual([]);
    });

    it('rejects an unknown action', async () => {
      expect(await errorsFor(ReportActionDto, { action: 'self-destruct' })).toContain('action');
    });

    it('rejects a non-UUID targetId', async () => {
      expect(await errorsFor(ReportActionDto, { action: 'classify-loss', targetId: 'nope' })).toContain('targetId');
    });

    it('rejects a non-object payload', async () => {
      expect(await errorsFor(ReportActionDto, { action: 'classify-loss', payload: 'str' })).toContain('payload');
    });
  });

  describe('ReportsQueryDto', () => {
    it('accepts a fully-specified query', async () => {
      expect(
        await errorsFor(ReportsQueryDto, {
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
          companyId: UUID,
          stationId: UUID,
          branchId: UUID,
          productId: UUID,
        }),
      ).toEqual([]);
    });

    it('accepts an empty query', async () => {
      expect(await errorsFor(ReportsQueryDto, {})).toEqual([]);
    });

    it('rejects a bad dateFrom', async () => {
      expect(await errorsFor(ReportsQueryDto, { dateFrom: 'bad' })).toContain('dateFrom');
    });

    it('rejects a non-UUID stationId', async () => {
      expect(await errorsFor(ReportsQueryDto, { stationId: 'x' })).toContain('stationId');
    });

    it('rejects a non-UUID productId', async () => {
      expect(await errorsFor(ReportsQueryDto, { productId: 'x' })).toContain('productId');
    });
  });
});
