import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayloadUser } from '../decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayloadUser | undefined;
    if (!user?.permissions?.length) throw new ForbiddenException('Insufficient permissions');

    const hasOne = requiredPermissions.some((p) => user.permissions.includes(p));
    if (!hasOne) {
      throw new ForbiddenException(
        `Required one of: ${requiredPermissions.join(', ')}`,
      );
    }
    return true;
  }
}
