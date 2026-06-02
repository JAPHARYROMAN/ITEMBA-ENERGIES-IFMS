import { ForbiddenException } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { TenantInterceptor } from './tenant.interceptor';

describe('TenantInterceptor', () => {
  const companyA = '11111111-1111-1111-1111-111111111111';
  const companyB = '22222222-2222-2222-2222-222222222222';

  const contextFor = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as any;

  it('attaches tenant scope without mutating body or query', async () => {
    const request = {
      url: '/api/reports/overview',
      method: 'GET',
      params: {},
      body: {},
      query: {},
      user: {
        sub: 'user-1',
        email: 'auditor@ifms.test',
        permissions: [`company:${companyA}`],
      },
    } as any;
    const next = { handle: jest.fn(() => of('ok')) };

    await expect(firstValueFrom(new TenantInterceptor().intercept(contextFor(request), next))).resolves.toBe('ok');

    expect(request.body).toEqual({});
    expect(request.query).toEqual({});
    expect(request.tenantScope).toEqual({ companyIds: [companyA], branchIds: [] });
  });

  it('rejects explicit company IDs outside the JWT scope', () => {
    const request = {
      url: '/api/reports/overview',
      params: {},
      body: {},
      query: { companyId: companyB },
      user: {
        sub: 'user-1',
        email: 'auditor@ifms.test',
        permissions: [`company:${companyA}`],
      },
    };

    expect(() => new TenantInterceptor().intercept(contextFor(request), { handle: jest.fn() })).toThrow(
      ForbiddenException,
    );
  });
});
