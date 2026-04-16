import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtPayloadUser } from '../../modules/auth/decorators/current-user.decorator';

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

    const permittedCompanyIds = [
      ...new Set(
        (user.permissions ?? [])
          ?.map((p) => p.match(/^company:([0-9a-fA-F-]{36})$/)?.[1])
          .filter(Boolean) as string[],
      ),
    ];
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

    // Implicitly scope queries to the user's ONLY tenant if not explicitly provided
    if (permittedCompanyIds.length === 1) {
      if (
        request.body &&
        typeof request.body === 'object' &&
        !request.body.companyId &&
        request.method !== 'GET' &&
        request.method !== 'DELETE'
      ) {
        request.body.companyId = permittedCompanyIds[0];
      }
      if (
        request.query &&
        typeof request.query === 'object' &&
        !request.query.companyId &&
        request.method === 'GET'
      ) {
        request.query.companyId = permittedCompanyIds[0];
      }
    }

    return next.handle();
  }
}
