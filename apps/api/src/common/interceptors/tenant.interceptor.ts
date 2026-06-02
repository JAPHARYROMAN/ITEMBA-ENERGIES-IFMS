import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtPayloadUser } from '../../modules/auth/decorators/current-user.decorator';
import { extractTenantScope } from '../helpers/scope.helper';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayloadUser | undefined;

    // Skip if no user is authenticated (public routes)
    if (!user) {
      return next.handle();
    }

    // Skip auth and AI routes — they don't operate under tenant scope
    const url: string = request.url || '';
    if (
      url.startsWith('/api/auth') ||
      url.startsWith('/auth') ||
      url.startsWith('/api/ai') ||
      url.startsWith('/ai')
    ) {
      return next.handle();
    }

    const tenantScope = extractTenantScope(user.permissions ?? []);
    const permittedCompanyIds = tenantScope.companyIds;
    const requestedCompanyIds = [
      request.params?.companyId,
      request.body?.companyId,
      request.query?.companyId,
    ].filter(
      (companyId): companyId is string => typeof companyId === 'string' && companyId.length > 0,
    );

    if (permittedCompanyIds.length === 0) {
      if (requestedCompanyIds.length > 0) {
        throw new ForbiddenException('No company scopes are assigned to this account');
      }
      return next.handle();
    }

    for (const requestedCompanyId of requestedCompanyIds) {
      if (!permittedCompanyIds.includes(requestedCompanyId)) {
        throw new ForbiddenException(
          `Access to company ${requestedCompanyId} is strictly forbidden`,
        );
      }
    }

    request.tenantScope = tenantScope;

    return next.handle();
  }
}
