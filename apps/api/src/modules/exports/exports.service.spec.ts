import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExportsService } from './exports.service';
import type { JwtPayloadUser } from '../auth/decorators/current-user.decorator';

describe('ExportsService tenant scope enforcement', () => {
  const companyA = '11111111-1111-1111-1111-111111111111';
  const companyB = '22222222-2222-2222-2222-222222222222';
  const branchA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const makeService = () => {
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
      transaction: jest.fn(),
    };
    const service = new ExportsService(
      db as any,
      { get: jest.fn((_key: string, fallback: unknown) => fallback) } as any,
      {} as any,
      {} as any,
    );
    return { service, db };
  };

  const user = (permissions: string[]): JwtPayloadUser => ({
    sub: '99999999-9999-9999-9999-999999999999',
    email: 'auditor@ifms.test',
    permissions,
  });

  it('persists resolved create scope from single company and branch permissions without mutating params', async () => {
    const { service, db } = makeService();
    const params = { dateFrom: '2026-01-01' };
    const insertedValues: Array<Record<string, unknown>> = [];
    const createdAt = new Date('2026-01-02T00:00:00Z');
    const tx = {
      insert: jest.fn().mockReturnValue({
        values: jest.fn((values: Record<string, unknown>) => {
          insertedValues.push(values);
          return {
            returning: jest.fn().mockResolvedValue([
              {
                id: '33333333-3333-3333-3333-333333333333',
                ...values,
                fileName: null,
                mimeType: null,
                sizeBytes: null,
                sha256Hash: null,
                isSigned: false,
                pdfaLevel: null,
                signatureProfile: null,
                signedAt: null,
                signedByUserId: null,
                tsaProvider: null,
                legalHold: false,
                legalHoldReason: null,
                revokedAt: null,
                createdAt,
                completedAt: null,
              },
            ]),
          };
        }),
      }),
    };
    db.transaction.mockImplementation(async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx));

    await service.createExport(
      {
        format: 'csv',
        exportType: 'reports.overview',
        params,
      },
      user([`company:${companyA}`, `branch:${branchA}`]),
    );

    expect(insertedValues[0]).toMatchObject({
      companyId: companyA,
      branchId: branchA,
      paramsJson: expect.objectContaining({
        companyId: companyA,
        branchId: branchA,
      }),
    });
    expect(params).toEqual({ dateFrom: '2026-01-01' });
  });

  it('rejects create when multiple branch scopes are assigned and branchId is omitted', () => {
    const { service } = makeService();
    const scope = (service as any).parseScope(
      user([`company:${companyA}`, `branch:${branchA}`, `branch:${branchB}`]),
    );

    expect(() =>
      (service as any).resolveCreateScope(scope, { companyId: companyA, branchId: undefined }),
    ).toThrow(BadRequestException);
  });

  it('rejects create when the requested company is outside JWT scope', () => {
    const { service } = makeService();
    const scope = (service as any).parseScope(user([`company:${companyA}`, `branch:${branchA}`]));

    expect(() =>
      (service as any).resolveCreateScope(scope, { companyId: companyB, branchId: branchA }),
    ).toThrow(ForbiddenException);
  });

  it('rejects list filters outside JWT tenant scope before querying', async () => {
    const { service, db } = makeService();

    await expect(
      service.listExports(user([`company:${companyA}`, `branch:${branchA}`]), {
        limit: 20,
        companyId: companyB,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects downloads when the JWT has no tenant scope before querying', async () => {
    const { service, db } = makeService();

    await expect(
      service.getDownloadMeta(user(['reports:read']), '33333333-3333-3333-3333-333333333333'),
    ).rejects.toThrow(ForbiddenException);
    expect(db.select).not.toHaveBeenCalled();
  });
});
