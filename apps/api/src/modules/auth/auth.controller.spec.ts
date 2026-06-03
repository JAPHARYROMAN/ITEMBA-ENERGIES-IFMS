import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import type { AuthService, TokenPair } from './auth.service';

describe('AuthController', () => {
  let service: jest.Mocked<
    Pick<
      AuthService,
      | 'validateUser'
      | 'login'
      | 'isSelfSignupEnabled'
      | 'signup'
      | 'forgotPassword'
      | 'resetPassword'
      | 'refresh'
      | 'logout'
      | 'getMe'
      | 'changePassword'
      | 'listUsers'
      | 'createUser'
      | 'updateUserStatus'
      | 'assignRole'
      | 'removeRole'
      | 'listRoles'
    >
  >;
  let controller: AuthController;

  const tokenPair: TokenPair = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
  };
  const user = { sub: 'user-1', email: 'user@ifms.test', permissions: [] };

  beforeEach(() => {
    service = {
      validateUser: jest.fn(),
      login: jest.fn(),
      isSelfSignupEnabled: jest.fn(() => true),
      signup: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
      changePassword: jest.fn(),
      listUsers: jest.fn(),
      createUser: jest.fn(),
      updateUserStatus: jest.fn(),
      assignRole: jest.fn(),
      removeRole: jest.fn(),
      listRoles: jest.fn(),
    } as any;
    controller = new AuthController(service as unknown as AuthService);
  });

  it('logs in valid users and rejects invalid credentials', async () => {
    service.validateUser.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@ifms.test',
      name: 'Test User',
    });
    service.login.mockResolvedValueOnce(tokenPair);

    await expect(
      controller.login({ email: 'user@ifms.test', password: 'Password123!' }),
    ).resolves.toEqual(tokenPair);
    expect(service.login).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'user@ifms.test',
      name: 'Test User',
    });

    service.validateUser.mockResolvedValueOnce(null);
    await expect(
      controller.login({ email: 'user@ifms.test', password: 'bad-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('reports signup availability through the OPTIONS endpoint', () => {
    expect(controller.signupAvailability()).toBeUndefined();

    service.isSelfSignupEnabled.mockReturnValue(false);
    expect(() => controller.signupAvailability()).toThrow(NotFoundException);
  });

  it('delegates public account flows', async () => {
    service.signup.mockResolvedValueOnce({ message: 'created' });
    await expect(
      controller.signup({
        name: 'Test User',
        email: 'user@ifms.test',
        password: 'Password123!',
      }),
    ).resolves.toEqual({ message: 'created' });

    service.forgotPassword.mockResolvedValueOnce(undefined);
    await expect(
      controller.forgotPassword({ email: 'user@ifms.test' }),
    ).resolves.toEqual({
      message: 'If an account exists with that email, reset instructions have been sent.',
    });

    service.resetPassword.mockResolvedValueOnce({ message: 'reset' });
    await expect(
      controller.resetPassword({ token: 'reset-token', newPassword: 'Password123!' }),
    ).resolves.toEqual({ message: 'reset' });

    service.refresh.mockResolvedValueOnce(tokenPair);
    await expect(controller.refresh({ refreshToken: 'refresh-token' })).resolves.toEqual(
      tokenPair,
    );

    service.logout.mockResolvedValueOnce(undefined);
    await expect(controller.logout({ refreshToken: 'refresh-token' })).resolves.toEqual({
      message: 'Logged out',
    });
  });

  it('returns the current user or rejects missing profiles', async () => {
    service.getMe.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@ifms.test',
      name: 'Test User',
      status: 'active',
      permissions: ['setup:write'],
    });

    await expect(controller.me(user)).resolves.toEqual(
      expect.objectContaining({ id: 'user-1', permissions: ['setup:write'] }),
    );

    service.getMe.mockResolvedValueOnce(null);
    await expect(controller.me(user)).rejects.toThrow(UnauthorizedException);
  });

  it('changes the current user password', async () => {
    service.changePassword.mockResolvedValueOnce({ message: 'changed' });

    await expect(
      controller.changePassword(user, {
        currentPassword: 'old-password',
        newPassword: 'Password123!',
      }),
    ).resolves.toEqual({ message: 'changed' });
    expect(service.changePassword).toHaveBeenCalledWith(
      'user-1',
      'old-password',
      'Password123!',
    );
  });

  it('delegates admin user and role endpoints', async () => {
    service.listUsers.mockResolvedValueOnce([{ id: 'user-1' } as any]);
    await expect(controller.listUsers()).resolves.toEqual([{ id: 'user-1' }]);

    service.createUser.mockResolvedValueOnce({ id: 'user-2' });
    await expect(
      controller.createUser({
        name: 'Test User',
        email: 'user@ifms.test',
        password: 'Password123!',
        roleCode: 'manager',
      }),
    ).resolves.toEqual({ id: 'user-2' });

    service.updateUserStatus.mockResolvedValueOnce(undefined);
    await expect(
      controller.updateUserStatus('user-1', { status: 'inactive' }),
    ).resolves.toEqual({ message: 'User status updated to inactive' });

    service.assignRole.mockResolvedValueOnce(undefined);
    await expect(
      controller.assignRole('user-1', { roleCode: 'manager' }),
    ).resolves.toEqual({ message: 'Role manager assigned' });

    service.removeRole.mockResolvedValueOnce(undefined);
    await expect(controller.removeRole('user-1', 'manager')).resolves.toEqual({
      message: 'Role manager removed',
    });

    service.listRoles.mockResolvedValueOnce([{ code: 'manager' } as any]);
    await expect(controller.listRoles()).resolves.toEqual([{ code: 'manager' }]);
  });
});
