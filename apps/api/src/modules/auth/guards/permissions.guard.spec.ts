import { ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const makeReflector = (required: string[] | undefined) =>
    ({ getAllAndOverride: jest.fn(() => required) }) as any;

  const contextFor = (user: unknown) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  it('allows when no permissions are required (undefined metadata)', () => {
    const guard = new PermissionsGuard(makeReflector(undefined));
    expect(guard.canActivate(contextFor({ permissions: [] }))).toBe(true);
  });

  it('allows when the required-permissions list is empty', () => {
    const guard = new PermissionsGuard(makeReflector([]));
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });

  it('throws when the user is missing entirely', () => {
    const guard = new PermissionsGuard(makeReflector(['sales:read']));
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow('Insufficient permissions');
  });

  it('throws when the user has no permissions array', () => {
    const guard = new PermissionsGuard(makeReflector(['sales:read']));
    expect(() => guard.canActivate(contextFor({ sub: 'u1' }))).toThrow('Insufficient permissions');
  });

  it('throws when the user has an empty permissions array', () => {
    const guard = new PermissionsGuard(makeReflector(['sales:read']));
    expect(() => guard.canActivate(contextFor({ permissions: [] }))).toThrow('Insufficient permissions');
  });

  it('throws a "Required one of" error when none of the permissions match', () => {
    const guard = new PermissionsGuard(makeReflector(['sales:read', 'sales:write']));
    expect(() =>
      guard.canActivate(contextFor({ permissions: ['reports:read'] })),
    ).toThrow('Required one of: sales:read, sales:write');
  });

  it('allows when the user holds at least one required permission', () => {
    const guard = new PermissionsGuard(makeReflector(['sales:read', 'sales:write']));
    expect(guard.canActivate(contextFor({ permissions: ['sales:write'] }))).toBe(true);
  });
});
