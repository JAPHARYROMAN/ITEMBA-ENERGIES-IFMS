import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayloadUser } from '../decorators/current-user.decorator';
import { extractTenantScope } from '../../../common/helpers/scope.helper';
/**
 * Guard that validates the requesting user has access to the branch
 * specified in the request (body.branchId, query.branchId, or params.branchId).
 *
 * The user's allowed branches are encoded in the JWT as `branch:<uuid>` entries
 * inside the permissions array.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayloadUser | undefined;
    if (!user) throw new ForbiddenException('Authentication required');

    const requestedBranchIds = [
      request.params?.branchId,
      request.body?.branchId,
      request.query?.branchId,
    ].filter((branchId): branchId is string => typeof branchId === 'string' && branchId.length > 0);

    // If no branchId in the request, allow through (non-branch-scoped endpoint)
    if (requestedBranchIds.length === 0) return true;

    const { branchIds } = extractTenantScope(user.permissions ?? []);
    if (branchIds.length === 0) {
      throw new ForbiddenException('No branch scopes are assigned to this account');
    }

    for (const branchId of requestedBranchIds) {
      if (!branchIds.includes(branchId)) {
        throw new ForbiddenException(
          'You do not have access to the requested branch',
        );
      }
    }

    return true;
  }
}
