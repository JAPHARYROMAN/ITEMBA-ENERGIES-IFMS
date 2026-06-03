import { UnauthorizedException } from '@nestjs/common';
import type { AuthService } from '../auth.service';
import { JwtStrategy } from './jwt.strategy';
import { invalidatePermissionCache, setCachedPermission } from './permission-cache';

describe('JwtStrategy', () => {
  let authService: jest.Mocked<Pick<AuthService, 'getUserWithPermissions'>>;
  let strategy: JwtStrategy;

  beforeEach(() => {
    invalidatePermissionCache();
    authService = {
      getUserWithPermissions: jest.fn(),
    };
    strategy = new JwtStrategy(
      { get: jest.fn(() => 'jwt-secret') } as any,
      authService as unknown as AuthService,
    );
  });

  afterEach(() => {
    invalidatePermissionCache();
  });

  it('rejects non-access tokens', async () => {
    await expect(
      strategy.validate({ sub: 'user-1', email: 'user@ifms.test', type: 'refresh' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns cached permission payloads without hitting the auth service', async () => {
    const cached = {
      sub: 'user-1',
      email: 'user@ifms.test',
      permissions: ['setup:write'],
    };
    setCachedPermission('user-1', cached);

    await expect(
      strategy.validate({ sub: 'user-1', email: 'user@ifms.test', type: 'access' }),
    ).resolves.toEqual(cached);
    expect(authService.getUserWithPermissions).not.toHaveBeenCalled();
  });

  it('loads active users, caches permissions, and reuses the cached result', async () => {
    authService.getUserWithPermissions.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@ifms.test',
      permissions: ['sales:read'],
    });

    await expect(
      strategy.validate({ sub: 'user-1', email: 'user@ifms.test', type: 'access' }),
    ).resolves.toEqual({
      sub: 'user-1',
      email: 'user@ifms.test',
      permissions: ['sales:read'],
    });
    await expect(
      strategy.validate({ sub: 'user-1', email: 'user@ifms.test', type: 'access' }),
    ).resolves.toEqual({
      sub: 'user-1',
      email: 'user@ifms.test',
      permissions: ['sales:read'],
    });
    expect(authService.getUserWithPermissions).toHaveBeenCalledTimes(1);
  });

  it('rejects tokens for users that no longer resolve', async () => {
    authService.getUserWithPermissions.mockResolvedValueOnce(null);

    await expect(
      strategy.validate({ sub: 'missing-user', email: 'missing@ifms.test', type: 'access' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
