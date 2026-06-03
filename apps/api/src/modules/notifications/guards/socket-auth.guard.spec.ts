import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { SocketAuthGuard } from './socket-auth.guard';

const makeSocket = (token?: string, queryToken?: string) =>
  ({
    handshake: {
      auth: token === undefined ? {} : { token },
      query: queryToken === undefined ? {} : { token: queryToken },
    },
  }) as any;

describe('SocketAuthGuard', () => {
  let jwtService: jest.Mocked<Pick<JwtService, 'verify'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let guard: SocketAuthGuard;

  beforeEach(() => {
    jwtService = { verify: jest.fn() } as any;
    configService = { get: jest.fn().mockReturnValue('jwt-secret') } as any;
    guard = new SocketAuthGuard(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('validates bearer tokens from handshake auth', async () => {
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      permissions: ['notifications:test'],
    } as any);

    await expect(guard.validateSocket(makeSocket('Bearer token-1'))).resolves.toEqual({
      userId: 'user-1',
      permissions: ['notifications:test'],
    });
    expect(jwtService.verify).toHaveBeenCalledWith('token-1', {
      secret: 'jwt-secret',
    });
  });

  it('falls back to query tokens and strips bearer prefixes', async () => {
    jwtService.verify.mockReturnValue({
      sub: 'user-2',
      permissions: [],
    } as any);

    await guard.validateSocket(makeSocket(undefined, 'Bearer query-token'));

    expect(jwtService.verify).toHaveBeenCalledWith('query-token', {
      secret: 'jwt-secret',
    });
  });

  it('rejects missing tokens, invalid payloads and verify failures', async () => {
    await expect(guard.validateSocket(makeSocket())).rejects.toThrow(
      UnauthorizedException,
    );

    jwtService.verify.mockReturnValueOnce({ sub: 'user-1' } as any);
    await expect(guard.validateSocket(makeSocket('token'))).rejects.toThrow(
      UnauthorizedException,
    );

    jwtService.verify.mockImplementationOnce(() => {
      throw new Error('bad signature');
    });
    await expect(guard.validateSocket(makeSocket('token'))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
