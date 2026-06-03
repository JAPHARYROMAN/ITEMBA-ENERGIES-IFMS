import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const contextFor = () =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({}) }),
    }) as any;

  describe('canActivate', () => {
    it('short-circuits to true for public routes without invoking passport', () => {
      const guard = new JwtAuthGuard({ getAllAndOverride: jest.fn(() => true) } as any);
      expect(guard.canActivate(contextFor())).toBe(true);
    });

    it('delegates to the passport AuthGuard for protected routes', () => {
      const guard = new JwtAuthGuard({ getAllAndOverride: jest.fn(() => false) } as any);
      const superSpy = jest
        .spyOn(AuthGuard('jwt').prototype as any, 'canActivate')
        .mockReturnValue('delegated' as any);

      expect(guard.canActivate(contextFor())).toBe('delegated');
      expect(superSpy).toHaveBeenCalled();
      superSpy.mockRestore();
    });

    it('delegates when the public metadata is undefined (falsy)', () => {
      const guard = new JwtAuthGuard({ getAllAndOverride: jest.fn(() => undefined) } as any);
      const superSpy = jest
        .spyOn(AuthGuard('jwt').prototype as any, 'canActivate')
        .mockReturnValue(true as any);

      expect(guard.canActivate(contextFor())).toBe(true);
      superSpy.mockRestore();
    });
  });

  describe('handleRequest', () => {
    const guard = new JwtAuthGuard({ getAllAndOverride: jest.fn() } as any);

    it('rethrows an upstream error', () => {
      const err = new Error('strategy exploded');
      expect(() => guard.handleRequest(err, false as any)).toThrow('strategy exploded');
    });

    it('throws UnauthorizedException when no user is resolved', () => {
      expect(() => guard.handleRequest(null, false as any)).toThrow(UnauthorizedException);
      expect(() => guard.handleRequest(null, false as any)).toThrow('Invalid or missing access token');
    });

    it('returns the user when authentication succeeds', () => {
      const user = { sub: 'u1' };
      expect(guard.handleRequest(null, user as any)).toBe(user);
    });
  });
});
