import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import {
  getCachedPermission,
  invalidatePermissionCache,
  setCachedPermission,
} from './strategies/permission-cache';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

interface AuthDbMock {
  db: any;
  chain: any;
  queue: (rows: unknown) => void;
  reset: () => void;
}

function createAuthDbMock(): AuthDbMock {
  const results: unknown[] = [];
  const next = (): unknown => (results.length > 0 ? results.shift() : []);

  const chain: any = {};
  const ret = (): any => chain;

  chain.from = jest.fn(ret);
  chain.where = jest.fn(ret);
  chain.orderBy = jest.fn(ret);
  chain.limit = jest.fn(ret);
  chain.offset = jest.fn(ret);
  chain.values = jest.fn(ret);
  chain.set = jest.fn(ret);
  chain.leftJoin = jest.fn(ret);
  chain.innerJoin = jest.fn(ret);
  chain.groupBy = jest.fn(ret);
  chain.having = jest.fn(ret);
  chain.onConflictDoNothing = jest.fn(() => Promise.resolve(next()));
  chain.returning = jest.fn(() => Promise.resolve(next()));
  chain.execute = jest.fn(() => Promise.resolve(next()));
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject?: (error: unknown) => unknown,
  ) => Promise.resolve(next()).then(resolve, reject);

  const db: any = {
    select: jest.fn(ret),
    selectDistinct: jest.fn(ret),
    insert: jest.fn(ret),
    update: jest.fn(ret),
    delete: jest.fn(ret),
    execute: jest.fn(() => Promise.resolve(next())),
  };

  return {
    db,
    chain,
    queue: (rows: unknown) => {
      results.push(rows);
    },
    reset: () => {
      results.length = 0;
    },
  };
}

describe('AuthService', () => {
  let drizzle: AuthDbMock;
  let configValues: Record<string, unknown>;
  let configService: { get: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let emailTransport: { send: jest.Mock };
  let service: AuthService;

  const activeUser = {
    id: 'user-1',
    email: 'user@ifms.test',
    name: 'Test User',
    passwordHash: 'stored-hash',
    status: 'active',
    failedLoginAttempts: 0,
    lockedUntil: null,
  };

  beforeEach(() => {
    drizzle = createAuthDbMock();
    configValues = {
      AUTH_SELF_SIGNUP_ENABLED: true,
      JWT_ACCESS_TTL: 321,
      JWT_REFRESH_DAYS: 2,
    };
    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        Object.prototype.hasOwnProperty.call(configValues, key)
          ? configValues[key]
          : defaultValue,
      ),
    };
    jwtService = { sign: jest.fn(() => 'signed-access-token') };
    emailTransport = { send: jest.fn().mockResolvedValue(undefined) };
    (bcrypt.compare as jest.Mock).mockReset();
    (bcrypt.hash as jest.Mock).mockReset();
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

    service = new AuthService(
      drizzle.db,
      configService as any,
      jwtService as any,
      emailTransport as any,
    );
    jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    drizzle.reset();
    invalidatePermissionCache();
    jest.restoreAllMocks();
  });

  describe('validateUser', () => {
    it('returns null when the user is missing or inactive', async () => {
      drizzle.queue([]);
      await expect(service.validateUser('USER@IFMS.TEST', 'password')).resolves.toBeNull();

      drizzle.queue([{ ...activeUser, status: 'inactive' }]);
      await expect(service.validateUser('user@ifms.test', 'password')).resolves.toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('throws when the account is still locked', async () => {
      drizzle.queue([
        {
          ...activeUser,
          lockedUntil: new Date(Date.now() + 3 * 60_000),
        },
      ]);

      await expect(service.validateUser('user@ifms.test', 'password')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('increments failed attempts and locks on the fifth bad password', async () => {
      drizzle.queue([{ ...activeUser, failedLoginAttempts: 4 }]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateUser(' user@ifms.test ', 'wrong-password')).resolves.toBeNull();

      expect(drizzle.db.update).toHaveBeenCalledTimes(1);
      expect(drizzle.chain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      );
    });

    it('returns the user and clears stale login failure state on success', async () => {
      drizzle.queue([
        {
          ...activeUser,
          failedLoginAttempts: 2,
          lockedUntil: new Date(Date.now() - 1_000),
        },
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.validateUser('user@ifms.test', 'password')).resolves.toEqual({
        id: activeUser.id,
        email: activeUser.email,
        name: activeUser.name,
      });
      expect(drizzle.chain.set).toHaveBeenCalledWith({
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    });
  });

  describe('login and authorization context', () => {
    it('signs access tokens with role permissions and branch/company scopes', async () => {
      drizzle.queue([
        { id: 'role-1', code: 'manager' },
        { id: 'role-2', code: 'cashier' },
      ]);
      drizzle.queue([{ code: 'sales:read' }, { code: 'sales:read' }]);
      drizzle.queue([{ branchId: 'branch-1' }]);
      drizzle.queue([{ companyId: 'company-1' }]);
      drizzle.queue([]);

      const tokenPair = await service.login({
        id: 'user-1',
        email: 'user@ifms.test',
        name: 'Test User',
      });

      expect(tokenPair).toEqual({
        accessToken: 'signed-access-token',
        refreshToken: expect.any(String),
        expiresIn: 321,
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-1',
          email: 'user@ifms.test',
          type: 'access',
          permissions: ['sales:read', 'company:company-1', 'branch:branch-1'],
        }),
        { expiresIn: 321 },
      );
      expect(drizzle.chain.values).toHaveBeenLastCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          token: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
    });

    it('adds all tenant scopes for manager users with no explicit branches', async () => {
      drizzle.queue([
        { id: 'user-1', email: 'user@ifms.test', name: 'Test User', status: 'active' },
      ]);
      drizzle.queue([{ id: 'role-1', code: 'manager' }]);
      drizzle.queue([{ code: 'setup:write' }]);
      drizzle.queue([]);
      drizzle.queue([{ companyId: 'company-1' }]);
      drizzle.queue([{ branchId: 'branch-1' }]);

      await expect(service.getMe('user-1')).resolves.toEqual(
        expect.objectContaining({
          id: 'user-1',
          permissions: ['setup:write', 'company:company-1', 'branch:branch-1'],
        }),
      );
    });
  });

  describe('signup', () => {
    it('hides signup when self-service signup is disabled', async () => {
      configValues.AUTH_SELF_SIGNUP_ENABLED = false;

      await expect(
        service.signup({
          name: 'Test User',
          email: 'user@ifms.test',
          password: 'Password123!',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate email addresses', async () => {
      drizzle.queue([{ id: 'existing-user' }]);

      await expect(
        service.signup({
          name: 'Test User',
          email: ' USER@IFMS.TEST ',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('normalizes and inserts a new self-service user', async () => {
      drizzle.queue([]);

      await expect(
        service.signup({
          name: ' Test User ',
          email: ' USER@IFMS.TEST ',
          password: 'Password123!',
        }),
      ).resolves.toEqual({
        message: 'Account created successfully. You can now sign in.',
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 10);
      expect(drizzle.chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@ifms.test',
          passwordHash: 'new-hash',
          name: 'Test User',
          status: 'active',
        }),
      );
    });
  });

  describe('password reset flows', () => {
    it('does nothing for unknown forgot-password emails', async () => {
      drizzle.queue([]);

      await service.forgotPassword('missing@ifms.test');

      expect(drizzle.db.update).not.toHaveBeenCalled();
      expect(emailTransport.send).not.toHaveBeenCalled();
    });

    it('stores a reset token but skips mail when SMTP is not configured', async () => {
      drizzle.queue([{ id: 'user-1', email: 'user@ifms.test', name: 'Test User' }]);
      drizzle.queue([]);
      drizzle.queue([]);

      await service.forgotPassword('USER@IFMS.TEST');

      expect(drizzle.db.update).toHaveBeenCalledTimes(1);
      expect(drizzle.db.insert).toHaveBeenCalledTimes(1);
      expect(emailTransport.send).not.toHaveBeenCalled();
      expect((service as any).logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('SMTP is not configured'),
      );
    });

    it('sends a reset email with the configured frontend origin', async () => {
      configValues.SMTP_HOST = 'smtp.ifms.test';
      configValues.FRONTEND_ORIGIN = ' https://app.ifms.test, http://localhost:3000 ';
      drizzle.queue([{ id: 'user-1', email: 'user@ifms.test', name: 'Test User' }]);
      drizzle.queue([]);
      drizzle.queue([]);

      await service.forgotPassword(' user@ifms.test ');

      expect(emailTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@ifms.test',
          subject: 'Reset your IFMS password',
          body: expect.stringContaining(
            'https://app.ifms.test/reset-password?token=',
          ),
        }),
      );
    });

    it('rejects missing, used, or expired reset tokens', async () => {
      drizzle.queue([]);
      await expect(service.resetPassword('missing-token', 'Password123!')).rejects.toThrow(
        BadRequestException,
      );

      drizzle.queue([
        {
          id: 'reset-1',
          userId: 'user-1',
          expiresAt: new Date(Date.now() - 1_000),
          usedAt: null,
        },
      ]);
      await expect(service.resetPassword('expired-token', 'Password123!')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('updates the password, consumes the reset token, and revokes refresh tokens', async () => {
      drizzle.queue([
        {
          id: 'reset-1',
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
        },
      ]);

      await expect(service.resetPassword('good-token', 'Password123!')).resolves.toEqual({
        message:
          'Password has been reset successfully. Please sign in with your new password.',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 10);
      expect(drizzle.db.update).toHaveBeenCalledTimes(3);
      expect(drizzle.chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'new-hash', updatedAt: expect.any(Date) }),
      );
      expect(drizzle.chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ usedAt: expect.any(Date) }),
      );
      expect(drizzle.chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });

  describe('changePassword', () => {
    it('throws when the user is missing or the current password is wrong', async () => {
      drizzle.queue([]);
      await expect(
        service.changePassword('missing-user', 'old-password', 'Password123!'),
      ).rejects.toThrow(NotFoundException);

      drizzle.queue([{ id: 'user-1', passwordHash: 'stored-hash' }]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.changePassword('user-1', 'bad-password', 'Password123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates the password when the current password matches', async () => {
      drizzle.queue([{ id: 'user-1', passwordHash: 'stored-hash' }]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changePassword('user-1', 'old-password', 'Password123!'),
      ).resolves.toEqual({ message: 'Password changed successfully.' });
      expect(drizzle.chain.set).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'new-hash', updatedAt: expect.any(Date) }),
      );
    });
  });

  describe('refresh and logout', () => {
    it('rejects missing, revoked, expired, or orphaned refresh tokens', async () => {
      drizzle.queue([]);
      await expect(service.refresh('refresh-token')).rejects.toThrow(UnauthorizedException);

      drizzle.queue([
        {
          id: 'token-1',
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(),
        },
      ]);
      await expect(service.refresh('refresh-token')).rejects.toThrow(UnauthorizedException);

      drizzle.queue([
        {
          id: 'token-1',
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        },
      ]);
      drizzle.queue([]);
      await expect(service.refresh('refresh-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rotates a valid refresh token through login', async () => {
      const tokenPair = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 321,
      };
      jest.spyOn(service, 'login').mockResolvedValue(tokenPair);
      drizzle.queue([
        {
          id: 'token-1',
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        },
      ]);
      drizzle.queue([{ id: 'user-1', email: 'user@ifms.test', name: 'Test User' }]);

      await expect(service.refresh('refresh-token')).resolves.toEqual(tokenPair);

      expect(drizzle.chain.set).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
      expect(service.login).toHaveBeenCalledWith({
        id: 'user-1',
        email: 'user@ifms.test',
        name: 'Test User',
      });
    });

    it('revokes a refresh token on logout', async () => {
      await service.logout('refresh-token');

      expect(drizzle.db.update).toHaveBeenCalledTimes(1);
      expect(drizzle.chain.set).toHaveBeenCalledWith({
        revokedAt: expect.any(Date),
      });
    });
  });

  describe('profile and user permissions', () => {
    it('returns null when getMe cannot find the user', async () => {
      drizzle.queue([]);
      await expect(service.getMe('missing-user')).resolves.toBeNull();
    });

    it('returns null for inactive users in strategy lookups', async () => {
      drizzle.queue([{ id: 'user-1', email: 'user@ifms.test', status: 'inactive' }]);
      await expect(service.getUserWithPermissions('user-1')).resolves.toBeNull();
    });

    it('deduplicates permissions and skips tenant scopes for non-managers without branches', async () => {
      drizzle.queue([{ id: 'user-1', email: 'user@ifms.test', status: 'active' }]);
      drizzle.queue([{ id: 'role-1', code: 'cashier' }]);
      drizzle.queue([{ code: 'sales:read' }, { code: 'sales:read' }]);
      drizzle.queue([]);

      await expect(service.getUserWithPermissions('user-1')).resolves.toEqual({
        id: 'user-1',
        email: 'user@ifms.test',
        permissions: ['sales:read'],
      });
    });
  });

  describe('admin user and role operations', () => {
    it('lists users with assigned role codes', async () => {
      drizzle.queue([
        { id: 'user-1', email: 'one@ifms.test', name: 'One', status: 'active' },
        { id: 'user-2', email: 'two@ifms.test', name: 'Two', status: 'inactive' },
      ]);
      drizzle.queue([{ code: 'manager' }]);
      drizzle.queue([{ code: 'cashier' }, { code: 'auditor' }]);

      await expect(service.listUsers()).resolves.toEqual([
        {
          id: 'user-1',
          email: 'one@ifms.test',
          name: 'One',
          status: 'active',
          roles: ['manager'],
        },
        {
          id: 'user-2',
          email: 'two@ifms.test',
          name: 'Two',
          status: 'inactive',
          roles: ['cashier', 'auditor'],
        },
      ]);
    });

    it('rejects duplicate admin-created users', async () => {
      drizzle.queue([{ id: 'existing-user' }]);

      await expect(
        service.createUser({
          name: 'Test User',
          email: 'user@ifms.test',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates an admin user and assigns an existing role', async () => {
      drizzle.queue([]);
      drizzle.queue([{ id: 'user-1' }]);
      drizzle.queue([{ id: 'role-1' }]);
      drizzle.queue([]);

      await expect(
        service.createUser({
          name: ' Test User ',
          email: ' USER@IFMS.TEST ',
          password: 'Password123!',
          roleCode: 'manager',
        }),
      ).resolves.toEqual({ id: 'user-1' });

      expect(drizzle.chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@ifms.test',
          passwordHash: 'new-hash',
          name: 'Test User',
          status: 'active',
        }),
      );
      expect(drizzle.chain.values).toHaveBeenCalledWith({
        userId: 'user-1',
        roleId: 'role-1',
      });
    });

    it('updates user status, revokes tokens for inactive users, and clears cached permissions', async () => {
      setCachedPermission('user-1', {
        sub: 'user-1',
        email: 'user@ifms.test',
        permissions: ['setup:write'],
      });
      drizzle.queue([]);
      drizzle.queue([]);

      await service.updateUserStatus('user-1', 'inactive');

      expect(drizzle.db.update).toHaveBeenCalledTimes(2);
      expect(getCachedPermission('user-1')).toBeNull();
    });

    it('throws when assigning a missing role', async () => {
      drizzle.queue([]);
      await expect(service.assignRole('user-1', 'missing')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('assigns roles idempotently and clears cached permissions', async () => {
      setCachedPermission('user-1', {
        sub: 'user-1',
        email: 'user@ifms.test',
        permissions: ['setup:write'],
      });
      drizzle.queue([{ id: 'role-1' }]);
      drizzle.queue([]);

      await service.assignRole('user-1', 'manager');

      expect(drizzle.chain.values).toHaveBeenCalledWith({
        userId: 'user-1',
        roleId: 'role-1',
      });
      expect(drizzle.chain.onConflictDoNothing).toHaveBeenCalled();
      expect(getCachedPermission('user-1')).toBeNull();
    });

    it('removes existing roles and clears cached permissions', async () => {
      setCachedPermission('user-1', {
        sub: 'user-1',
        email: 'user@ifms.test',
        permissions: ['setup:write'],
      });
      drizzle.queue([{ id: 'role-1' }]);
      drizzle.queue([]);

      await service.removeRole('user-1', 'manager');

      expect(drizzle.db.delete).toHaveBeenCalledTimes(1);
      expect(getCachedPermission('user-1')).toBeNull();
    });

    it('returns silently when removing a role that does not exist', async () => {
      drizzle.queue([]);

      await service.removeRole('user-1', 'missing');

      expect(drizzle.db.delete).not.toHaveBeenCalled();
    });

    it('lists roles with distinct permission codes', async () => {
      drizzle.queue([
        {
          id: 'role-1',
          code: 'manager',
          name: 'Manager',
          description: 'Can manage setup',
        },
        {
          id: 'role-2',
          code: 'cashier',
          name: 'Cashier',
          description: null,
        },
      ]);
      drizzle.queue([{ code: 'setup:write' }]);
      drizzle.queue([{ code: 'sales:read' }]);

      await expect(service.listRoles()).resolves.toEqual([
        {
          id: 'role-1',
          code: 'manager',
          name: 'Manager',
          description: 'Can manage setup',
          permissions: ['setup:write'],
        },
        {
          id: 'role-2',
          code: 'cashier',
          name: 'Cashier',
          description: null,
          permissions: ['sales:read'],
        },
      ]);
    });
  });
});
