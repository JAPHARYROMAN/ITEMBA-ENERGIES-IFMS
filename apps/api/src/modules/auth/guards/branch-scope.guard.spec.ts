import { ForbiddenException } from '@nestjs/common';
import { BranchScopeGuard } from './branch-scope.guard';

describe('BranchScopeGuard', () => {
  const branchA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const guard = new BranchScopeGuard({
    getAllAndOverride: jest.fn(() => false),
  } as any);

  const contextFor = (request: Record<string, unknown>) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as any;

  it('allows requests with no explicit branch ID for service-side scoping', () => {
    expect(
      guard.canActivate(
        contextFor({
          params: {},
          body: {},
          query: {},
          user: { sub: 'user-1', email: 'auditor@ifms.test', permissions: [`branch:${branchA}`] },
        }),
      ),
    ).toBe(true);
  });

  it('rejects explicit branch IDs outside the JWT scope', () => {
    expect(() =>
      guard.canActivate(
        contextFor({
          params: {},
          body: {},
          query: { branchId: branchB },
          user: { sub: 'user-1', email: 'auditor@ifms.test', permissions: [`branch:${branchA}`] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
