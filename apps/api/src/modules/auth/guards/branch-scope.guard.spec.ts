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

  it('allows public routes without inspecting the request', () => {
    const publicGuard = new BranchScopeGuard({ getAllAndOverride: jest.fn(() => true) } as any);
    expect(publicGuard.canActivate(contextFor({}))).toBe(true);
  });

  it('throws when there is no authenticated user', () => {
    expect(() =>
      guard.canActivate(contextFor({ params: {}, body: {}, query: {} })),
    ).toThrow('Authentication required');
  });

  it('reads the branch ID from route params', () => {
    expect(
      guard.canActivate(
        contextFor({
          params: { branchId: branchA },
          body: {},
          query: {},
          user: { permissions: [`branch:${branchA}`] },
        }),
      ),
    ).toBe(true);
  });

  it('reads the branch ID from the request body', () => {
    expect(
      guard.canActivate(
        contextFor({
          params: {},
          body: { branchId: branchA },
          query: {},
          user: { permissions: [`branch:${branchA}`] },
        }),
      ),
    ).toBe(true);
  });

  it('ignores non-string branch IDs', () => {
    expect(
      guard.canActivate(
        contextFor({
          params: { branchId: 123 },
          body: { branchId: '' },
          query: {},
          user: { permissions: [`branch:${branchA}`] },
        }),
      ),
    ).toBe(true);
  });

  it('throws when the account has no branch scopes assigned', () => {
    expect(() =>
      guard.canActivate(
        contextFor({
          params: {},
          body: {},
          query: { branchId: branchA },
          user: { permissions: ['sales:read'] },
        }),
      ),
    ).toThrow('No branch scopes are assigned to this account');
  });

  it('handles a missing permissions array on the user', () => {
    expect(() =>
      guard.canActivate(
        contextFor({
          params: {},
          body: {},
          query: { branchId: branchA },
          user: {},
        }),
      ),
    ).toThrow('No branch scopes are assigned to this account');
  });

  it('validates every requested branch and rejects the first out-of-scope one', () => {
    expect(() =>
      guard.canActivate(
        contextFor({
          params: { branchId: branchA },
          body: { branchId: branchB },
          query: {},
          user: { permissions: [`branch:${branchA}`] },
        }),
      ),
    ).toThrow('You do not have access to the requested branch');
  });

  it('allows when all requested branches are in scope', () => {
    expect(
      guard.canActivate(
        contextFor({
          params: { branchId: branchA },
          body: { branchId: branchB },
          query: {},
          user: { permissions: [`branch:${branchA}`, `branch:${branchB}`] },
        }),
      ),
    ).toBe(true);
  });
});
