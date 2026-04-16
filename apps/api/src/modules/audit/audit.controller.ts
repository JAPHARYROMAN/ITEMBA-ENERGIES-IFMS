import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type * as schema from '../../database/schema';
import { auditLog } from '../../database/schema/audit-log';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { getListParams } from '../../common/helpers/list.helper';
import { AuditListQueryDto } from './dto/audit-list-query.dto';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AuditController {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  @Get('logs')
  @Permissions('audit:read')
  @ApiOperation({ summary: 'List audit log entries' })
  @ApiResponse({ status: 200, description: 'Paginated list of audit log entries' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async listLogs(
    @Query()
    query: AuditListQueryDto,
  ) {
    const { offset, limit } = getListParams(query);
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.entity) conditions.push(eq(auditLog.entity, query.entity));
    if (query.action) conditions.push(eq(auditLog.action, query.action));
    if (query.actorUserId) conditions.push(eq(auditLog.actorUserId, query.actorUserId));
    if (query.dateFrom) conditions.push(gte(auditLog.createdAt, new Date(query.dateFrom)));
    if (query.dateTo) conditions.push(lte(auditLog.createdAt, new Date(query.dateTo)));

    const where = conditions.length ? and(...conditions) : undefined;

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(where),
    ]);

    return {
      data,
      total: countResult[0]?.count ?? 0,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    };
  }
}
