import { ForbiddenException } from '@nestjs/common';
import { ReportsService, type ReportScopeContext } from './reports.service';

describe('ReportsService tenant scope resolution', () => {
  const companyA = '11111111-1111-1111-1111-111111111111';
  const companyB = '22222222-2222-2222-2222-222222222222';
  const branchA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const service = new ReportsService(
    {} as any,
    { get: jest.fn((_key: string, fallback: unknown) => fallback) } as any,
    {} as any,
    { log: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
    {} as any,
    { recordReportCacheHit: jest.fn(), recordReportCacheMiss: jest.fn() } as any,
  );

  const resolveScopedFilters = (filters: Record<string, unknown>, scope: ReportScopeContext) =>
    (service as any).resolveScopedFilters(filters, scope);

  it('uses the single JWT company and branch when the query omits tenant IDs', () => {
    const scoped = resolveScopedFilters(
      { dateFrom: '2026-01-01', dateTo: '2026-01-31' },
      {
        userId: 'user-1',
        permissions: [`company:${companyA}`, `branch:${branchA}`],
      },
    );

    expect(scoped).toMatchObject({
      companyId: companyA,
      branchId: branchA,
    });
  });

  it('uses JWT scope arrays when the query omits tenant IDs for a multi-scope user', () => {
    const scoped = resolveScopedFilters(
      {},
      {
        userId: 'user-1',
        permissions: [
          `company:${companyA}`,
          `company:${companyB}`,
          `branch:${branchA}`,
          `branch:${branchB}`,
        ],
      },
    );

    expect(scoped.companyIds).toEqual([companyA, companyB]);
    expect(scoped.branchIds).toEqual([branchA, branchB]);
    expect(scoped.companyId).toBeUndefined();
    expect(scoped.branchId).toBeUndefined();
  });

  it('rejects company and branch IDs outside the JWT scope', () => {
    const scope = {
      userId: 'user-1',
      permissions: [`company:${companyA}`, `branch:${branchA}`],
    };

    expect(() => resolveScopedFilters({ companyId: companyB }, scope)).toThrow(ForbiddenException);
    expect(() => resolveScopedFilters({ branchId: branchB }, scope)).toThrow(ForbiddenException);
  });

  it('rejects report execution when the JWT has no tenant scope', () => {
    expect(() =>
      resolveScopedFilters({}, { userId: 'user-1', permissions: ['reports:read'] }),
    ).toThrow(ForbiddenException);
  });
});
