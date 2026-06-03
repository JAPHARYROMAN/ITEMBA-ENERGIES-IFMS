import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssignRoleDto, UpdateUserStatusDto } from './admin.dto';
import { ChangePasswordDto } from './change-password.dto';
import { CreateUserDto } from './create-user.dto';
import { ForgotPasswordDto } from './forgot-password.dto';
import { LoginDto } from './login.dto';
import { RefreshDto } from './refresh.dto';
import { ResetPasswordDto } from './reset-password.dto';
import { SignupDto } from './signup.dto';

async function errorsFor<T extends object>(
  cls: new () => T,
  payload: object,
): Promise<string[]> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object);
  return errors.map((error) => error.property);
}

describe('auth DTO validation', () => {
  const strongPassword = 'Password123!';

  it('validates login email and password shape', async () => {
    expect(
      await errorsFor(LoginDto, {
        email: 'user@ifms.test',
        password: 'password123',
      }),
    ).toEqual([]);
    expect(await errorsFor(LoginDto, { email: 'bad-email', password: 'short' })).toEqual([
      'email',
      'password',
    ]);
  });

  it('validates signup payloads and password complexity', async () => {
    expect(
      await errorsFor(SignupDto, {
        name: 'Test User',
        email: 'user@ifms.test',
        password: strongPassword,
      }),
    ).toEqual([]);
    expect(
      await errorsFor(SignupDto, {
        name: 'T',
        email: 'not-an-email',
        password: 'password',
      }),
    ).toEqual(['name', 'email', 'password']);
  });

  it('inherits signup validation for admin-created users and accepts optional roles', async () => {
    expect(
      await errorsFor(CreateUserDto, {
        name: 'Test User',
        email: 'user@ifms.test',
        password: strongPassword,
        roleCode: 'manager',
      }),
    ).toEqual([]);
    expect(
      await errorsFor(CreateUserDto, {
        name: 'Test User',
        email: 'user@ifms.test',
        password: strongPassword,
        roleCode: 123,
      }),
    ).toContain('roleCode');
  });

  it('validates forgot-password and refresh payloads', async () => {
    expect(await errorsFor(ForgotPasswordDto, { email: 'user@ifms.test' })).toEqual([]);
    expect(await errorsFor(ForgotPasswordDto, { email: 'bad' })).toContain('email');

    expect(await errorsFor(RefreshDto, { refreshToken: 'refresh-token' })).toEqual([]);
    expect(await errorsFor(RefreshDto, { refreshToken: '' })).toContain('refreshToken');
  });

  it('validates reset-password and change-password complexity rules', async () => {
    expect(
      await errorsFor(ResetPasswordDto, {
        token: 'reset-token',
        newPassword: strongPassword,
      }),
    ).toEqual([]);
    expect(
      await errorsFor(ResetPasswordDto, {
        token: 'reset-token',
        newPassword: 'weakpass',
      }),
    ).toContain('newPassword');

    expect(
      await errorsFor(ChangePasswordDto, {
        currentPassword: 'old-password',
        newPassword: strongPassword,
      }),
    ).toEqual([]);
    expect(
      await errorsFor(ChangePasswordDto, {
        currentPassword: 'old-password',
        newPassword: 'weakpass',
      }),
    ).toContain('newPassword');
  });

  it('validates admin status and role DTOs', async () => {
    expect(await errorsFor(UpdateUserStatusDto, { status: 'active' })).toEqual([]);
    expect(await errorsFor(UpdateUserStatusDto, { status: 'inactive' })).toEqual([]);
    expect(await errorsFor(UpdateUserStatusDto, { status: 'archived' })).toContain('status');

    expect(await errorsFor(AssignRoleDto, { roleCode: 'manager' })).toEqual([]);
    expect(await errorsFor(AssignRoleDto, { roleCode: '' })).toContain('roleCode');
    expect(await errorsFor(AssignRoleDto, { roleCode: 'x'.repeat(101) })).toContain(
      'roleCode',
    );
  });
});
